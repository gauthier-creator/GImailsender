// --- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// --- Gmail Config ---
const statusCard = document.getElementById('gmailStatus');
const statusText = statusCard.querySelector('.status-text');
const credentialsForm = document.getElementById('credentialsForm');
const connectSection = document.getElementById('connectSection');
const disconnectSection = document.getElementById('disconnectSection');

// Show redirect URI
document.getElementById('redirectUri').textContent =
  `${window.location.origin}/api/config/oauth/callback`;

// Check URL params for OAuth result
const params = new URLSearchParams(window.location.search);
if (params.get('connected') === 'true') {
  history.replaceState(null, '', '/config.html');
}
if (params.get('error')) {
  alert(`Erreur OAuth : ${decodeURIComponent(params.get('error'))}`);
  history.replaceState(null, '', '/config.html');
}

async function checkStatus() {
  const res = await fetch('/api/config/status');
  const data = await res.json();

  if (data.connected) {
    statusCard.className = 'status-card connected';
    statusText.textContent = `Connecté — ${data.gmailUser}`;
    connectSection.style.display = 'none';
    disconnectSection.style.display = 'block';
  } else if (data.hasCredentials) {
    statusCard.className = 'status-card partial';
    statusText.textContent = 'Credentials sauvegardées — connexion Gmail requise';
    connectSection.style.display = 'block';
    disconnectSection.style.display = 'none';
  } else {
    statusCard.className = 'status-card disconnected';
    statusText.textContent = 'Non configuré';
    connectSection.style.display = 'none';
    disconnectSection.style.display = 'none';
  }
}

document.getElementById('saveCredentials').addEventListener('click', async () => {
  const gmailClientId = document.getElementById('clientId').value.trim();
  const gmailClientSecret = document.getElementById('clientSecret').value.trim();
  const gmailUser = document.getElementById('gmailUser').value.trim();

  if (!gmailClientId || !gmailClientSecret || !gmailUser) {
    alert('Remplis tous les champs.');
    return;
  }

  const res = await fetch('/api/config/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gmailClientId, gmailClientSecret, gmailUser })
  });

  if (res.ok) {
    checkStatus();
  } else {
    const data = await res.json();
    alert(data.error);
  }
});

document.getElementById('connectGmail').addEventListener('click', async () => {
  const res = await fetch('/api/config/oauth/start');
  const data = await res.json();
  if (data.authUrl) {
    window.location.href = data.authUrl;
  } else {
    alert(data.error);
  }
});

document.getElementById('disconnectGmail').addEventListener('click', async () => {
  if (!confirm('Déconnecter Gmail ?')) return;
  await fetch('/api/config/disconnect', { method: 'POST' });
  checkStatus();
});

checkStatus();

// --- Templates ---
let editingTemplateId = null;

