const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

// Default template from original templates.js
const DEFAULT_TEMPLATES = [
  {
    id: 'george-v',
    name: 'George V — Foncière Renaissance',
    subject: 'Suite à notre échange — Opération 40 Avenue George V',
    body: `{{prenom}},\n\nSuite à notre échange de ce jour, tu trouveras ci-dessous un récapitulatif de notre opération au 40 Avenue George V :\n\n<b>Opérateur :</b> Foncière Renaissance, +10 ans d'expérience, +1,7Mds € d'AUM, spécialisé dans les opérations Value-Add sur des trophy assets parisiens\n\n<b>Opération (en cours) :</b> Acquisition réalisée, évictions réalisées, travaux préparatoire finis, permis de construire en cours de purge, bail commercial signé avec une grande maison de luxe pour l'intégralité de la cellule commerciale, sécurisant plus de 50% des loyers post-opération.\n\n<b>Titre financier :</b> Titre obligataire, maturité 36 mois renouvelable 2 x 6 mois, rendements 11.5% annuels versés In Fine à partir de 100K€.\n\nCi-dessous le lien renvoyant à notre data room qui regroupe tous les éléments de l'opération.\n\n<a href="https://LIEN-DATA-ROOM-ICI">Accéder à la data room</a>\n\nN'hésite pas si tu as des clients intéressés qui veulent en savoir plus sur l'opération, à nous faire intervenir pour présenter en ta compagnie si tu penses que ça peut être utile,\n\nEn l'attente de ton retour, Gauthier et moi restons disponibles au besoin,\n\nBien à toi,`
  }
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Config ---

function getConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

function saveConfig(config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// --- Templates ---

function getTemplates() {
  ensureDataDir();
  if (!fs.existsSync(TEMPLATES_FILE)) {
    saveTemplates(DEFAULT_TEMPLATES);
    return DEFAULT_TEMPLATES;
  }
  return JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8'));
}

function saveTemplates(templates) {
  ensureDataDir();
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
}

module.exports = { getConfig, saveConfig, getTemplates, saveTemplates };
