// upload-produits.js
// Script d'import automatique des produits Lassonde dans Shopify
// Utilise l'API GraphQL Admin de Shopify (plus moderne que REST)
require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');

// === CONFIGURATION ===
// Ces valeurs viennent du fichier .env — ne jamais les mettre directement ici
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const CSV_FILE = './produits-lassonde.csv';

// === LOGGING ===
// Chaque exécution crée un fichier log unique avec timestamp
const logFile = `upload-log-${Date.now()}.txt`;
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

// === COLLECTIONS À CRÉER ===
// Ces 8 collections seront créées dans Shopify, puis les produits y seront assignés
const COLLECTIONS = [
  {
    title: 'Coupes Ultra Premium',
    handle: 'coupes-ultra-premium',
    description: 'Les coupes les plus nobles du wagyu : Filet Mignon, Tomahawk, Contre Filet, et plus.'
  },
  {
    title: 'Coupes Premium',
    handle: 'coupes-premium',
    description: 'Coupes exceptionnelles à la croisée du goût et de la valeur : Onglet, Hampe, Picanha.'
  },
  {
    title: 'Steaks & Grill',
    handle: 'steaks-grill',
    description: 'Parfaites pour la poêle ou le BBQ : Surlonge, Baseball, Tri-Tip, Denver, et plus.'
  },
  {
    title: 'BBQ & Slow Cook',
    handle: 'bbq-slow-cook',
    description: 'Pour les amateurs de cuisson lente : Brisket, Côtes Levées, Osso Buco.'
  },
  {
    title: 'Rôtis',
    handle: 'rotis',
    description: 'Rôtis pour les grandes occasions familiales.'
  },
  {
    title: 'Brochettes & Préparé',
    handle: 'brochettes-prepare',
    description: 'Produits préparés et marinés : brochettes Teriyaki, Érable/Poivre, Whiskey Fumé, et plus.'
  },
  {
    title: 'Coupes Accessibles',
    handle: 'coupes-accessibles',
    description: 'Du wagyu premium à prix accessible pour le quotidien.'
  },
  {
    title: 'Abats & Spécialités',
    handle: 'abats-specialites',
    description: 'Pour les connaisseurs : cœur, joue, foie, os à moelle, et plus.'
  }
];

// === MAPPING PRODUITS → COLLECTIONS ===
// Pour chaque produit du CSV, ce tableau indique dans quelle collection il va
// La clé est un mot-clé qui doit apparaître dans le titre du produit (insensible à la casse)
const PRODUIT_VERS_COLLECTION = {
  'Filet Mignon':       'coupes-ultra-premium',
  'Tomahawk':           'coupes-ultra-premium',
  'Contre Filet':       'coupes-ultra-premium',
  'Faux Filet':         'coupes-ultra-premium',   // catch-all pour "Faux Filet" et "Faux Filet Palette"
  'Steak de Côte':      'coupes-ultra-premium',
  'T-Bone':             'coupes-ultra-premium',

  'Onglet':             'coupes-premium',
  'Hampe':              'coupes-premium',
  'Macreuse':           'coupes-premium',
  'Araignée':           'coupes-premium',
  'Culotte':            'coupes-premium',
  'Picanha':            'coupes-premium',

  'Surlonge':           'steaks-grill',
  'Baseball':           'steaks-grill',
  'Tri-Tip':            'steaks-grill',
  'Denver':             'steaks-grill',
  'Flanc':              'steaks-grill',
  'Français':           'steaks-grill',           // "Français" et "Rôti Français" — ordre important

  'Brisket':            'bbq-slow-cook',
  'Côte Levées':        'bbq-slow-cook',
  'Côte Coréenne':      'bbq-slow-cook',
  'Tournedos':          'bbq-slow-cook',
  'Osso Buco':          'bbq-slow-cook',

  'Rôti':               'rotis',                  // catch-all pour tous les rôtis
  'Palette':            'rotis',                  // catch-all pour palette avec/sans os

  'Brochettes':         'brochettes-prepare',     // catch-all pour toutes les brochettes
  'Burger':             'brochettes-prepare',
  'Haché':              'brochettes-prepare',

  'Bacon Bœuf':         'coupes-accessibles',
  'Mi Soter':           'coupes-accessibles',
  'Marteau Thor':       'coupes-accessibles',
  '1023':               'coupes-accessibles',

  'Cœur':               'abats-specialites',
  'Joue':               'abats-specialites',
  'Foie':               'abats-specialites',
  'Rognon':             'abats-specialites',
  'Langue':             'abats-specialites',
  'Queue':              'abats-specialites',
  'Os à Moelle':        'abats-specialites',
  'Os à Soupe':         'abats-specialites'
};

// === FONCTIONS UTILITAIRES ===

