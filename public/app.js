let templates = [];
let session;

const templateSelect = document.getElementById('template');
const prenomInput = document.getElementById('prenom');
const emailInput = document.getElementById('email');
const dateRdvField = document.getElementById('dateRdvField');
const dateRdvInput = document.getElementById('dateRdv');
const attachmentInfo = document.getElementById('attachmentInfo');
const attachmentLabel = document.getElementById('attachmentLabel');
const sendBtn = document.getElementById('sendBtn');
const statusDiv = document.getElementById('status');
const form = document.getElementById('emailForm');

(async () => {
  session = await requireLogin();
  if (!session) return;

  document.getElementById('userEmail').textContent = session.user.email;
  if (session.user.user_metadata?.is_admin) {
    document.getElementById('adminLink').style.display = 'inline';
  }

  await loadTemplates();
})();

async function loadTemplates() {
  const res = await fetch('/api/templates', { headers: authHeaders(session) });
  templates = await res.json();
  templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    templateSelect.appendChild(opt);
  });
}

function updateTemplateFields() {
  const t = templates.find(t => t.id === templateSelect.value);
  // Attachment
  if (t && t.attachment_url && t.attachment_name) {
    attachmentLabel.textContent = `📎 ${t.attachment_name}`;
    attachmentInfo.style.display = 'block';
  } else {
    attachmentInfo.style.display = 'none';
  }
  // Date RDV field — visible seulement si le template contient {{date_rdv}}
  const needsDate = t && (t.body?.includes('{{date_rdv}}') || t.subject?.includes('{{date_rdv}}'));
  dateRdvField.style.display = needsDate ? 'block' : 'none';
  dateRdvInput.required = !!needsDate;
  if (!needsDate) dateRdvInput.value = '';
}

templateSelect.addEventListener('change', updateTemplateFields);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  sendBtn.disabled = true;
  sendBtn.textContent = 'Envoi en cours...';
  statusDiv.style.display = 'none';

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: authHeaders(session),
      body: JSON.stringify({
        templateId: templateSelect.value,
        prenom: prenomInput.value,
        email: emailInput.value,
        date_rdv: dateRdvInput.value || undefined
      })
    });
    const data = await res.json();
    if (res.ok) {
      statusDiv.className = 'status success';
      statusDiv.textContent = data.message;
      emailInput.value = '';
      prenomInput.value = '';
      dateRdvInput.value = '';
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
