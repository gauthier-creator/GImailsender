let templates = [];

const templateSelect = document.getElementById('template');
const prenomInput = document.getElementById('prenom');
const emailInput = document.getElementById('email');
const attachmentInput = document.getElementById('attachment');
const fileDisplay = document.getElementById('fileDisplay');
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

attachmentInput.addEventListener('change', () => {
  const file = attachmentInput.files[0];
  if (file) {
    fileDisplay.textContent = file.name;
    fileDisplay.classList.add('has-file');
  } else {
    fileDisplay.textContent = 'Aucun fichier sélectionné';
    fileDisplay.classList.remove('has-file');
  }
});

templateSelect.addEventListener('change', updatePreview);
prenomInput.addEventListener('input', updatePreview);

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  sendBtn.disabled = true;
  sendBtn.textContent = 'Envoi en cours...';
  statusDiv.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('templateId', templateSelect.value);
    formData.append('prenom', prenomInput.value);
    formData.append('email', emailInput.value);
    if (attachmentInput.files[0]) {
      formData.append('attachment', attachmentInput.files[0]);
    }

    const res = await fetch('/api/send', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (res.ok) {
      statusDiv.className = 'status success';
      statusDiv.textContent = data.message;
      emailInput.value = '';
      prenomInput.value = '';
      attachmentInput.value = '';
      fileDisplay.textContent = 'Aucun fichier sélectionné';
      fileDisplay.classList.remove('has-file');
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