// Envoie une requête GraphQL à l'API Admin de Shopify
// C'est la fonction centrale — tout passe par ici
async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  // Vérifier les erreurs HTTP (401, 403, 429, etc.)
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();

  // Vérifier les erreurs GraphQL (différentes des erreurs HTTP)
  if (data.errors) {
    throw new Error(`GraphQL: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

// Trouve la collection appropriée pour un produit selon son titre
// Parcourt le mapping et retourne le handle de collection dès qu'un mot-clé correspond
function trouverCollection(title) {
  for (const [keyword, collectionHandle] of Object.entries(PRODUIT_VERS_COLLECTION)) {
    if (title.toLowerCase().includes(keyword.toLowerCase())) {
      return collectionHandle;
    }
  }
  // Si aucun match, on ne log pas d'erreur — certains produits peuvent ne pas avoir de collection
  return null;
}

// Petite pause pour respecter les rate limits de Shopify
// Shopify permet ~2 requêtes/seconde sur le plan de base
function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === ÉTAPE 1 : CRÉER LES COLLECTIONS ===
async function creerCollections() {
  log('=== ÉTAPE 1 : CRÉATION DES COLLECTIONS ===');
  const collectionsCreees = {}; // { handle: gid }

  for (const collection of COLLECTIONS) {
    try {
      const mutation = `
        mutation collectionCreate($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
              title
              handle
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const result = await shopifyGraphQL(mutation, {
        input: {
          title: collection.title,
          handle: collection.handle,
          descriptionHtml: `<p>${collection.description}</p>`
        }
      });

      const userErrors = result.collectionCreate.userErrors;
      if (userErrors.length > 0) {
        // Une collection avec ce handle existe peut-être déjà — on cherche son ID
        log(`⚠️  "${collection.title}" : ${JSON.stringify(userErrors)} — tentative de récupération...`);

        // Chercher la collection existante par handle
        const searchResult = await shopifyGraphQL(`
          { collectionByHandle(handle: "${collection.handle}") { id title handle } }
        `);

        if (searchResult.collectionByHandle) {
          collectionsCreees[collection.handle] = searchResult.collectionByHandle.id;
          log(`   ↳ Collection existante trouvée et réutilisée : ${searchResult.collectionByHandle.id}`);
        }
        continue;
      }

      const col = result.collectionCreate.collection;
      collectionsCreees[collection.handle] = col.id;
      log(`✅ Collection créée : "${col.title}" (${col.id})`);

      await pause(500);

    } catch (error) {
      log(`❌ Erreur collection "${collection.title}" : ${error.message}`);
    }
  }

  return collectionsCreees;
}

// === ÉTAPE 2 : LIRE LE CSV ===
async function lireCSV() {
  return new Promise((resolve, reject) => {
    const produits = [];
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (row) => produits.push(row))
      .on('end', () => resolve(produits))
      .on('error', reject);
  });
}

