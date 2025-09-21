// Firebase config (same as main app)
const firebaseConfig = {
  apiKey: "AIzaSyCvoJdOzp9v8aWdnWhGpoBrB_ZOBh-L648",
  authDomain: "women-saftey-a3bac.firebaseapp.com",
  projectId: "women-saftey-a3bac",
  storageBucket: "women-saftey-a3bac.firebasestorage.app",
  messagingSenderId: "40368489597",
  appId: "1:40368489597:web:cba8693d99900ea5461d14"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const editUserForm = document.getElementById('editUserForm');
const emailField = document.getElementById('email');
const nameField = document.getElementById('name');
const phoneField = document.getElementById('phone');
const contactsList = document.getElementById('contactsList');
const addContactBtn = document.getElementById('addContactBtn');
const statusMsg = document.getElementById('status');

let contacts = [];

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  emailField.value = user.email || "";

  try {
    const userDocRef = db.collection("users").doc(user.uid);
    const userDoc = await userDocRef.get();
    if (userDoc.exists) {
      const data = userDoc.data();
      nameField.value = data.name || "";
      phoneField.value = data.phone || "";
      contacts = data.contacts || [];
      renderContacts();
    }
  } catch (err) {
    console.error(err);
    statusMsg.innerText = "❌ Failed to load user data.";
  }
});

function createContactItem(contact = { name: "", phone: "" }, index) {
  const contactDiv = document.createElement('div');
  contactDiv.classList.add('contact-item');
  contactDiv.style.display = 'flex';
  contactDiv.style.gap = '10px';
  contactDiv.style.alignItems = 'center';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Contact Name';
  nameInput.value = contact.name || "";
  nameInput.classList.add('contact-name');
  nameInput.maxLength = 36;
  nameInput.style.flex = '1 1 45%';
  nameInput.addEventListener('input', (e) => {
    contacts[index].name = e.target.value;
  });

  const phoneInput = document.createElement('input');
  phoneInput.type = 'text';
  phoneInput.placeholder = 'Contact Phone';
  phoneInput.value = contact.phone || "";
  phoneInput.classList.add('contact-phone');
  phoneInput.maxLength = 14;
  phoneInput.style.flex = '1 1 45%';
  phoneInput.addEventListener('input', (e) => {
    contacts[index].phone = e.target.value;
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.innerText = 'Remove';
  removeBtn.classList.add('remove-contact-btn');
  removeBtn.addEventListener('click', () => {
    contacts.splice(index, 1);
    renderContacts();
  });

  contactDiv.appendChild(nameInput);
  contactDiv.appendChild(phoneInput);
  contactDiv.appendChild(removeBtn);

  return contactDiv;
}

function renderContacts() {
  contactsList.innerHTML = "";
  contacts.forEach((contact, index) => {
    const contactItem = createContactItem(contact, index);
    contactsList.appendChild(contactItem);
  });
}

addContactBtn.addEventListener('click', () => {
  contacts.push({ name: "", phone: "" });
  renderContacts();
});

editUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const name = nameField.value.trim();
  const phone = phoneField.value.trim();

  if (!name || !phone) {
    statusMsg.innerText = "Please fill all required fields (name and phone).";
    return;
  }

  // Validate contacts: all must have non-empty name and phone
  for (let i = 0; i < contacts.length; i++) {
    if (!contacts[i].name.trim() || !contacts[i].phone.trim()) {
      statusMsg.innerText = "Please fill all contact names and phone numbers or remove empty contacts.";
      return;
    }
  }

  try {
    await db.collection("users").doc(user.uid).update({
      name,
      phone,
      contacts
    });
    statusMsg.innerText = "✅ Data updated successfully!";
  } catch (err) {
    console.error(err);
    statusMsg.innerText = "❌ Failed to update data.";
  }
});