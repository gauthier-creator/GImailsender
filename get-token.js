/**
 * Script helper pour obtenir un refresh token Gmail.
 *
 * Usage:
 *   1. Remplis GMAIL_CLIENT_ID et GMAIL_CLIENT_SECRET dans .env
 *   2. Lance: npm run get-token
 *   3. Ouvre l'URL affichée dans ton navigateur
 *   4. Autorise l'accès, copie le code
 *   5. Colle le code dans le terminal
 *   6. Le refresh token s'affiche — copie-le dans .env
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.send'],
  prompt: 'consent'
});

console.log('\n=== GMailSender — Obtenir un Refresh Token ===\n');
console.log('1. Ouvre cette URL dans ton navigateur:\n');
console.log(authUrl);
console.log('\n2. Autorise l\'accès et copie le code affiché.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('3. Colle le code ici: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\n=== Ton Refresh Token ===\n');
    console.log(tokens.refresh_token);
    console.log('\nCopie cette valeur dans ta variable d\'env GMAIL_REFRESH_TOKEN\n');
  } catch (err) {
    console.error('Erreur:', err.message);
  }
  rl.close();
});
