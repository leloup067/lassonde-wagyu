#!/usr/bin/env node
// photo-products.js — Ajoute une photo pour chaque coupe Lassonde (Pexels CDN, sans clé)
'use strict';
const dotenv = require('dotenv');
const parsed = dotenv.config({ path: require('path').join(__dirname, '.env') }).parsed || {};

const STORE   = parsed.SHOPIFY_STORE_URL    || process.env.SHOPIFY_STORE_URL;
const TOKEN   = parsed.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = parsed.SHOPIFY_API_VERSION  || process.env.SHOPIFY_API_VERSION || '2026-04';

// Photos Pexels statiques — CDN public, aucune clé requise
// Format: https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=900&h=675
const P = (id) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=900&h=675&fit=crop`;

// Photos sélectionnées par coupe — viandes crues premium
const PHOTO_PAR_COUPE = {
  // Coupes ultra-premium
  'filet mignon':   P(3535463),   // steak premium
  'tomahawk':       P(1639562),   // grosse côte avec os
  'faux-filet':     P(1907228),   // ribeye
  'contre-filet':   P(1633525),   // striploin
  'steak de côte':  P(3535463),   // côte de bœuf
  't-bone':         P(1639562),   // T-bone

  // Coupes premium
  'onglet':         P(1907228),
  'hampe':          P(1907228),
  'picanha':        P(3535463),
  'culotte':        P(1633525),
  'macreuse':       P(1907228),
  'araignée':       P(1907228),
  'surlonge':       P(1633525),
  'steak français': P(1633525),
  'baseball':       P(3535463),
  'tri-tip':        P(1907228),
  'denver':         P(1633525),
  'flanc':          P(1907228),

  // Coupes mijotage
  'brisket':        P(2233348),   // rôti/brisket
  'tournedos':      P(3535463),
  'côtes levées':   P(1639562),
  'osso buco':      P(2233348),
  'short ribs':     P(1639562),
  'rôti':           P(2233348),
  'palette':        P(2233348),

  // Préparations
  'brochettes':     P(1640772),   // brochettes grillées
  'burger':         P(1639565),   // burger/haché
  'haché':          P(1639565),
  'boeuf haché':    P(1639565),
  'fondue':         P(1633525),
  'bacon':          P(1639562),

  // Abats
  'cœur':           P(2233348),
  'joue':           P(2233348),
  'foie':           P(2233348),
  'rognon':         P(2233348),
  'langue':         P(2233348),
  'queue':          P(2233348),
  'os à moelle':    P(2233348),
  'os à soupe':     P(2233348),

  // Produits spéciaux
  '1023':           P(3535463),
  'marteau thor':   P(1639562),
  'mi soter':       P(1907228),
};

const FALLBACK = P(1639562); // Photo steak générique

function extraireCoupe(titre) {
  return titre
    .replace(/de (b|B)œuf.*|de (b|B)oeuf.*|Wagyu.*|Halal.*/g, '')
    .replace(/—.*/, '')
    .replace(/\(.*\)/, '')
    .trim()
    .toLowerCase();
}

function trouverPhoto(coupeNorm) {
  if (PHOTO_PAR_COUPE[coupeNorm]) return PHOTO_PAR_COUPE[coupeNorm];
  for (const [key, url] of Object.entries(PHOTO_PAR_COUPE)) {
    if (coupeNorm.includes(key) || key.includes(coupeNorm)) return url;
  }
  return FALLBACK;
}

async function getProducts() {
  const r = await fetch(
    `https://${STORE}/admin/api/${VERSION}/products.json?limit=250&status=active`,
    { headers: { 'X-Shopify-Access-Token': TOKEN } }
  );
  const data = await r.json();
  if (!data.products) throw new Error('Shopify API: ' + JSON.stringify(data));
  return data.products;
}

async function addPhotoToProduct(productId, imageUrl, altText) {
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}/products/${productId}/images.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: { src: imageUrl, alt: altText, position: 1 } }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data.errors || data));
  return data.image;
}

async function run() {
  const products = await getProducts();

  const lassonde = products.filter(p =>
    (p.title.toLowerCase().includes('wagyu') ||
     p.title.toLowerCase().includes('bœuf') ||
     p.title.toLowerCase().includes('boeuf'))
    && !p.title.toLowerCase().includes('test')
    && !p.title.toLowerCase().includes('snowboard')
  );

  console.log(`📸 ${lassonde.length} produits Lassonde à traiter\n`);

  let ok = 0, skipped = 0;
  const coupesDone = new Set();

  for (const p of lassonde) {
    // Saute les produits qui ont déjà une image
    if (p.images && p.images.length > 0) {
      process.stdout.write(`⏭  "${p.title}" — image existante\n`);
      skipped++;
      continue;
    }

    const coupeNorm = extraireCoupe(p.title);
    const photoUrl  = trouverPhoto(coupeNorm);
    const isNew     = !coupesDone.has(coupeNorm.slice(0, 14));
    coupesDone.add(coupeNorm.slice(0, 14));

    const icon = isNew ? '📷' : '♻️ ';
    process.stdout.write(`${icon} "${p.title}"\n`);

    try {
      const altText = `${p.title} — Les Élevages Lassonde, Wagyu Halal Québec`;
      await addPhotoToProduct(p.id, photoUrl, altText);
      ok++;
      process.stdout.write(`   ✅ Photo ajoutée (ID ${p.id})\n`);
      await new Promise(r => setTimeout(r, 700));
    } catch (e) {
      process.stdout.write(`   ❌ Erreur — ${e.message}\n`);
    }
  }

  console.log(`\n📊 Résultat : ${ok} photos ajoutées — ${skipped} ignorées (image déjà présente)`);
}

run().catch(console.error);
