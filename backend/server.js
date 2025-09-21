require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');

// --- Firebase Admin Init ---
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

    // 🔥 Fix: convert \\n to real newlines
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    console.log("✅ Using service account from ENV");
  } else {
    serviceAccount = require('./serviceAccountKey.json');
    console.log("✅ Using service account from file");
  }
} catch (err) {
  console.error("❌ Failed to load Firebase service account", err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// --- Twilio Init ---
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// --- Express Setup ---
const app = express();

const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5500",
  "https://women-saftey-a3bac.web.app", // Firebase hosting frontend
  "https://women-safety-app-78gl.onrender.com" // Render backend
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("❌ CORS blocked for origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json({ limit: '1mb' }));

// --- Utils ---
function formatToE164(phone) {
  if (/^\+\d{10,15}$/.test(phone)) return phone;
  return '+' + phone.replace(/\D/g, '');
}

// --- Endpoints ---

// 1. Register FCM Token
app.post('/register-token', async (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token) return res.status(400).json({ error: 'userId and token required' });

  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    let tokens = userDoc.exists && Array.isArray(userDoc.data().tokens)
      ? userDoc.data().tokens : [];

    if (!tokens.includes(token)) {
      tokens.push(token);
      await userRef.set({ tokens }, { merge: true });
      console.log(`[Token] Registered for ${userId}`);
    }
    res.json({ success: true, tokens });
  } catch (err) {
    console.error('Error registering token:', err);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

// 2. Send SOS Alert
app.post('/alert', async (req, res) => {
  const { userId, lat, lon } = req.body;
  if (!userId || lat === undefined || lon === undefined)
    return res.status(400).json({ error: 'userId, lat, lon required' });

  let smsResults = [];
  let pushResults = { successCount: 0, failureCount: 0, responses: [] };
  let alertId = uuidv4();

  try {
    // Save to DB
    const alertData = {
      alertId, userId, lat, lon,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active',
    };
    await db.collection('alerts').doc(alertId).set(alertData);
    console.log(`[Alert] Created alert ${alertId} for ${userId}`);

    // Contacts
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const contacts = userDoc.exists && Array.isArray(userDoc.data().contacts)
      ? userDoc.data().contacts : [];

    const smsBody = `🚨 SOS Alert!\nUser: ${userId}\nLocation: https://maps.google.com/?q=${lat},${lon}`;

    for (const c of contacts) {
      try {
        const toNumber = formatToE164(c.phone);
        const msg = await twilioClient.messages.create({
          body: smsBody,
          from: TWILIO_PHONE_NUMBER,
          to: toNumber,
        });
        smsResults.push({ contact: toNumber, status: 'sent', sid: msg.sid });
      } catch (err) {
        smsResults.push({ contact: c.phone, status: 'failed', error: err.message });
      }
    }

    // Push Notifications
    const tokens = userDoc.exists && Array.isArray(userDoc.data().tokens)
      ? userDoc.data().tokens : [];

    if (tokens.length > 0) {
      try {
        const msg = {
          notification: { title: `🚨 SOS from ${userDoc.data().name || userId}`, body: "📍 Tap to view live location" },
          webpush: { fcmOptions: { link: `https://maps.google.com/?q=${lat},${lon}` } },
          data: { alertId, lat: String(lat), lon: String(lon), mapsUrl: `https://maps.google.com/?q=${lat},${lon}` },
          tokens
        };
        const resp = await admin.messaging().sendEachForMulticast(msg);
        pushResults = {
          successCount: resp.successCount,
          failureCount: resp.failureCount,
          responses: resp.responses.map((r, i) => ({
            token: tokens[i], success: r.success, error: r.error?.message || null
          }))
        };
      } catch (err) {
        pushResults.error = err.message;
      }
    }

    res.json({ message: '🚨 SOS sent!', alertId, smsResults, pushResults });
  } catch (err) {
    console.error('Error creating alert:', err);
    res.status(500).json({ error: 'Failed to create alert', alertId, smsResults, pushResults });
  }
});

// 3. Send Test Push
app.post('/send-test-notification', async (req, res) => {
  const { userId, title, body } = req.body;
  if (!userId || !title || !body)
    return res.status(400).json({ error: 'userId, title, body required' });

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const tokens = userDoc.exists && Array.isArray(userDoc.data().tokens) ? userDoc.data().tokens : [];
    if (!tokens.length) return res.status(404).json({ error: 'No tokens found' });

    const msg = { notification: { title, body }, tokens };
    const resp = await admin.messaging().sendMulticast(msg);
    res.json({ success: true, sent: resp.successCount, failed: resp.failureCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// 4. Get Alerts
app.get('/alerts', async (req, res) => {
  try {
    const snap = await db.collection('alerts').orderBy('createdAt', 'desc').get();
    res.json({ alerts: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// 5. Cancel Alert
app.delete('/alert/:id', async (req, res) => {
  try {
    const alertRef = db.collection('alerts').doc(req.params.id);
    const alertDoc = await alertRef.get();
    if (!alertDoc.exists) return res.status(404).json({ error: 'Alert not found' });
    await alertRef.update({ status: 'cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, alertId: req.params.id });
  } catch {
    res.status(500).json({ error: 'Failed to cancel alert' });
  }
});

// --- Start ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Women Safety backend running on port ${PORT}`);
});