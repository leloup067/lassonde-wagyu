// server.js — Serveur Express + API locale Lassonde
require('dotenv').config();
const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const Anthropic  = require('@anthropic-ai/sdk');
const db         = require('./database');

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

// ─── API BÊTES ────────────────────────────────────────────────────────────────
app.get('/api/betes', (req, res) => {
  try { res.json({ ok: true, betes: db.getBetes() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/betes', (req, res) => {
  try { db.upsertBete(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
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

// ─── API VENTES ───────────────────────────────────────────────────────────────
app.post('/api/ventes', (req, res) => {
  try {
    const id = db.enregistrerVente(req.body);
    res.json({ ok: true, id });
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
        model: 'claude-opus-4-7',
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

    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
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
