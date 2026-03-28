require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const crypto = require('crypto');
const { getConfig, saveConfig, getTemplates, saveTemplates } = require('./store');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

function getAppUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function getGmailClient() {
  const config = getConfig();
  const clientId = config.gmailClientId || process.env.GMAIL_CLIENT_ID;
  const clientSecret = config.gmailClientSecret || process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = config.gmailRefreshToken || process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function getSenderEmail() {
  const config = getConfig();
  return config.gmailUser || process.env.GMAIL_USER;
}

// ============ TEMPLATES API ============

app.get('/api/templates', (req, res) => {
  res.json(getTemplates());
});

app.post('/api/templates', (req, res) => {
  const { name, subject, body } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: 'name, subject et body sont requis.' });
  }
  const templates = getTemplates();
  const id = crypto.randomUUID().slice(0, 8);
  templates.push({ id, name, subject, body });
  saveTemplates(templates);
  res.json({ success: true, template: { id, name, subject, body } });
});

app.put('/api/templates/:id', (req, res) => {
  const { name, subject, body } = req.body;
  const templates = getTemplates();
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template introuvable.' });
  templates[idx] = { ...templates[idx], name, subject, body };
  saveTemplates(templates);
  res.json({ success: true, template: templates[idx] });
});

app.delete('/api/templates/:id', (req, res) => {
  let templates = getTemplates();
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template introuvable.' });
  templates.splice(idx, 1);
  saveTemplates(templates);
  res.json({ success: true });
});

// ============ CONFIG API ============

app.get('/api/config/status', (req, res) => {
  const config = getConfig();
  const hasCredentials = !!(config.gmailClientId || process.env.GMAIL_CLIENT_ID);
  const hasToken = !!(config.gmailRefreshToken || process.env.GMAIL_REFRESH_TOKEN);
  const gmailUser = config.gmailUser || process.env.GMAIL_USER || '';
  res.json({ connected: hasCredentials && hasToken, gmailUser, hasCredentials, hasToken });
});

app.post('/api/config/credentials', (req, res) => {
  const { gmailClientId, gmailClientSecret, gmailUser } = req.body;
  if (!gmailClientId || !gmailClientSecret || !gmailUser) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }
  const config = getConfig();
  config.gmailClientId = gmailClientId;
  config.gmailClientSecret = gmailClientSecret;
  config.gmailUser = gmailUser;
  saveConfig(config);
  res.json({ success: true });
});

// Start OAuth flow
app.get('/api/config/oauth/start', (req, res) => {
  const config = getConfig();
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

  const config = getConfig();
  const clientId = config.gmailClientId || process.env.GMAIL_CLIENT_ID;
  const clientSecret = config.gmailClientSecret || process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = `${getAppUrl(req)}/api/config/oauth/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    config.gmailRefreshToken = tokens.refresh_token;
    saveConfig(config);
    res.redirect('/config.html?connected=true');
  } catch (err) {
    console.error('OAuth error:', err.message);
    res.redirect('/config.html?error=oauth_failed');
  }
});

// Disconnect Gmail
app.post('/api/config/disconnect', (req, res) => {
  const config = getConfig();
  delete config.gmailRefreshToken;
  saveConfig(config);
  res.json({ success: true });
});

// ============ SEND EMAIL ============

app.post('/api/send', async (req, res) => {
  const { templateId, prenom, email } = req.body;

  if (!templateId || !prenom || !email) {
    return res.status(400).json({ error: 'templateId, prenom et email sont requis.' });
  }

  const templates = getTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template introuvable.' });
  }

  const gmail = getGmailClient();
  if (!gmail) {
    return res.status(400).json({ error: 'Gmail non configuré. Va dans Configuration.' });
  }

  const subject = template.subject.replace(/\{\{prenom\}\}/g, prenom);
  const htmlBody = template.body.replace(/\{\{prenom\}\}/g, prenom);
  const senderEmail = getSenderEmail();
  const raw = createRawEmail(senderEmail, email, subject, htmlBody);

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

function createRawEmail(from, to, subject, htmlBody) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody
  ];
  const message = messageParts.join('\r\n');
  return Buffer.from(message).toString('base64url');
}

app.listen(PORT, () => {
  console.log(`GMailSender running on http://localhost:${PORT}`);
});
