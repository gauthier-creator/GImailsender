require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const {
  supabase,
  getUserConfig, setUserConfigKey, deleteUserConfigKey,
  getTemplates, addTemplate, updateTemplate, deleteTemplate
} = require('./store');

const app = express();
app.use(express.json());
app.use(express.static('public', { etag: false, maxAge: 0 }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const PORT = process.env.PORT || 3000;

// ============ AUTH MIDDLEWARE ============

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié.' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token invalide.' });

  req.user = user;
  next();
}

async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié.' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token invalide.' });
  if (!user.user_metadata?.is_admin) return res.status(403).json({ error: 'Accès admin requis.' });

  req.user = user;
  next();
}

// ============ PUBLIC ROUTES ============

// Expose public Supabase config to frontend
app.get('/api/public-config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// Endpoint de diagnostic storage (temporaire)
app.get('/api/debug/storage', requireAuth, async (req, res) => {
  const testPath = `debug/test_${Date.now()}.txt`;
  const { error } = await supabase.storage
    .from('attachments')
    .upload(testPath, Buffer.from('test'), { contentType: 'text/plain', upsert: true });
  if (error) return res.json({ ok: false, error: error.message, hint: 'Vérifier SUPABASE_KEY sur Railway' });
  await supabase.storage.from('attachments').remove([testPath]);
  res.json({ ok: true, message: 'Storage fonctionne correctement' });
});

function getAppUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// ============ ADMIN ROUTES ============

// Invite a user
app.post('/api/admin/invite', requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis.' });

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getAppUrl(req)}/login.html`
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, user: { id: data.user.id, email: data.user.email } });
});

// List all users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) return res.status(500).json({ error: error.message });
  const users = data.users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.user_metadata?.display_name || '',
    is_admin: u.user_metadata?.is_admin || false,
    confirmed: !!u.confirmed_at,
    last_sign_in: u.last_sign_in_at
  }));
  res.json(users);
});

// Delete a user
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ============ TEMPLATES API (shared) ============

app.get('/api/templates', requireAuth, async (req, res) => {
  res.json(await getTemplates());
});

app.post('/api/templates', requireAuth, async (req, res) => {
  const { name, subject, body } = req.body;
  if (!name || !subject || !body) return res.status(400).json({ error: 'name, subject et body sont requis.' });
  try {
    res.json({ success: true, template: await addTemplate({ name, subject, body }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/templates/:id', requireAuth, async (req, res) => {
  try {
    const { name, subject, body, attachment_url, attachment_name } = req.body;
    res.json({ success: true, template: await updateTemplate(req.params.id, { name, subject, body, attachment_url, attachment_name }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/templates/:id', requireAuth, async (req, res) => {
  try { await deleteTemplate(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload attachment
app.post('/api/templates/:id/attachment', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    const templates = await getTemplates();
    const template = templates.find(t => t.id === req.params.id);
    if (!template) return res.status(404).json({ error: 'Template introuvable.' });

    const filePath = `${req.params.id}/${req.file.originalname}`;

    // Supprimer l'ancien fichier s'il existe (ignore les erreurs)
    await supabase.storage.from('attachments').remove([filePath]).catch(() => {});

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (uploadError) return res.status(500).json({ error: `Erreur Supabase Storage : ${uploadError.message}` });

    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) return res.status(500).json({ error: 'Impossible de récupérer l\'URL publique.' });

    await updateTemplate(req.params.id, {
      name: template.name,
      subject: template.subject,
      body: template.body,
      attachment_url: publicUrl,
      attachment_name: req.file.originalname
    });

    res.json({ success: true, attachment_url: publicUrl, attachment_name: req.file.originalname });
  } catch (err) {
    console.error('Upload attachment error:', err.message);
    res.status(500).json({ error: `Erreur serveur : ${err.message}` });
  }
});

app.delete('/api/templates/:id/attachment', requireAuth, async (req, res) => {
  const templates = await getTemplates();
  const template = templates.find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Template introuvable.' });
  if (template.attachment_url) {
    await supabase.storage.from('attachments').remove([`${req.params.id}/${template.attachment_name}`]);
  }
  await updateTemplate(req.params.id, { ...template, attachment_url: null, attachment_name: null });
  res.json({ success: true });
});

// ============ USER CONFIG API (per-user Gmail) ============

async function getGmailClient(userId) {
  const config = await getUserConfig(userId);
  const clientId = config.gmailClientId;
  const clientSecret = config.gmailClientSecret;
  const refreshToken = config.gmailRefreshToken;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

app.get('/api/config/status', requireAuth, async (req, res) => {
  const config = await getUserConfig(req.user.id);
  const hasCredentials = !!(config.gmailClientId);
  const hasToken = !!(config.gmailRefreshToken);
  const gmailUser = config.gmailUser || '';
  res.json({ connected: hasCredentials && hasToken, gmailUser, hasCredentials, hasToken });
});

app.post('/api/config/credentials', requireAuth, async (req, res) => {
  const { gmailClientId, gmailClientSecret, gmailUser, gmailDisplayName } = req.body;
  if (!gmailClientId || !gmailClientSecret || !gmailUser) return res.status(400).json({ error: 'Tous les champs sont requis.' });
  await setUserConfigKey(req.user.id, 'gmailClientId', gmailClientId);
  await setUserConfigKey(req.user.id, 'gmailClientSecret', gmailClientSecret);
  await setUserConfigKey(req.user.id, 'gmailUser', gmailUser);
  if (gmailDisplayName) await setUserConfigKey(req.user.id, 'gmailDisplayName', gmailDisplayName);
  res.json({ success: true });
});

app.get('/api/config/oauth/start', requireAuth, async (req, res) => {
  const config = await getUserConfig(req.user.id);
  if (!config.gmailClientId || !config.gmailClientSecret) {
    return res.status(400).json({ error: 'Configure d\'abord Client ID et Client Secret.' });
  }
  const redirectUri = `${getAppUrl(req)}/api/config/oauth/callback`;
  const oauth2Client = new google.auth.OAuth2(config.gmailClientId, config.gmailClientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.settings.basic'],
    prompt: 'consent',
    state: req.user.id   // pass userId through OAuth state
  });
  res.json({ authUrl });
});

app.get('/api/config/oauth/callback', async (req, res) => {
  const { code, error, state: userId } = req.query;
  if (error || !code || !userId) return res.redirect('/config.html?error=oauth_failed');

  const { data } = await supabase.from('user_configs').select('value').eq('user_id', userId).eq('key', 'gmailClientId').single();
  const { data: secretData } = await supabase.from('user_configs').select('value').eq('user_id', userId).eq('key', 'gmailClientSecret').single();
  if (!data || !secretData) return res.redirect('/config.html?error=oauth_failed');

  const redirectUri = `${getAppUrl(req)}/api/config/oauth/callback`;
  const oauth2Client = new google.auth.OAuth2(data.value, secretData.value, redirectUri);
  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (tokens.refresh_token) {
      await supabase.from('user_configs').upsert({ user_id: userId, key: 'gmailRefreshToken', value: tokens.refresh_token }, { onConflict: 'user_id,key' });
    }
    res.redirect('/config.html?connected=true');
  } catch (err) {
    console.error('OAuth error:', err.message);
    res.redirect(`/config.html?error=${encodeURIComponent(err.message)}`);
  }
});

app.post('/api/config/disconnect', requireAuth, async (req, res) => {
  await deleteUserConfigKey(req.user.id, 'gmailRefreshToken');
  res.json({ success: true });
});

app.get('/api/config/signature', requireAuth, async (req, res) => {
  const config = await getUserConfig(req.user.id);
  res.json({ signature: config.gmailSignature || '' });
});

app.post('/api/config/signature', requireAuth, async (req, res) => {
  await setUserConfigKey(req.user.id, 'gmailSignature', req.body.signature || '');
  res.json({ success: true });
});

app.get('/api/config/signature/import', requireAuth, async (req, res) => {
  const gmail = await getGmailClient(req.user.id);
  if (!gmail) return res.status(400).json({ error: 'Gmail non configuré.' });
  const config = await getUserConfig(req.user.id);
  try {
    const response = await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: config.gmailUser });
    res.json({ signature: response.data.signature || '' });
  } catch (err) {
    res.status(500).json({ error: `Impossible de récupérer la signature : ${err.message}` });
  }
});

// ============ SEND EMAIL ============

app.post('/api/send', requireAuth, async (req, res) => {
  const { templateId, prenom, email, date_rdv } = req.body;
  if (!templateId || !prenom || !email) return res.status(400).json({ error: 'templateId, prenom et email sont requis.' });

  const templates = await getTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) return res.status(404).json({ error: 'Template introuvable.' });

  // Vérifier que les variables requises sont bien fournies
  if ((template.body?.includes('{{date_rdv}}') || template.subject?.includes('{{date_rdv}}')) && !date_rdv) {
    return res.status(400).json({ error: 'La date du RDV est requise pour ce template.' });
  }

  const gmail = await getGmailClient(req.user.id);
  if (!gmail) return res.status(400).json({ error: 'Gmail non configuré. Va dans Configuration.' });

  const config = await getUserConfig(req.user.id);
  const signature = config.gmailSignature || '';
  const subject = template.subject
    .replace(/\{\{prenom\}\}/g, prenom)
    .replace(/\{\{date_rdv\}\}/g, date_rdv || '');
  const bodyContent = template.body
    .replace(/\{\{prenom\}\}/g, prenom)
    .replace(/\{\{date_rdv\}\}/g, date_rdv || '');
  const htmlBody = signature
    ? `${bodyContent}<br><br><hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0;">${signature}`
    : bodyContent;

  const email_addr = config.gmailUser || '';
  const name = config.gmailDisplayName || '';
  const senderHeader = name
    ? `=?UTF-8?B?${Buffer.from(name).toString('base64')}?= <${email_addr}>`
    : email_addr;

  let attachmentFile = null;
  if (template.attachment_url) {
    try {
      const fetchRes = await fetch(template.attachment_url);
      if (fetchRes.ok) {
        const buf = Buffer.from(await fetchRes.arrayBuffer());
        attachmentFile = {
          buffer: buf,
          mimetype: fetchRes.headers.get('content-type') || 'application/octet-stream',
          originalname: template.attachment_name || 'document'
        };
      }
    } catch (err) { console.error('Attachment fetch error:', err.message); }
  }

  const raw = createRawEmail(senderHeader, email, subject, htmlBody, attachmentFile);
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

// Global error handler — converts all Express/multer errors to JSON (never HTML)
app.use((err, req, res, next) => {
  console.error('Express error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
});

app.listen(PORT, () => console.log(`GMailSender running on http://localhost:${PORT}`));
