// server.js — Serveur Express + API locale Lassonde
require('dotenv').config();
const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const Anthropic  = require('@anthropic-ai/sdk');
const db         = require('./database');
const Jimp       = require('jimp');
const ZX         = require('@zxing/library');

// ─── DÉCODAGE CODE-BARRES (UPC price-embedded) ───────────────────────────────
// Format type 2 : "2 PPPPP C #### C" → PLU (5 chiffres) + prix intégré (4 chiffres).
function parsePLU(code) {
  if (!code) return null;
  let c = String(code).replace(/\D/g, '');
  if (c.length === 13 && c[0] === '0') c = c.slice(1);   // EAN-13 avec 0 → UPC-A 12
  if (c.length !== 12 || c[0] !== '2') return null;       // type 2 = poids/prix variable
  return { plu: c.slice(1, 6), prix: parseInt(c.slice(7, 11)) / 100, code: c };
}

async function decodeBarcode(base64) {
  const origErr = console.error; console.error = () => {};   // ZXing spamme stderr sur chaque échec
  try {
    const img = await Jimp.read(Buffer.from(base64, 'base64'));
    for (const scale of [1, 2, 1.5]) {
      const im = scale === 1 ? img : img.clone().scale(scale);
      const { data, width, height } = im.bitmap;
      const lum = new Uint8ClampedArray(width * height);
      for (let i = 0; i < width * height; i++)
        lum[i] = (data[i*4]*0.299 + data[i*4+1]*0.587 + data[i*4+2]*0.114) | 0;
      const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(lum, width, height)));
      const reader = new ZX.MultiFormatReader();
      const hints = new Map();
      hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.EAN_13]);
      hints.set(ZX.DecodeHintType.TRY_HARDER, true);
      try { const p = parsePLU(reader.decode(bitmap, hints).getText()); if (p) return p; } catch (_) {}
    }
  } catch (_) {} finally { console.error = origErr; }
  return null;
}

const anthropic = new Anthropic({
  apiKey:         process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'anthropic-beta': 'web-search-2025-03-05' },
});

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'lassonde-app',
    ts:      new Date().toISOString(),
    env: {
      shopify:   !!process.env.SHOPIFY_ACCESS_TOKEN,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
    },
  });
});

// ─── CONFIG ──────────────────────────────────────────────────────────────────
app.get('/config', (req, res) => {
  res.json({
    anthropicKey:   process.env.ANTHROPIC_API_KEY    || '',
    shopifyStore:   process.env.SHOPIFY_STORE_URL     || 'lassonde-wagyu-test.myshopify.com',
    shopifyToken:   process.env.SHOPIFY_ACCESS_TOKEN  || '',
    shopifyVersion: process.env.SHOPIFY_API_VERSION   || '2026-04',
  });
});

// ─── API INVENTAIRE ───────────────────────────────────────────────────────────

