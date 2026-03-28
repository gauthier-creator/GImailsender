let templates = [];

const templateSelect = document.getElementById('template');
const prenomInput = document.getElementById('prenom');
const emailInput = document.getElementById('email');
const attachmentInfo = document.getElementById('attachmentInfo');
const attachmentLabel = document.getElementById('attachmentLabel');
const sendBtn = document.getElementById('sendBtn');
const statusDiv = document.getElementById('status');
const form = document.getElementById('emailForm');

async function loadTemplates() {
  const res = await fetch('/api/templates');
  templates = await res.json();
  templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    templateSelect.appendChild(opt);
  });
}

function updateAttachmentInfo() {
  const t = templates.find(t => t.id === templateSelect.value);
  if (t && t.attachment_url && t.attachment_name) {
    attachmentLabel.textContent = `📎 ${t.attachment_name}`;
    attachmentInfo.style.display = 'block';
  } else {
    attachmentInfo.style.display = 'none';
  }
}

templateSelect.addEventListener('change', updateAttachmentInfo);

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  sendBtn.disabled = true;
  sendBtn.textContent = 'Envoi en cours...';
  statusDiv.style.display = 'none';

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: templateSelect.value,
        prenom: prenomInput.value,
        email: emailInput.value
      })
    });

    const data = await res.json();

    if (res.ok) {
      statusDiv.className = 'status success';
      statusDiv.textContent = data.message;
      emailInput.value = '';
      prenomInput.value = '';
    } else {
      statusDiv.className = 'status error';
      statusDiv.textContent = data.error;
    }
  } catch (err) {
    statusDiv.className = 'status error';
    statusDiv.textContent = 'Erreur réseau. Vérifie ta connexion.';
  }

  statusDiv.style.display = 'block';
  sendBtn.disabled = false;
  sendBtn.textContent = 'Envoyer';
});

loadTemplates();
