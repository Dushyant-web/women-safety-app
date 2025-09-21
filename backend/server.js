require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');

// Initialize Firebase Admin SDK
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : require('./serviceAccountKey.json'); // fallback to file if not using env
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Twilio setup
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const app = express();

// ✅ FIXED CORS CONFIG
const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5500",
  "https://women-saftey-a3bac.web.app" // your Firebase hosting domain
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

// Helper function to enforce E.164 format for phone numbers
function formatToE164(phone) {
  if (/^\+\d{10,15}$/.test(phone)) {
    return phone;
  }
  let digits = phone.replace(/\D/g, '');
  return '+' + digits;
}

// Endpoint 1: Register FCM Token
app.post('/register-token', async (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token) {
    return res.status(400).json({ error: 'userId and token required' });
  }
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    let tokens = [];
    if (userDoc.exists && Array.isArray(userDoc.data().tokens)) {
      tokens = userDoc.data().tokens;
    }
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

// Endpoint 2: Send SOS Alert
app.post('/alert', async (req, res) => {
  const { userId, lat, lon } = req.body;
  if (!userId || lat === undefined || lon === undefined) {
    return res.status(400).json({ error: 'userId, lat, lon required' });
  }
  let smsResults = [];
  let pushResults = { successCount: 0, failureCount: 0, responses: [] };
  let alertId = null;
  try {
    alertId = uuidv4();
    const alertData = {
      alertId,
      userId,
      lat,
      lon,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active',
    };
    await db.collection('alerts').doc(alertId).set(alertData);
    console.log(`[Alert] Created alert ${alertId} for user ${userId}`);

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userContacts = userDoc.exists && Array.isArray(userDoc.data().contacts)
      ? userDoc.data().contacts
      : [];

    const smsBody = `SOS Alert!\nUser: ${userId}\nLocation: https://maps.google.com/?q=${lat},${lon}`;

    for (const contact of userContacts) {
      try {
        const toNumber = formatToE164(contact.phone);
        const message = await twilioClient.messages.create({
          body: smsBody,
          from: TWILIO_PHONE_NUMBER,
          to: toNumber,
        });
        smsResults.push({ contact: toNumber, status: 'sent', sid: message.sid });
        console.log(`[SMS] Sent to ${toNumber}`);
      } catch (smsErr) {
        const toNumber = contact.phone;
        smsResults.push({ contact: toNumber, status: 'failed', error: smsErr.message || smsErr.toString() });
        console.error(`[SMS] Failed to send to ${toNumber}: ${smsErr.message || smsErr.toString()}`);
      }
    }

    const tokens = userDoc.exists && Array.isArray(userDoc.data().tokens) ? userDoc.data().tokens : [];

    if (tokens.length > 0) {
      try {
        const message = {
          notification: {
            title: `🚨 SOS from ${userDoc.data().name || userId}`,
            body: `📍 Tap to view live location`
          },
          webpush: {
            fcmOptions: {
              link: `https://maps.google.com/?q=${lat},${lon}`
            }
          },
          data: {
            alertId,
            lat: String(lat),
            lon: String(lon),
            mapsUrl: `https://maps.google.com/?q=${lat},${lon}`
          },
          tokens
        };
        const response = await admin.messaging().sendEachForMulticast(message);
        pushResults.successCount = response.successCount;
        pushResults.failureCount = response.failureCount;
        pushResults.responses = response.responses.map((r, i) => ({
          token: tokens[i],
          success: r.success,
          error: r.error ? r.error.message : null,
        }));
        console.log(`[Push] Push notification result. Success: ${response.successCount}, Failure: ${response.failureCount}`);
      } catch (pushErr) {
        console.error('[Push] Error sending push notifications:', pushErr);
        pushResults.error = pushErr.message || pushErr.toString();
      }
    } else {
      console.warn('[Push] No tokens found for user, push notification not sent');
    }
  } catch (err) {
    console.error('Error creating alert:', err);
    return res.status(500).json({ 
      error: 'Failed to create alert', 
      alertId, 
      smsResults, 
      pushResults,
      detailedError: err.message || err.toString()
    });
  }

  res.json({
    message: '🚨 SOS sent successfully!',
    alertId,
    smsResults,
    pushResults,
  });
});

// Endpoint 3: Send Test Push Notification
app.post('/send-test-notification', async (req, res) => {
  const { userId, title, body } = req.body;
  if (!userId || !title || !body) {
    return res.status(400).json({ error: 'userId, title, body required' });
  }
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const tokens = userDoc.exists && Array.isArray(userDoc.data().tokens) ? userDoc.data().tokens : [];
    if (tokens.length === 0) {
      console.warn('No tokens found for user, test notification not sent');
      return res.status(404).json({ error: 'No tokens found for user' });
    }
    const message = {
      notification: { title, body },
      tokens,
    };
    const response = await admin.messaging().sendMulticast(message);
    console.log(`[Test Notification Sent] To ${tokens.length} tokens. Success: ${response.successCount}, Failure: ${response.failureCount}`);
    res.json({ success: true, sent: response.successCount, failed: response.failureCount });
  } catch (err) {
    console.error('Error sending test notification:', err);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Endpoint 4: Get All Alerts
app.get('/alerts', async (req, res) => {
  try {
    const snapshot = await db.collection('alerts').orderBy('createdAt', 'desc').get();
    const alerts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    res.json({ alerts });
  } catch (err) {
    console.error('Error fetching alerts:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Endpoint 5: Cancel/Delete Alert
app.delete('/alert/:id', async (req, res) => {
  const alertId = req.params.id;
  try {
    const alertRef = db.collection('alerts').doc(alertId);
    const alertDoc = await alertRef.get();
    if (!alertDoc.exists) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    await alertRef.update({ status: 'cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`[Alert Cancelled] Alert ID: ${alertId}`);
    res.json({ success: true, alertId });
  } catch (err) {
    console.error('Error cancelling alert:', err);
    res.status(500).json({ error: 'Failed to cancel alert' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Women Safety backend running on port ${PORT} (accessible on network)`);
});