// Liste tout le stock (filtrable par ?statut=disponible&coupe=ribeye)
app.get('/api/inventaire', (req, res) => {
  try {
    const items = db.getInventaire({
      statut: req.query.statut || null,
      coupe:  req.query.coupe  || null,
    });
    res.json({ ok: true, count: items.length, items });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Résumé : totaux, par coupe, par statut
app.get('/api/inventaire/resume', (req, res) => {
  try { res.json({ ok: true, ...db.getResume() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Ajouter un sac scanné + sync Shopify
app.post('/api/inventaire', async (req, res) => {
  try {
    const data = req.body;
    if (!data.coupe) return res.status(400).json({ ok: false, error: 'coupe requis' });

    // 1. Insérer en base locale
    const id = db.insertSac(data);

    // 1b. Sauvegarder la photo du scan (base64) si fournie
    if (data.photo) {
      try { db.setSacPhoto(id, data.photo); }
      catch (pe) { console.warn('Photo save warning:', pe.message); }
    }

    // 2. Sync Shopify (best-effort, non bloquant pour la réponse)
    let shopifyId = null;
    if (process.env.SHOPIFY_ACCESS_TOKEN) {
      try { shopifyId = await createShopifyProduct(data); }
      catch (se) { console.warn('Shopify sync warning:', se.message); }
    }
    if (shopifyId) db.updateStatut(id, 'disponible', shopifyId);

    res.json({ ok: true, id, shopify_product_id: shopifyId });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Mettre à jour statut (vendu, réservé, disponible)
app.put('/api/inventaire/:id', (req, res) => {
  try {
    const { statut, shopify_product_id } = req.body;
    if (!statut) return res.status(400).json({ ok: false, error: 'statut requis' });
    db.updateStatut(parseInt(req.params.id), statut, shopify_product_id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Retirer un sac de l'inventaire (erreur de scan, doublon…)
app.delete('/api/inventaire/:id', (req, res) => {
  try {
    const r = db.supprimerSac(parseInt(req.params.id));
    if (!r.changes) return res.status(404).json({ ok: false, error: 'sac introuvable' });
    res.json({ ok: true, supprime: r.changes });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Reclasser un sac (corriger la coupe — erreur de scan)
app.post('/api/inventaire/:id/reclasser', (req, res) => {
  try {
    const { coupe } = req.body;
    if (!coupe) return res.status(400).json({ ok: false, error: 'coupe requise' });
    const r = db.updateCoupe(parseInt(req.params.id), coupe);
    if (!r.changes) return res.status(404).json({ ok: false, error: 'sac introuvable' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Renommer une coupe au complet (plusieurs sacs d'un coup)
app.post('/api/inventaire/reclasser-lot', (req, res) => {
  try {
    const { ids, coupe } = req.body;
    if (!Array.isArray(ids) || !ids.length || !coupe) {
      return res.status(400).json({ ok: false, error: 'ids et coupe requis' });
    }
    const r = db.reclasserLot(ids.map(Number), coupe);
    res.json({ ok: true, renommes: r.changes });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Revoir la photo d'un sac scanné
app.get('/api/inventaire/:id/photo', (req, res) => {
  try {
    const p = db.getPhotoPath(parseInt(req.params.id));
    if (!p) return res.status(404).json({ ok: false, error: 'pas de photo' });
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(p);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API BÊTES ────────────────────────────────────────────────────────────────
app.get('/api/betes', (req, res) => {
  try { res.json({ ok: true, betes: db.getBetes() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/betes', (req, res) => {
  try { db.upsertBete(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API TROUPEAU (bêtes vivantes pâturage + bêtes au frigo) ─────────────────

// Liste complète du troupeau avec agrégats morceaux par bête
app.get('/api/troupeau', (req, res) => {
  try {
    const troupeau = db.getTroupeau();
    const statsVaches = db.getAllStatsVaches();
    // Ajouter les stats de reproduction à chaque vache
    const troupeauAvecStats = troupeau.map(b => ({
      ...b,
      ...(b.type === 'vache' && b.tag ? statsVaches[b.tag] || { vivants: 0, morts: 0 } : {})
    }));
    res.json({ ok: true, troupeau: troupeauAvecStats });
  }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Créer / mettre à jour une bête (tag, naissance, poids vif, etc.)
app.post('/api/troupeau', (req, res) => {
  try {
    const d = req.body;
    if (d.numero_bete == null || d.numero_bete === '') return res.status(400).json({ ok: false, error: 'numero_bete requis' });
    const bete = db.upsertBete(d);
    res.json({ ok: true, bete });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Rattacher tous les sacs sans bête à une bête (ex: le bœuf test #0)
app.post('/api/troupeau/:numero/rattacher-orphelins', (req, res) => {
  try {
    const r = db.rattacherOrphelins(parseInt(req.params.numero));
    res.json({ ok: true, rattaches: r.changes });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Retirer un bœuf du troupeau (ses morceaux sont détachés, pas supprimés)
app.delete('/api/troupeau/:numero', (req, res) => {
  try {
    const r = db.supprimerBete(parseInt(req.params.numero));
    if (!r.supprime) return res.status(404).json({ ok: false, error: 'bête introuvable' });
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Import en masse du troupeau (liste papier scannée ou CSV) — max 2000 bêtes
app.post('/api/troupeau/import', (req, res) => {
  try {
    const { betes } = req.body;
    if (!Array.isArray(betes) || !betes.length) {
      return res.status(400).json({ ok: false, error: 'betes (tableau non vide) requis' });
    }
    if (betes.length > 2000) {
      return res.status(400).json({ ok: false, error: 'maximum 2000 bêtes par import' });
    }
    const resultat = db.importerBetes(betes);
    res.json({ ok: true, ...resultat });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Scan vision d'un REGISTRE DE TROUPEAU papier (liste des bêtes de la ferme)
app.post('/api/scan-liste-betes', async (req, res) => {
  res.setTimeout(180000);
  try {
    const { image, mimeType = 'image/jpeg' } = req.body;
    if (!image) return res.status(400).json({ ok: false, error: 'image base64 requise' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'Clé Anthropic manquante' });

    const REGISTRE_PROMPT = `Tu analyses la photo d'un REGISTRE DE TROUPEAU bovin québécois (liste des animaux vivants d'une ferme — Les Élevages Lassonde).
Chaque ligne = un animal, identifié par son tag (boucle d'oreille MAPAQ, souvent 15 chiffres commençant par 124).
Si l'image ne contient PAS une liste d'animaux, réponds {"liste":false}.
Sinon, réponds UNIQUEMENT avec ce JSON (sans texte avant ni après) :
{
  "liste": true,
  "betes": [
    { "tag": "124000312456789", "nom": null, "type": "bœuf", "date_naissance": "2024-02-10", "poids_vif_kg": 615, "race": "Wagyu", "notes": null }
  ]
}
Règles :
- Une entrée par ligne du registre, dans l'ordre.
- type : "bœuf", "veau" ou "vache" — déduis du sexe/catégorie si présent (mâle/bouvillon → bœuf, femelle → vache), sinon null.
- date_naissance convertie en YYYY-MM-DD. null si absente ou illisible.
- poids_vif_kg : nombre en kg. null si absent. Ne devine JAMAIS un chiffre.
- Garde les tags EXACTEMENT comme écrits (chiffres et espaces).`;

    const result = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 8192,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
          { type: 'text', text: REGISTRE_PROMPT },
        ]}],
      });
      const request = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      }, resp => {
        let data = '';
        resp.on('data', d => data += d);
        resp.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) return reject(new Error(j.error.message));
            const text = j.content?.[0]?.text ?? '';
            const m = text.match(/\{[\s\S]*\}/);
            if (!m) return reject(new Error('Réponse Claude invalide: ' + text.slice(0, 100)));
            resolve(JSON.parse(m[0]));
          } catch (e) { reject(e); }
        });
      });
      request.on('error', reject);
      request.write(body);
      request.end();
    });

    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Changer le statut d'une bête : pâturage → abattoir → frigo → vendu
app.put('/api/troupeau/:numero/statut', (req, res) => {
  try {
    const { statut, date_abattage, date_envoi_abattage } = req.body;
    const STATUTS = ['pâturage', 'abattoir', 'frigo', 'vendu'];
    if (!STATUTS.includes(statut)) {
      return res.status(400).json({ ok: false, error: `statut doit être : ${STATUTS.join(' | ')}` });
    }
    const bete = db.setStatutBete(parseInt(req.params.numero), statut, { date_abattage, date_envoi_abattage });
    if (!bete) return res.status(404).json({ ok: false, error: 'bête introuvable' });
    res.json({ ok: true, bete });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Rapport complet d'une bête : fiche + liste des morceaux + poids/valeur totale
app.get('/api/troupeau/:numero/rapport', (req, res) => {
  try {
    const rapport = db.getRapportBete(parseInt(req.params.numero));
    if (!rapport) return res.status(404).json({ ok: false, error: 'bête introuvable' });
    res.json({ ok: true, ...rapport });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API SCAN LISTE DE DÉCOUPE (vérification commande client) ────────────────
// Le client photographie la liste papier reçue avec son bœuf → Claude extrait
// toutes les lignes pour permettre le pointage morceau par morceau.
app.post('/api/scan-liste', async (req, res) => {
  res.setTimeout(180000);
  try {
    const { image, mimeType = 'image/jpeg' } = req.body;
    if (!image) return res.status(400).json({ ok: false, error: 'image base64 requise' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'Clé Anthropic manquante' });

    const LISTE_PROMPT = `Tu analyses la photo d'une LISTE DE DÉCOUPE de boucherie québécoise (Les Élevages Lassonde).
C'est la liste papier remise au client avec son bœuf : chaque ligne = une coupe avec quantité/poids/prix.
Si l'image ne contient PAS une liste de découpe, réponds {"liste":false}.
Sinon, réponds UNIQUEMENT avec ce JSON (sans texte avant ni après) :
{
  "liste": true,
  "numero_bete": "numéro ou tag de la bête si visible, sinon null",
  "lignes": [
    { "coupe": "nom de la coupe", "quantite": 2, "poids_kg": 0.823, "prix_total": 73.44 }
  ]
}
Règles :
- Une entrée par ligne de la liste. quantite = nombre de paquets si indiqué, sinon 1.
- poids_kg et prix_total : null si illisibles. Ne devine jamais un chiffre.
- Garde les noms de coupes EXACTEMENT comme écrits sur la liste.`;

    const result = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
          { type: 'text', text: LISTE_PROMPT },
        ]}],
      });
      const request = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      }, resp => {
        let data = '';
        resp.on('data', d => data += d);
        resp.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) return reject(new Error(j.error.message));
            const text = j.content?.[0]?.text ?? '';
            const m = text.match(/\{[\s\S]*\}/);
            if (!m) return reject(new Error('Réponse Claude invalide: ' + text.slice(0, 100)));
            resolve(JSON.parse(m[0]));
          } catch (e) { reject(e); }
        });
      });
      request.on('error', reject);
      request.write(body);
      request.end();
    });

    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API PRIX MARCHÉ ──────────────────────────────────────────────────────────
app.get('/api/prix-marche', (req, res) => {
  try {
    const data = req.query.coupe
      ? db.comparerPrix(req.query.coupe)
      : db.getPrixMarche();
    res.json({ ok: true, data });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Clé normalisée d'une coupe (identique au front pour faire correspondre les prix)
function coupeKey(coupe) {
  return (coupe || 'autre').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bde\s+boeuf.*|\bdu\s+boeuf.*|wagyu.*|halal.*/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() || 'autre';
}

// Prix suggérés du marché — déjà connus (cache)
app.get('/api/prix-marche/suggeres', (req, res) => {
  try { res.json({ ok: true, ...db.getPrixSuggeres() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Rafraîchir les prix suggérés via recherche web (à la demande — peut prendre ~15-30s)
app.post('/api/prix-marche/rafraichir', async (req, res) => {
  res.setTimeout(120000);
  try {
    // Coupes distinctes en stock (regroupées par clé normalisée)
    const rows = db.db.prepare("SELECT DISTINCT coupe FROM inventaire WHERE statut = 'disponible'").all();
    const byKey = {};
    for (const r of rows) { const k = coupeKey(r.coupe); if (!byKey[k]) byKey[k] = r.coupe; }
    const noms = Object.values(byKey);
    if (!noms.length) return res.json({ ok: true, prix: [], date_maj: null });

    const prompt = `Recherche les prix de détail actuels (dollars canadiens par kg) du **bœuf WAGYU** vendu au détail au **Canada** en ${new Date().getFullYear()}.

IMPORTANT — CONTEXTE DE PRIX :
- UNIQUEMENT du bœuf **Wagyu** (Wagyu pur, fullblood, ou F1/croisé Wagyu). PAS de l'Angus, PAS du bœuf commercial ordinaire, PAS d'autres races.
- Marché **canadien** (Québec/Canada), prix de DÉTAIL au consommateur, en CAD/kg.
- Le Wagyu se vend BEAUCOUP plus cher que le bœuf ordinaire (souvent 3 à 6× le prix de l'Angus). Tes prix doivent refléter du vrai Wagyu premium canadien.

Pour CHACUNE de ces coupes, donne une estimation de prix de détail Wagyu CAD/kg :
${noms.join(', ')}

RÈGLES :
- Donne TOUJOURS un nombre pour chaque coupe (jamais null), basé sur les prix WAGYU courants au Canada et le positionnement de la coupe (filet/tomahawk = haut de gamme, haché/os = bas de gamme).
- Un objet par coupe, en gardant le nom EXACT de la liste.

Réponds UNIQUEMENT avec le tableau JSON, sans aucun texte autour :
[{"coupe":"<nom exact>","prix_kg":<nombre CAD/kg>}]`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1600,
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
      messages:   [{ role: 'user', content: prompt }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Réponse marché illisible');
    const arr = JSON.parse(m[0]);

    const list = (Array.isArray(arr) ? arr : [])
      .filter(x => x && x.prix_kg != null && !isNaN(parseFloat(x.prix_kg)))
      .map(x => ({ coupe_key: coupeKey(x.coupe), coupe: x.coupe, prix_kg: Math.round(parseFloat(x.prix_kg) * 100) / 100 }));

    db.setPrixSuggeres(list);
    res.json({ ok: true, ...db.getPrixSuggeres() });
  } catch (e) {
    console.error('PRIX MARCHÉ ERROR:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── API VENTES ───────────────────────────────────────────────────────────────
// Trouver dans le stock le sac qui correspond à une étiquette scannée (avant de vendre)
app.post('/api/vente/chercher', (req, res) => {
  try {
    const { coupe, poids_kg } = req.body;
    if (!coupe) return res.status(400).json({ ok: false, error: 'coupe requise' });
    const sac = db.chercherSacDisponible(coupe, parseFloat(poids_kg) || null);
    res.json({ ok: true, sac });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Enregistrer une vente (marque le sac vendu + sort du stock)
app.post('/api/ventes', (req, res) => {
  try {
    if (!req.body.inventaire_id) return res.status(400).json({ ok: false, error: 'inventaire_id requis' });
    const id = db.enregistrerVente(req.body);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Historique des ventes
app.get('/api/ventes', (req, res) => {
  try { res.json({ ok: true, ventes: db.getVentes() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Encaisser un panier (plusieurs morceaux + mode de paiement)
app.post('/api/vente/encaisser', (req, res) => {
  try {
    const { inventaire_ids, mode_paiement } = req.body;
    if (!Array.isArray(inventaire_ids) || !inventaire_ids.length) {
      return res.status(400).json({ ok: false, error: 'panier vide' });
    }
    const r = db.encaisserPanier(inventaire_ids.map(Number), mode_paiement || null);
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Annuler une vente → remet le morceau en stock
app.delete('/api/ventes/:id', (req, res) => {
  try {
    const r = db.annulerVente(parseInt(req.params.id));
    if (!r.ok) return res.status(404).json({ ok: false, error: 'vente introuvable' });
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API DASHBOARD ────────────────────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  try { res.json({ ok: true, ...db.getDashboard() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── SYNC SHOPIFY → LOCAL (webhook ou polling) ───────────────────────────────
app.post('/api/shopify/sync-ventes', async (req, res) => {
  try {
    const orders = await fetchShopifyOrders();
    let synced = 0;
    for (const order of orders) {
      for (const line of order.lineItems) {
        const sac = db.db.prepare(
          'SELECT id FROM inventaire WHERE shopify_product_id LIKE ? AND statut != "vendu"'
        ).get('%' + line.productId + '%');
        if (sac) {
          db.enregistrerVente({
            inventaire_id:    sac.id,
            shopify_order_id: order.id,
            prix_vendu:       parseFloat(line.price),
          });
          synced++;
        }
      }
    }
    res.json({ ok: true, synced });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── SHOPIFY HELPERS ─────────────────────────────────────────────────────────
function shopifyGQL(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req  = https.request({
      hostname: process.env.SHOPIFY_STORE_URL || 'lassonde-wagyu-test.myshopify.com',
      path:     `/admin/api/${process.env.SHOPIFY_API_VERSION || '2026-04'}/graphql.json`,
      method:   'POST',
      headers: {
        'Content-Type':            'application/json',
        'X-Shopify-Access-Token':  process.env.SHOPIFY_ACCESS_TOKEN || '',
        'Content-Length':          Buffer.byteLength(body),
      },
    }, resp => {
      let data = '';
      resp.on('data', d => data += d);
      resp.on('end', () => {
        const j = JSON.parse(data);
        if (j.errors) reject(new Error(j.errors[0]?.message));
        else resolve(j.data);
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function createShopifyProduct(item) {
  const title = [item.coupe, item.poids_kg ? item.poids_kg + ' kg' : null, item.meilleur_avant ? 'Exp. ' + item.meilleur_avant : null]
    .filter(Boolean).join(' — ');
  const res = await shopifyGQL(
    `mutation productCreate($input:ProductInput!){
       productCreate(input:$input){
         product{id variants(first:1){edges{node{id}}}}
         userErrors{field message}
       }
     }`,
    { input: { title, vendor:'Les Élevages Lassonde', productType:'Viande Wagyu Halal',
        tags:['Wagyu','Halal','Scanner',item.coupe].filter(Boolean), status:'ACTIVE' } }
  );
  if (res.productCreate.userErrors.length) throw new Error(res.productCreate.userErrors[0].message);
  const prod  = res.productCreate.product;
  const varId = prod.variants.edges[0]?.node?.id;
  if (varId && item.prix_total) {
    await shopifyGQL(
      `mutation productVariantsBulkUpdate($productId:ID!,$variants:[ProductVariantsBulkInput!]!){
         productVariantsBulkUpdate(productId:$productId,variants:$variants){
           productVariants{id} userErrors{field message}
         }
       }`,
      { productId: prod.id, variants:[{ id:varId, price: parseFloat(item.prix_total).toFixed(2),
          inventoryPolicy:'DENY', taxable:true, inventoryItem:{requiresShipping:true} }] }
    );
  }
  return prod.id;
}

async function fetchShopifyOrders() {
  const data = await shopifyGQL(`{
    orders(first:50, query:"fulfillment_status:fulfilled") {
      edges { node {
        id
        lineItems(first:10) { edges { node { productId price quantity } } }
      }}
    }
  }`);
  return (data.orders?.edges || []).map(e => ({
    id:        e.node.id,
    lineItems: e.node.lineItems.edges.map(l => ({
      productId: l.node.productId,
      price:     l.node.price,
      quantity:  l.node.quantity,
    })),
  }));
}

// ─── API SCAN VISION ─────────────────────────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  res.setTimeout(120000);
  try {
    const { image, mimeType = 'image/jpeg' } = req.body;
    if (!image) return res.status(400).json({ ok: false, error: 'image base64 requise' });

    // ─── 1) Code-barres d'abord (instantané, gratuit) ───
    const bc = await decodeBarcode(image);
    let pluInconnu = null;
    if (bc) {
      const p = db.getPlu(bc.plu);
      if (p && p.prix_kg) {
        const poids_kg = Math.round((bc.prix / p.prix_kg) * 1000) / 1000;
        return res.json({ ok: true, result: {
          etiquette: true, coupe: p.coupe, poids_kg, poids: poids_kg.toFixed(3) + ' kg',
          prix_kg: p.prix_kg, total: bc.prix, meilleur_avant: null, source: 'barcode', plu: bc.plu,
        }});
      }
      pluInconnu = bc;   // PLU pas encore dans la banque → on l'apprendra après la vision
    }

    // ─── 2) Sinon (pas de code-barres ou PLU inconnu) → vision ───
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ ok: false, error: 'Clé Anthropic manquante' });

    const VISION_PROMPT = `Tu analyses une étiquette de boucherie québécoise pour Les Élevages Lassonde.
Si l'image ne contient PAS une étiquette de viande, réponds {"etiquette":false}.
Sinon, réponds UNIQUEMENT avec ce JSON (sans texte avant ni après) :
{
  "etiquette": true,
  "coupe": "nom de la coupe",
  "poids": "0.823 kg",
  "poids_kg": 0.823,
  "prix_kg": 89.24,
  "total": 73.44,
  "meilleur_avant": "YYYY-MM-DD ou null"
}`;

    const result = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
          { type: 'text', text: VISION_PROMPT },
        ]}],
      });
      const request = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      }, resp => {
        let data = '';
        resp.on('data', d => data += d);
        resp.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) return reject(new Error(j.error.message));
            const text = j.content?.[0]?.text ?? '';
            const m = text.match(/\{[\s\S]*\}/);
            if (!m) return reject(new Error('Réponse Claude invalide: ' + text.slice(0, 100)));
            resolve(JSON.parse(m[0]));
          } catch (e) { reject(e); }
        });
      });
      request.on('error', reject);
      request.write(body);
      request.end();
    });

    // Apprentissage : si un code-barres avait un PLU inconnu, on le relie à la coupe lue par la vision
    if (pluInconnu && result && result.coupe) {
      try { db.upsertPlu(pluInconnu.plu, result.coupe, result.prix_kg || null); } catch (_) {}
      result.plu = pluInconnu.plu; result.source = 'vision+plu-appris';
    } else if (result) {
      result.source = 'vision';
    }

    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Banque PLU (consultation)
app.get('/api/plu', (req, res) => {
  try { res.json({ ok: true, plu: db.getAllPlu() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API AGENT (avec web search) ─────────────────────────────────────────────
app.post('/api/agent', async (req, res) => {
  res.setTimeout(120000);
  try {
    const { message, historique = [] } = req.body;
    if (!message) return res.status(400).json({ ok: false, error: 'message requis' });

    const dashboard = db.db.prepare(`
      SELECT coupe,
        COUNT(*) as quantite,
        ROUND(SUM(poids_kg),2) as poids_total,
        ROUND(SUM(prix_total),2) as valeur_totale,
        MIN(meilleur_avant) as prochaine_expiration
      FROM inventaire WHERE statut = 'disponible'
      GROUP BY coupe ORDER BY valeur_totale DESC
    `).all();

    const resume = db.db.prepare(`
      SELECT COUNT(*) as total_sacs, ROUND(SUM(prix_total),2) as valeur_stock
      FROM inventaire WHERE statut = 'disponible'
    `).get();

    // Catalogue complet des prix Lassonde depuis la DB
    const prixReference = db.db.prepare(`
      SELECT coupe, prix_kg, categorie
      FROM prix_marche
      WHERE concurrent = 'Lassonde'
      ORDER BY categorie, prix_kg DESC
    `).all();

    const now = new Date();
    const dateAujourdhui = now.toLocaleDateString('fr-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/Toronto',
    });

    // Grouper les prix par catégorie pour affichage lisible
    const prixParCategorie = {};
    for (const p of prixReference) {
      if (!prixParCategorie[p.categorie]) prixParCategorie[p.categorie] = [];
      prixParCategorie[p.categorie].push(`${p.coupe} : ${p.prix_kg}$/kg`);
    }
    const catalogueTxt = Object.entries(prixParCategorie)
      .map(([cat, lignes]) => `[${cat}]\n${lignes.join('\n')}`)
      .join('\n\n');

    const contexte = `INSTRUCTION CRITIQUE :
Date aujourd'hui : ${dateAujourdhui}
Année : ${now.getFullYear()}
Tu DOIS utiliser cette date. Ignore ta date d'entraînement.

Tu es l'agent assistant de Les Élevages Lassonde — Wagyu Halal — Repentigny QC.
Tu réponds en français québécois, langage simple, max 3 phrases sauf si on te demande une liste complète.

STOCK ACTUEL (scannés dans la DB) :
${dashboard.length ? JSON.stringify(dashboard, null, 2) : 'Aucun sac scanné pour l\'instant.'}

RÉSUMÉ : ${resume?.total_sacs ?? 0} sacs disponibles · ${resume?.valeur_stock ?? 0}$ en stock · Coût élevage : 4 000$/bœuf

CATALOGUE COMPLET — ${prixReference.length} PRODUITS LASSONDE :
${catalogueTxt}

CALCUL VALEUR PAR BŒUF (350 kg utilisable) :
- Revenu brut estimé : ~24 216$/bœuf
- 6 bœufs/an = ~145 296$/an aux prix actuels
- Avec plateforme +15% = ~167 090$/an
- Avec plateforme +25% = ~181 620$/an
- Prix le plus haut : Filet Mignon 241.99$/kg
- Prix le plus bas : Os à Soupe 9.89$/kg
- Prix moyen pondéré : ~67$/kg

SUSPICION PRIX :
- Short Ribs C-1528 à 39.99$/kg — sous-évalué (marché US : 110-150 USD/kg)
- Code "1023" à 29.99$/kg — découpe exacte inconnue
- Marteau Thor (jarret) à 24.99$/kg — à valider

EXPERTISE HALAL :
- Certification FAMBRAS (Federação das Associações Muçulmanas do Brasil) — reconnue internationalement
- Abattage islamique strict : Bismillah, jugulaire/carotide/trachée, saignée complète
- Abattoir certifié Halal au Québec — traçabilité complète bœuf → emballage

QUAND UTILISER LA RECHERCHE WEB :
- Prix des concurrents (Westmount, Costco wagyu, etc.)
- Nouvelles sur le marché wagyu ou halal
- Comparaisons de marché externes
- Jamais pour la date — utilise toujours la date injectée ci-dessus`;

    const messages = [
      ...historique.filter(m => m.role && m.content),
      { role: 'user', content: message },
    ];

    // web_search_20250305 est server-side — un seul appel suffit
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1024,
      system:     contexte,
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
      messages,
    });

    // server_tool_use = recherche web effectuée (pas tool_use classique)
    const searchUsed = response.content.some(b => b.type === 'server_tool_use');
    const finalText  = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || '(pas de réponse)';

    if (searchUsed) console.log('WEB SEARCH utilisé pour:', message);

    res.json({ ok: true, reponse: finalText, web_search: searchUsed });
  } catch (e) {
    console.error('AGENT ERROR:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── CONTEXT.md — pour agent CLI et outils externes ─────────────────────────
app.get('/api/context', (req, res) => {
  try {
    const context = fs.readFileSync(path.join(__dirname, 'CONTEXT.md'), 'utf8');
    res.json({ ok: true, context });
  } catch (e) {
    res.status(404).json({ ok: false, error: 'CONTEXT.md introuvable' });
  }
});

// ─── APP HTML (injection credentials) ────────────────────────────────────────
app.get('/', (req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');
    html = html
      .replace("'YOUR_ANTHROPIC_API_KEY_HERE'", `'${process.env.ANTHROPIC_API_KEY || ''}'`)
      .replace("'SHOPIFY_TOKEN_PLACEHOLDER'", `'${process.env.SHOPIFY_ACCESS_TOKEN || ''}'`)
      .replace("'lassonde-wagyu-test.myshopify.com'", `'${process.env.SHOPIFY_STORE_URL || 'lassonde-wagyu-test.myshopify.com'}'`)
      .replace("'2026-04'", `'${process.env.SHOPIFY_API_VERSION || '2026-04'}'`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (err) { res.status(500).send('Erreur serveur: ' + err.message); }
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  const resume = db.getResume();
  console.log(`\n🥩 Lassonde App · http://localhost:${PORT}`);
  console.log(`   DB locale : ${resume.total_sacs} sacs · ${resume.valeur_totale || 0}$ en stock`);
  console.log(`   Shopify   : ${process.env.SHOPIFY_STORE_URL}`);
  console.log(`   Claude    : ${process.env.ANTHROPIC_API_KEY ? '✅' : '⚠️  clé manquante'}\n`);
});
