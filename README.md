# GMailSender

Outil d'envoi rapide d'emails post cold-call. Sélectionne un template, remplis prénom + email, envoie en un clic.

## Setup

### 1. Créer les credentials Google

1. Va sur [Google Cloud Console](https://console.cloud.google.com/)
2. Crée un nouveau projet (ou utilise un existant)
3. Active l'API **Gmail API** (APIs & Services > Enable APIs)
4. Va dans **APIs & Services > Credentials**
5. Clique **Create Credentials > OAuth client ID**
6. Type : **Desktop app**
7. Note le `Client ID` et `Client Secret`

### 2. Configurer l'app

```bash
cp .env.example .env
```

Remplis `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` et `GMAIL_USER` dans `.env`.

### 3. Obtenir le refresh token

```bash
npm run get-token
```

Suis les instructions (ouvre l'URL, autorise, colle le code). Copie le refresh token dans `.env` sous `GMAIL_REFRESH_TOKEN`.

### 4. Lancer

```bash
npm start
```

Ouvre http://localhost:3000

## Déployer sur Railway

1. Push le repo sur GitHub
2. Va sur [railway.app](https://railway.app), crée un nouveau projet depuis GitHub
3. Ajoute les variables d'environnement (Settings > Variables) :
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
   - `GMAIL_USER`
4. Railway détecte automatiquement Node.js et lance `npm start`

## Ajouter un template

Édite `templates.js` et ajoute un objet dans le tableau :

```js
{
  id: 'mon-template',
  name: 'Nom affiché dans le dropdown',
  subject: 'Objet du mail — {{prenom}}',
  body: `Bonjour {{prenom}}, ...`
}
```

`{{prenom}}` est remplacé automatiquement par le prénom saisi.