// === ÉTAPE 3 : CRÉER UN PRODUIT ===
async function creerProduit(produit, collectionId) {
  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
          variants(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Parser les tags depuis le CSV (séparés par des virgules)
  const tags = produit.Tags
    ? produit.Tags.split(',').map(t => t.trim()).filter(Boolean)
    : [];

  const productInput = {
    title: produit.Title,
    descriptionHtml: produit['Body (HTML)'],
    vendor: produit.Vendor || 'Les Élevages Lassonde',
    productType: produit.Type || 'Viande Wagyu Halal',
    tags: tags,
    status: 'ACTIVE',
    handle: produit.Handle,
    seo: {
      title: produit['SEO Title'] || produit.Title,
      description: produit['SEO Description'] || ''
    }
  };

  // Assigner à la collection si on en a trouvé une
  if (collectionId) {
    productInput.collectionsToJoin = [collectionId];
  }

  const result = await shopifyGraphQL(mutation, { input: productInput });

  if (result.productCreate.userErrors.length > 0) {
    throw new Error(JSON.stringify(result.productCreate.userErrors));
  }

  return result.productCreate.product;
}

// === ÉTAPE 4 : METTRE À JOUR LA VARIANTE (PRIX, SKU, etc.) ===
// Shopify crée une variante par défaut à la création du produit
// On la met à jour avec le vrai prix et le SKU depuis le CSV
// Note : productVariantUpdate est remplacé par productVariantsBulkUpdate dans API 2024-01+
async function mettreAJourVariante(productId, variantId, produit) {
  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          sku
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const price = parseFloat(produit['Variant Price']);
  if (isNaN(price)) {
    throw new Error(`Prix invalide dans le CSV : "${produit['Variant Price']}"`);
  }

  const result = await shopifyGraphQL(mutation, {
    productId: productId,
    variants: [{
      id: variantId,
      price: price.toFixed(2),
      inventoryPolicy: 'DENY',
      taxable: true,
      inventoryItem: {
        sku: produit['Variant SKU'] || '',
        requiresShipping: true
      }
    }]
  });

  if (result.productVariantsBulkUpdate.userErrors.length > 0) {
    throw new Error(JSON.stringify(result.productVariantsBulkUpdate.userErrors));
  }
}

// === FONCTION PRINCIPALE ===
async function main() {
  log('🚀 DÉBUT DE L\'UPLOAD SHOPIFY — Les Élevages Lassonde');
  log(`   Store    : ${SHOPIFY_STORE}`);
  log(`   API      : ${API_VERSION}`);
  log(`   CSV      : ${CSV_FILE}`);
  log(`   Log      : ${logFile}`);
  log('');

  // Vérification des variables d'environnement
  if (!SHOPIFY_STORE || !ACCESS_TOKEN || ACCESS_TOKEN === 'shpat_REMPLACER_PAR_TON_TOKEN') {
    log('❌ ERREUR : Le fichier .env n\'est pas configuré.');
    log('   Ouvre .env et remplace shpat_REMPLACER_PAR_TON_TOKEN par ton vrai token Shopify.');
    process.exit(1);
  }

  // Vérification que le CSV existe
  if (!fs.existsSync(CSV_FILE)) {
    log(`❌ ERREUR : Fichier CSV introuvable : ${CSV_FILE}`);
    process.exit(1);
  }

  try {
    // Test de connexion
    log('🔌 Test de connexion à Shopify...');
    const testQuery = `{ shop { name myshopifyDomain plan { displayName } } }`;
    const test = await shopifyGraphQL(testQuery);
    log(`✅ Connecté : "${test.shop.name}" (${test.shop.myshopifyDomain}) — Plan : ${test.shop.plan.displayName}`);
    log('');

    // Étape 1 : Collections
    const collectionsMap = await creerCollections();
    log(`   ${Object.keys(collectionsMap).length} collections disponibles`);
    log('');

    // Étape 2 : Lire le CSV
    log('=== ÉTAPE 2 : LECTURE DU CSV ===');
    const produits = await lireCSV();
    log(`📄 ${produits.length} produits trouvés dans ${CSV_FILE}`);
    log('');

    // Étape 3 : Créer les produits
    log('=== ÉTAPE 3 : CRÉATION DES PRODUITS ===');
    let reussis = 0;
    let echecs = 0;

    for (let i = 0; i < produits.length; i++) {
      const produit = produits[i];
      const num = `${i + 1}/${produits.length}`;

      try {
        // Trouver la collection
        const collectionHandle = trouverCollection(produit.Title);
        const collectionId = collectionHandle ? collectionsMap[collectionHandle] : null;

        if (!collectionId && collectionHandle) {
          log(`   ⚠️  Collection "${collectionHandle}" non trouvée pour : ${produit.Title}`);
        }

        // Créer le produit
        const product = await creerProduit(produit, collectionId);
        await pause(300); // mini-pause entre create et update

        // Mettre à jour la variante avec le bon prix
        const variantId = product.variants.edges[0]?.node?.id;
        if (variantId) {
          await mettreAJourVariante(product.id, variantId, produit);
        }

        const collection = collectionHandle ? ` [${collectionHandle}]` : ' [sans collection]';
        log(`✅ ${num} : ${produit.Title}${collection} — ${produit['Variant Price']}$/lb`);
        reussis++;

        // Délai pour respecter le rate limit Shopify (~2 req/s)
        await pause(700);

      } catch (error) {
        log(`❌ ${num} : ${produit.Title} — ${error.message}`);
        echecs++;
        // On continue avec le produit suivant même en cas d'erreur
        await pause(700);
      }
    }

    // Récapitulatif final
    log('');
    log('════════════════════════════════════════');
    log('📊 RÉCAPITULATIF FINAL');
    log('════════════════════════════════════════');
    log(`✅ Produits créés avec succès : ${reussis}/${produits.length}`);
    if (echecs > 0) {
      log(`❌ Échecs                      : ${echecs}/${produits.length}`);
    }
    log(`📁 Log complet                 : ${logFile}`);
    log('');
    log('🎉 UPLOAD TERMINÉ — Ouvre ton Shopify Admin pour vérifier les produits');
    log('   https://' + SHOPIFY_STORE.replace('.myshopify.com', '') + '.myshopify.com/admin/products');

  } catch (error) {
    log('');
    log('❌ ERREUR FATALE');
    log(error.message);

    // Messages d'aide selon le type d'erreur
    if (error.message.includes('401')) {
      log('');
      log('💡 AIDE : Erreur 401 = Token invalide ou expiré.');
      log('   → Vérifie que ton token dans .env commence par "shpat_"');
      log('   → Génère un nouveau token dans Shopify Admin → Apps → Develop apps');
    } else if (error.message.includes('403')) {
      log('');
      log('💡 AIDE : Erreur 403 = Permissions insuffisantes.');
      log('   → Dans Shopify Admin, va dans Apps → Develop apps → ton app');
      log('   → Assure-toi d\'avoir activé ces scopes :');
      log('     • write_products');
      log('     • write_inventory');
      log('     • write_product_listings');
    } else if (error.message.includes('429')) {
      log('');
      log('💡 AIDE : Erreur 429 = Rate limit atteint.');
      log('   → Augmente les délais dans le script (cherche les appels à pause())');
      log('   → Passe de 700ms à 1200ms');
    }

    process.exit(1);
  }
}

main();
