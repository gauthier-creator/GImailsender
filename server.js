require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const { getConfig, saveConfig, getTemplates, addTemplate, updateTemplate, deleteTemplate } = require('./store');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

async function getSenderEmail() {
  const config = await getConfig();
  return config.gmailUser || process.env.GMAIL_USER;
}

// ============ TEMPLATES API ============

app.get('/api/templates', async (req, res) => {
  res.json(await getTemplates());
});

app.post('/api/templates', async (req, res) => {
  const { name, subject, body } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: 'name, subject et body sont requis.' });
  }
  try {
    const template = await addTemplate({ name, subject, body });
    res.json({ success: true, template });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  const { name, subject, body } = req.body;
  try {
    const template = await updateTemplate(req.params.id, { name, subject, body });
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
  const config = await getConfig();
  config.gmailSignature = signature || '';
  await saveConfig(config);
  res.json({ success: true });
});

app.get('/api/config/status', async (req, res) => {
  const config = await getConfig();
  const hasCredentials = !!(config.gmailClientId || process.env.GMAIL_CLIENT_ID);
  const hasToken = !!(config.gmailRefreshToken || process.env.GMAIL_REFRESH_TOKEN);
  const gmailUser = config.gmailUser || process.env.GMAIL_USER || '';
  res.json({ connected: hasCredentials && hasToken, gmailUser, hasCredentials, hasToken });
});

app.post('/api/config/credentials', async (req, res) => {
  const { gmailClientId, gmailClientSecret, gmailUser } = req.body;
  if (!gmailClientId || !gmailClientSecret || !gmailUser) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }
  const config = await getConfig();
  config.gmailClientId = gmailClientId;
  config.gmailClientSecret = gmailClientSecret;
  config.gmailUser = gmailUser;
  await saveConfig(config);
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
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent'
  });

  res.json({ authUrl });
});

// OAuth callback
app.get('/api/config/oauth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Code manquant.');

  const config = await getConfig();
  const clientId = config.gmailClientId || process.env.GMAIL_CLIENT_ID;
  const clientSecret = config.gmailClientSecret || process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = `${getAppUrl(req)}/api/config/oauth/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    config.gmailRefreshToken = tokens.refresh_token;
    await saveConfig(config);
    res.redirect('/config.html?connected=true');
  } catch (err) {
    console.error('OAuth error:', err.message);
    res.redirect('/config.html?error=oauth_failed');
  }
});

// Disconnect Gmail
app.post('/api/config/disconnect', async (req, res) => {
  const config = await getConfig();
  delete config.gmailRefreshToken;
  await saveConfig(config);
  res.json({ success: true });
});

// ============ SEND EMAIL ============

app.post('/api/send', upload.single('attachment'), async (req, res) => {
  const { templateId, prenom, email } = req.body;

  if (!templateId || !prenom || !email) {
    return res.status(400).json({ error: 'templateId, prenom et email sont requis.' });
  }

  const templates = await getTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template introuvable.' });
  }

  const gmail = await getGmailClient();
  if (!gmail) {
    return res.status(400).json({ error: 'Gmail non configuré. Va dans Configuration.' });
  }

  const config = await getConfig();
  const signature = config.gmailSignature || '';
  const subject = template.subject.replace(/\{\{prenom\}\}/g, prenom);
  const bodyContent = template.body.replace(/\{\{prenom\}\}/g, prenom);
  const htmlBody = signature
    ? `${bodyContent}<br><br><hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0;">${signature}`
    : bodyContent;
  const senderEmail = await getSenderEmail();
  const raw = createRawEmail(senderEmail, email, subject, htmlBody, req.file || null);

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });
    res.json({ success: true, message: `Email envoyé à ${email}` });
  } catch (err) {
    console.error('Erreur envoi Gmail:', err.message);
    res.status(500).json({ error: `Échec de l'envoi: ${err.message}` });
  }
});

function createRawEmail(from, to, subject, htmlBody, file) {
  const boundary = `boundary_${Date.now()}`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

  let message;

  if (file) {
    const fileB64 = file.buffer.toString('base64');
    const filenameEncoded = `=?UTF-8?B?${Buffer.from(file.originalname).toString('base64')}?=`;
    message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody,
      '',
      `--${boundary}`,
      `Content-Type: ${file.mimetype}; name="${filenameEncoded}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filenameEncoded}"`,
      '',
      fileB64,
      `--${boundary}--`
    ].join('\r\n');
  } else {
    message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody
    ].join('\r\n');
  }

  return Buffer.from(message).toString('base64url');
}

app.listen(PORT, () => {
  console.log(`GMailSender running on http://localhost:${PORT}`);
});
