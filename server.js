require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const { getConfig, setConfigKey, deleteConfigKey, getTemplates, addTemplate, updateTemplate, deleteTemplate } = require('./store');

const app = express();
app.use(express.json());
app.use(express.static('public', { etag: false, maxAge: 0 }));

const PORT = process.env.PORT || 3000;

function getAppUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

async function getGmailClient() {
  const config = await getConfig();
  const clientId = config.gmailClientId || process.env.GMAIL_CLIENT_ID;
  const clientSecret = config.gmailClientSecret || process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = config.gmailRefreshToken || process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function getSenderHeader() {
  const config = await getConfig();
  const email = config.gmailUser || process.env.GMAIL_USER || '';
  const name = config.gmailDisplayName || process.env.GMAIL_DISPLAY_NAME || '';
  return name ? `=?UTF-8?B?${Buffer.from(name).toString('base64')}?= <${email}>` : email;
}

// ============ TEMPLATES API ============

app.get('/api/templates', async (req, res) => {
  res.json(await getTemplates());
});

app.post('/api/templates', async (req, res) => {
  const { name, subject, body, attachment_url, attachment_name } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: 'name, subject et body sont requis.' });
  }
  try {
    const template = await addTemplate({ name, subject, body, attachment_url, attachment_name });
    res.json({ success: true, template });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  const { name, subject, body, attachment_url, attachment_name } = req.body;
  try {
    const template = await updateTemplate(req.params.id, { name, subject, body, attachment_url, attachment_name });
    res.json({ success: true, template });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    await deleteTemplate(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CONFIG API ============

app.get('/api/config/signature', async (req, res) => {
  const config = await getConfig();
  res.json({ signature: config.gmailSignature || '' });
});

app.post('/api/config/signature', async (req, res) => {
  const { signature } = req.body;
  await setConfigKey('gmailSignature', signature || '');
  res.json({ success: true });
});

app.get('/api/config/signature/import', async (req, res) => {
  const gmail = await getGmailClient();
  if (!gmail) return res.status(400).json({ error: 'Gmail non configuré.' });
  const senderEmail = await getSenderEmail();
  try {
    const response = await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: senderEmail });
    res.json({ signature: response.data.signature || '' });
  } catch (err) {
    res.status(500).json({ error: `Impossible de récupérer la signature : ${err.message}` });
  }
});

app.get('/api/config/status', async (req, res) => {
  const config = await getConfig();
  const hasCredentials = !!(config.gmailClientId || process.env.GMAIL_CLIENT_ID);
  const hasToken = !!(config.gmailRefreshToken || process.env.GMAIL_REFRESH_TOKEN);
  const gmailUser = config.gmailUser || process.env.GMAIL_USER || '';
  res.json({ connected: hasCredentials && hasToken, gmailUser, hasCredentials, hasToken });
});

app.post('/api/config/credentials', async (req, res) => {
  const { gmailClientId, gmailClientSecret, gmailUser, gmailDisplayName } = req.body;
  if (!gmailClientId || !gmailClientSecret || !gmailUser) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }
  await setConfigKey('gmailClientId', gmailClientId);
  await setConfigKey('gmailClientSecret', gmailClientSecret);
  await setConfigKey('gmailUser', gmailUser);
  if (gmailDisplayName) await setConfigKey('gmailDisplayName', gmailDisplayName);
  res.json({ success: true });
});

