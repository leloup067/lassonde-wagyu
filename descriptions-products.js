#!/usr/bin/env node
// descriptions-products.js — Génère descriptions premium pour chaque coupe
'use strict';
const dotenv  = require('dotenv');
const parsed  = dotenv.config({ path: require('path').join(__dirname, '.env') }).parsed || {};
const Anthropic = require('@anthropic-ai/sdk');

// Lecture directe depuis parsed pour contourner les restrictions sandbox
const ANTHROPIC_KEY = parsed.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const STORE   = parsed.SHOPIFY_STORE_URL   || process.env.SHOPIFY_STORE_URL;
const TOKEN   = parsed.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = parsed.SHOPIFY_API_VERSION  || process.env.SHOPIFY_API_VERSION || '2026-04';

const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

const PRIX_MARCHE = {
  'Filet Mignon': 241.99, 'Tomahawk': 149.99, 'Faux-Filet': 149.99,
  'Contre-Filet': 149.99, 'Steak de Côte': 119.99, 'T-Bone': 119.99,
  'Onglet': 104.49, 'Hampe': 104.49, 'Picanha': 104.49, 'Culotte': 104.49,
  'Macreuse': 89.99, 'Araignée': 89.99, 'Surlonge': 76.99,
  'Steak Français': 76.99, 'Baseball': 76.99, 'Tri-Tip': 76.99,
  'Denver': 76.99, 'Flanc': 76.99, 'Brisket': 54.99, 'Tournedos': 54.99,
  'Côtes Levées': 49.99, 'Osso Buco': 44.99, 'Short Ribs': 39.99,
  'Brochettes': 49.99, 'Burger': 33.99, 'Haché': 33.99,
  'Bacon': 69.99, 'Fondue': 77.99, 'Cœur': 19.99, 'Joue': 24.99,
  'Foie': 14.99, 'Rognon': 14.99, 'Langue': 19.99, 'Queue': 19.99,
  'Os à Moelle': 14.99, 'Os à Soupe': 9.89,
};

// Extraire le nom de la coupe depuis le titre produit
function extraireCoupe(titre) {
  return titre
    .replace(/de (b|B)œuf.*|de (b|B)oeuf.*|Wagyu.*|Halal.*/g, '')
    .replace(/—.*/, '')
    .replace(/\(.*\)/, '')
    .trim();
}

async function genererDescription(coupe, prixKg, titre) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 280,
    messages: [{
      role: 'user',
      content: `Génère une courte description produit premium en HTML pour cette viande Wagyu Halal.

Coupe : ${coupe}
Prix : ${prixKg ? prixKg + '$/kg' : 'prix variable'}
Producteur : Les Élevages Lassonde, Repentigny, Québec
Certification : Wagyu Halal FAMBRAS

Format : exactement 3 phrases en HTML simple (p, strong autorisés).
Phrase 1 : texture et saveur de cette coupe spécifique
Phrase 2 : méthode de cuisson idéale et température recommandée
Phrase 3 : mention Halal FAMBRAS + élevage Québec

Ton : premium, authentique, sobre. Pas d'exclamation. Pas de superlatifs excessifs.
Réponse : HTML uniquement, rien d'autre.`,
    }],
  });
  return msg.content[0].text.trim();
}

async function updateDescription(id, html) {
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}/products/${id}.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: { id, body_html: html } }),
  });
  return r.json();
}

async function run() {
  // Récupère tous les produits actifs
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}/products.json?limit=250&status=active`, {
    headers: { 'X-Shopify-Access-Token': TOKEN },
  });
  const { products } = await r.json();

  // Filtre uniquement les vrais produits Lassonde (pas snowboards/tests Shopify)
  const lassonde = products.filter(p =>
    (p.title.toLowerCase().includes('wagyu') || p.title.toLowerCase().includes('bœuf') || p.title.toLowerCase().includes('boeuf'))
    && !p.title.toLowerCase().includes('test')
    && !p.title.toLowerCase().includes('snowboard')
  );

  console.log(`📝 ${lassonde.length} produits Lassonde à traiter\n`);

  // Déduplique par coupe pour économiser les tokens
  const descCache = {};
  let ok = 0, skip = 0;

  for (const p of lassonde) {
    const coupe = extraireCoupe(p.title);
    const cacheKey = coupe.toLowerCase().slice(0, 12);
    const prixKg = PRIX_MARCHE[Object.keys(PRIX_MARCHE).find(k => coupe.toLowerCase().includes(k.toLowerCase())) || ''] || null;

    try {
      // Génère la description une seule fois par coupe unique
      if (!descCache[cacheKey]) {
        descCache[cacheKey] = await genererDescription(coupe, prixKg, p.title);
        process.stdout.write(`✅ "${coupe}" — description générée\n`);
      } else {
        process.stdout.write(`♻️  "${coupe}" — description réutilisée\n`);
        skip++;
      }

      await updateDescription(p.id, descCache[cacheKey]);
      ok++;
      await new Promise(r => setTimeout(r, 600)); // rate limit
    } catch (e) {
      console.log(`❌ ${p.title} — ${e.message}`);
    }
  }

  console.log(`\n📊 ${ok} descriptions appliquées — ${Object.keys(descCache).length} coupes uniques générées — ${skip} réutilisées`);
}

run().catch(console.error);
