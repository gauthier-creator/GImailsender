let templates = [];

const templateSelect = document.getElementById('template');
const prenomInput = document.getElementById('prenom');
const emailInput = document.getElementById('email');
const previewSection = document.getElementById('previewSection');
const previewSubject = document.getElementById('previewSubject');
const previewBody = document.getElementById('previewBody');
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

function updatePreview() {
  const t = templates.find(t => t.id === templateSelect.value);
  if (!t) {
    previewSection.style.display = 'none';
    return;
  }
  const prenom = prenomInput.value || '{{prenom}}';
  previewSubject.textContent = t.subject.replace(/\{\{prenom\}\}/g, prenom);
  previewBody.innerHTML = t.body.replace(/\{\{prenom\}\}/g, prenom);
  previewSection.style.display = 'block';
}

templateSelect.addEventListener('change', updatePreview);
prenomInput.addEventListener('input', updatePreview);

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
      updatePreview();
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