// Start OAuth flow
app.get('/api/config/oauth/start', async (req, res) => {
  const config = await getConfig();
  const clientId = config.gmailClientId || process.env.GMAIL_CLIENT_ID;
  const clientSecret = config.gmailClientSecret || process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Configure d\'abord Client ID et Client Secret.' });
  }
  const redirectUri = `${getAppUrl(req)}/api/config/oauth/callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.settings.basic'],
    prompt: 'consent'
  });
  res.json({ authUrl });
});

// OAuth callback
app.get('/api/config/oauth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    console.error('OAuth error from Google:', error);
    return res.redirect('/config.html?error=oauth_failed');
  }
  const config = await getConfig();
  const clientId = config.gmailClientId || process.env.GMAIL_CLIENT_ID;
  const clientSecret = config.gmailClientSecret || process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = `${getAppUrl(req)}/api/config/oauth/callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      // Token already exists — just redirect as connected
      return res.redirect('/config.html?connected=true');
    }
    await setConfigKey('gmailRefreshToken', tokens.refresh_token);
    res.redirect('/config.html?connected=true');
  } catch (err) {
    console.error('OAuth token exchange error:', err.message);
    res.redirect(`/config.html?error=${encodeURIComponent(err.message)}`);
  }
});

// Disconnect Gmail — properly deletes the refresh token from Supabase
app.post('/api/config/disconnect', async (req, res) => {
  await deleteConfigKey('gmailRefreshToken');
  res.json({ success: true });
});

// ============ SEND EMAIL ============

app.post('/api/send', express.json(), async (req, res) => {
  const { templateId, prenom, email } = req.body;

  if (!templateId || !prenom || !email) {
    return res.status(400).json({ error: 'templateId, prenom et email sont requis.' });
  }

  const templates = await getTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) return res.status(404).json({ error: 'Template introuvable.' });

  const gmail = await getGmailClient();
  if (!gmail) return res.status(400).json({ error: 'Gmail non configuré. Va dans Configuration.' });

  const config = await getConfig();
  const signature = config.gmailSignature || '';
  const subject = template.subject.replace(/\{\{prenom\}\}/g, prenom);
  const bodyContent = template.body.replace(/\{\{prenom\}\}/g, prenom);
  const htmlBody = signature
    ? `${bodyContent}<br><br><hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0;">${signature}`
    : bodyContent;
  const senderEmail = await getSenderHeader();

  // Fetch template attachment from URL if defined
  let attachmentBuffer = null;
  let attachmentMime = 'application/octet-stream';
  let attachmentName = template.attachment_name || 'document';
  if (template.attachment_url) {
    try {
      const fetchRes = await fetch(template.attachment_url);
      if (fetchRes.ok) {
        const arrayBuf = await fetchRes.arrayBuffer();
        attachmentBuffer = Buffer.from(arrayBuf);
        attachmentMime = fetchRes.headers.get('content-type') || attachmentMime;
      }
    } catch (err) {
      console.error('Attachment fetch error:', err.message);
    }
  }

  const raw = createRawEmail(senderEmail, email, subject, htmlBody,
    attachmentBuffer ? { buffer: attachmentBuffer, mimetype: attachmentMime, originalname: attachmentName } : null
  );

  try {
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    res.json({ success: true, message: `Email envoyé à ${email}` });
  } catch (err) {
    console.error('Erreur envoi Gmail:', err.message);
    res.status(500).json({ error: `Échec de l'envoi: ${err.message}` });
  }
});

function createRawEmail(from, to, subject, htmlBody, file) {
  const boundary = `boundary_${Date.now()}`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

  if (file) {
    const fileB64 = file.buffer.toString('base64');
    const filenameEncoded = `=?UTF-8?B?${Buffer.from(file.originalname).toString('base64')}?=`;
    const message = [
      `From: ${from}`, `To: ${to}`, `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
      `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', '', htmlBody, '',
      `--${boundary}`, `Content-Type: ${file.mimetype}; name="${filenameEncoded}"`,
      'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${filenameEncoded}"`,
      '', fileB64, `--${boundary}--`
    ].join('\r\n');
    return Buffer.from(message).toString('base64url');
  }

  const message = [
    `From: ${from}`, `To: ${to}`, `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', htmlBody
  ].join('\r\n');
  return Buffer.from(message).toString('base64url');
}

app.listen(PORT, () => {
  console.log(`GMailSender running on http://localhost:${PORT}`);
});
