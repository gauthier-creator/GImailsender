require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const templates = require('./templates');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Get all templates
app.get('/api/templates', (req, res) => {
  const list = templates.map(t => ({ id: t.id, name: t.name, subject: t.subject, body: t.body }));
  res.json(list);
});

// Send email
app.post('/api/send', async (req, res) => {
  const { templateId, prenom, email } = req.body;

  if (!templateId || !prenom || !email) {
    return res.status(400).json({ error: 'templateId, prenom et email sont requis.' });
  }

  const template = templates.find(t => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template introuvable.' });
  }

  const subject = template.subject.replace(/\{\{prenom\}\}/g, prenom);
  const htmlBody = template.body.replace(/\{\{prenom\}\}/g, prenom);

  const senderEmail = process.env.GMAIL_USER;
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