async function loadTemplates() {
  const res = await fetch('/api/templates');
  const templates = await res.json();
  const list = document.getElementById('templatesList');

  if (templates.length === 0) {
    list.innerHTML = '<p style="color:#666;text-align:center;padding:40px 0;">Aucun template. Clique "+ Nouveau" pour en créer un.</p>';
    return;
  }

  list.innerHTML = templates.map(t => `
    <div class="template-card" data-id="${t.id}">
      <div class="template-card-header">
        <span class="template-card-name">${escapeHtml(t.name)}</span>
        <div class="template-card-actions">
          <button onclick="editTemplate('${t.id}')">Modifier</button>
          <button class="delete" onclick="deleteTemplate('${t.id}')">Supprimer</button>
        </div>
      </div>
      <div class="template-card-subject">${escapeHtml(t.subject)}</div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const modal = document.getElementById('templateModal');
const modalTitle = document.getElementById('modalTitle');

function clearModal() {
  document.getElementById('tplName').value = '';
  document.getElementById('tplSubject').value = '';
  document.getElementById('tplBody').value = '';
  document.getElementById('tplAttachmentName').value = '';
  document.getElementById('tplAttachmentUrl').value = '';
}

document.getElementById('addTemplate').addEventListener('click', () => {
  editingTemplateId = null;
  modalTitle.textContent = 'Nouveau template';
  clearModal();
  modal.style.display = 'flex';
});

document.getElementById('closeModal').addEventListener('click', () => {
  modal.style.display = 'none';
});

document.getElementById('cancelTemplate').addEventListener('click', () => {
  modal.style.display = 'none';
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.style.display = 'none';
});

window.editTemplate = async function(id) {
  const res = await fetch('/api/templates');
  const templates = await res.json();
  const t = templates.find(tpl => tpl.id === id);
  if (!t) return;

  editingTemplateId = id;
  modalTitle.textContent = 'Modifier le template';
  document.getElementById('tplName').value = t.name;
  document.getElementById('tplSubject').value = t.subject;
  document.getElementById('tplBody').value = t.body;
  document.getElementById('tplAttachmentName').value = t.attachment_name || '';
  document.getElementById('tplAttachmentUrl').value = t.attachment_url || '';
  modal.style.display = 'flex';
};

window.deleteTemplate = async function(id) {
  if (!confirm('Supprimer ce template ?')) return;
  await fetch(`/api/templates/${id}`, { method: 'DELETE' });
  loadTemplates();
};

document.getElementById('saveTemplate').addEventListener('click', async () => {
  const name = document.getElementById('tplName').value.trim();
  const subject = document.getElementById('tplSubject').value.trim();
  const body = document.getElementById('tplBody').value;

  if (!name || !subject || !body) {
    alert('Remplis tous les champs.');
    return;
  }

  const attachment_name = document.getElementById('tplAttachmentName').value.trim() || null;
  const attachment_url = document.getElementById('tplAttachmentUrl').value.trim() || null;
  const payload = { name, subject, body, attachment_name, attachment_url };

  if (editingTemplateId) {
    await fetch(`/api/templates/${editingTemplateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  modal.style.display = 'none';
  loadTemplates();
});

loadTemplates();

// --- Signature ---
const sigInput = document.getElementById('sigInput');
const sigPreviewSection = document.getElementById('sigPreviewSection');
const sigPreview = document.getElementById('sigPreview');
const sigStatus = document.getElementById('sigStatus');

async function loadSignature() {
  const res = await fetch('/api/config/signature');
  const data = await res.json();
  if (data.signature) {
    sigInput.value = data.signature;
    sigPreview.innerHTML = data.signature;
    sigPreviewSection.style.display = 'block';
  }
}

sigInput.addEventListener('input', () => {
  const val = sigInput.value.trim();
  if (val) {
    sigPreview.innerHTML = val;
    sigPreviewSection.style.display = 'block';
  } else {
    sigPreviewSection.style.display = 'none';
  }
});

document.getElementById('importSignature').addEventListener('click', async () => {
  const btn = document.getElementById('importSignature');
  btn.disabled = true;
  btn.textContent = 'Import en cours...';

  const res = await fetch('/api/config/signature/import');
  const data = await res.json();

  btn.disabled = false;
  btn.textContent = 'Importer depuis Gmail';

  if (res.ok && data.signature) {
    sigInput.value = data.signature;
    sigPreview.innerHTML = data.signature;
    sigPreviewSection.style.display = 'block';
  } else {
    sigStatus.style.display = 'block';
    sigStatus.className = 'status error';
    sigStatus.textContent = data.error || 'Aucune signature trouvée sur ce compte Gmail.';
    setTimeout(() => { sigStatus.style.display = 'none'; }, 4000);
  }
});

document.getElementById('saveSignature').addEventListener('click', async () => {
  const res = await fetch('/api/config/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature: sigInput.value })
  });

  sigStatus.style.display = 'block';
  if (res.ok) {
    sigStatus.className = 'status success';
    sigStatus.textContent = 'Signature sauvegardée.';
  } else {
    sigStatus.className = 'status error';
    sigStatus.textContent = 'Erreur lors de la sauvegarde.';
  }
  setTimeout(() => { sigStatus.style.display = 'none'; }, 3000);
});

loadSignature();
