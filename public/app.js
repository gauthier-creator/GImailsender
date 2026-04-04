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
    [templateSelect, document.getElementById('scanTemplate'), document.getElementById('relanceTemplate')].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
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

// ====== SCAN NO-RÉPONSE ======

let scanResults = [];

document.getElementById('scanBtn').addEventListener('click', async () => {
  const templateId = document.getElementById('scanTemplate').value;
  if (!templateId) { alert('Choisis un template à scanner.'); return; }

  const btn = document.getElementById('scanBtn');
  const scanStatus = document.getElementById('scanStatus');
  const scanResultsDiv = document.getElementById('scanResults');

  btn.disabled = true;
  btn.textContent = '🔍 Scan en cours...';
  scanStatus.style.display = 'block';
  scanStatus.textContent = 'Analyse de ta boîte Gmail...';
  scanResultsDiv.style.display = 'none';

  try {
    const days = parseInt(document.getElementById('scanDays').value) || 7;
    const res = await fetch(`/api/scan-no-reply?templateId=${templateId}&days=${days}`, { headers: authHeaders(session) });
    const data = await res.json();

    if (!res.ok) { scanStatus.textContent = 'Erreur : ' + data.error; btn.disabled = false; btn.textContent = '🔍 Lancer le scan'; return; }

    scanResults = data;
    renderScanResults(data);
    scanStatus.style.display = 'none';
  } catch (err) {
    scanStatus.textContent = 'Erreur réseau : ' + err.message;
  }

  btn.disabled = false;
  btn.textContent = '🔍 Lancer le scan';
});

function renderScanResults(results) {
  const scanResultsDiv = document.getElementById('scanResults');
  const scanList = document.getElementById('scanList');
  const count = document.getElementById('scanResultsCount');

  if (results.length === 0) {
    count.textContent = 'Aucun contact sans réponse sur les 7 derniers jours 👌';
    scanList.innerHTML = '';
    scanResultsDiv.style.display = 'block';
    document.getElementById('relanceBtn').style.display = 'none';
    document.getElementById('selectAll').parentElement.style.display = 'none';
    return;
  }

  count.textContent = `${results.length} contact${results.length > 1 ? 's' : ''} sans réponse`;
  document.getElementById('relanceBtn').style.display = 'inline-block';
  document.getElementById('selectAll').parentElement.style.display = 'inline-flex';

  scanList.innerHTML = results.map((r, i) => {
    const date = new Date(r.sent_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div style="display:flex;align-items:center;gap:12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;">
      <input type="checkbox" class="scan-check" data-index="${i}" checked style="width:auto;cursor:pointer;">
      <div style="flex:1;">
        <div style="font-size:14px;color:#e0e0e0;">${r.recipient_email}</div>
        <div style="font-size:11px;color:#555;margin-top:2px;">Envoyé le ${date} • ${r.template_name}</div>
      </div>
    </div>`;
  }).join('');

  scanResultsDiv.style.display = 'block';
}

document.getElementById('selectAll').addEventListener('change', (e) => {
  document.querySelectorAll('.scan-check').forEach(cb => cb.checked = e.target.checked);
});

document.getElementById('relanceBtn').addEventListener('click', async () => {
  const templateId = document.getElementById('relanceTemplate').value;
  if (!templateId) { alert('Choisis un template de relance.'); return; }

  const selected = [...document.querySelectorAll('.scan-check:checked')].map(cb => scanResults[+cb.dataset.index]);
  if (!selected.length) { alert('Sélectionne au moins un contact.'); return; }

  const btn = document.getElementById('relanceBtn');
  const relanceStatus = document.getElementById('relanceStatus');

  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';
  relanceStatus.style.display = 'none';

  const recipients = selected.map(r => ({
    email: r.recipient_email,
    prenom: r.recipient_email.split('@')[0]
  }));

  try {
    const res = await fetch('/api/send-bulk', {
      method: 'POST',
      headers: authHeaders(session),
      body: JSON.stringify({ templateId, recipients })
    });
    const data = await res.json();

    relanceStatus.style.display = 'block';
    if (res.ok) {
      const failed = data.results.filter(r => !r.success);
      relanceStatus.style.color = failed.length ? '#f59e0b' : '#4ade80';
      relanceStatus.textContent = `✓ ${data.sent}/${data.total} relance${data.sent > 1 ? 's' : ''} envoyée${data.sent > 1 ? 's' : ''}` +
        (failed.length ? ` (${failed.length} échec${failed.length > 1 ? 's' : ''})` : '');
    } else {
      relanceStatus.style.color = '#ef4444';
      relanceStatus.textContent = 'Erreur : ' + data.error;
    }
  } catch (err) {
    relanceStatus.style.display = 'block';
    relanceStatus.style.color = '#ef4444';
    relanceStatus.textContent = 'Erreur réseau : ' + err.message;
  }

  btn.disabled = false;
  btn.textContent = 'Relancer la sélection';
});

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
