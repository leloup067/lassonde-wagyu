// fix-prix.js
// Corrige les prix des produits Lassonde déjà créés dans Shopify
// À utiliser quand les produits existent mais ont un prix à 0 ou incorrect
require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const CSV_FILE = './produits-lassonde.csv';

const logFile = `fix-prix-log-${Date.now()}.txt`;
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

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
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  const data = await response.json();
  if (data.errors) throw new Error(`GraphQL: ${JSON.stringify(data.errors)}`);
  return data.data;
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Lire le CSV et construire un index title → prix + SKU
async function lireCSV() {
  return new Promise((resolve, reject) => {
    const index = {};
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (row) => {
        index[row.Title] = {
          price: parseFloat(row['Variant Price']),
          sku: row['Variant SKU'] || ''
        };
      })
      .on('end', () => resolve(index))
      .on('error', reject);
  });
}

// Récupérer tous les produits Lassonde avec leur variante (pagination)
async function recupererTousProduits() {
  const produits = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 50, after: $cursor, query: "vendor:'Les Élevages Lassonde'") {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await shopifyGraphQL(query, { cursor });
    const page = result.products;
    page.edges.forEach(edge => produits.push(edge.node));
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
    await pause(300);
  }

  return produits;
}

async function main() {
  log('🔧 FIX-PRIX — Correction des prix Lassonde dans Shopify');
  log(`   Store : ${SHOPIFY_STORE}`);
  log('');

  // Lire les prix depuis le CSV
  log('📄 Lecture du CSV...');
  const csvIndex = await lireCSV();
  log(`   ${Object.keys(csvIndex).length} produits trouvés dans le CSV`);
  log('');

  // Récupérer les produits Shopify
  log('🔍 Récupération des produits Shopify...');
  const produits = await recupererTousProduits();
  log(`   ${produits.length} produits trouvés dans Shopify`);
  log('');

  if (produits.length === 0) {
    log('⚠️  Aucun produit trouvé dans Shopify avec le vendor "Les Élevages Lassonde"');
    log('   Vérifie que les produits ont bien été créés et que le vendor est exact.');
    return;
  }

  log('=== MISE À JOUR DES PRIX ===');
  let reussis = 0;
  let nonTrouves = 0;
  let echecs = 0;

  for (let i = 0; i < produits.length; i++) {
    const produit = produits[i];
    const num = `${i + 1}/${produits.length}`;

    // Chercher le prix dans l'index CSV
    const csvData = csvIndex[produit.title];
    if (!csvData) {
      log(`⚠️  ${num} : "${produit.title}" — pas trouvé dans le CSV (titre différent?)`);
      nonTrouves++;
      continue;
    }

    const variantId = produit.variants.edges[0]?.node?.id;
    if (!variantId) {
      log(`⚠️  ${num} : "${produit.title}" — aucune variante trouvée`);
      echecs++;
      continue;
    }

    try {
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

      const result = await shopifyGraphQL(mutation, {
        productId: produit.id,
        variants: [{
          id: variantId,
          price: csvData.price.toFixed(2),
          inventoryPolicy: 'DENY',
          taxable: true,
          inventoryItem: {
            sku: csvData.sku,
            requiresShipping: true
          }
        }]
      });

      const userErrors = result.productVariantsBulkUpdate.userErrors;
      if (userErrors.length > 0) {
        log(`❌ ${num} : "${produit.title}" — ${JSON.stringify(userErrors)}`);
        echecs++;
      } else {
        const updatedPrice = result.productVariantsBulkUpdate.productVariants[0]?.price;
        log(`✅ ${num} : "${produit.title}" — ${updatedPrice}$/lb (SKU: ${csvData.sku})`);
        reussis++;
      }

      await pause(600);

    } catch (error) {
      log(`❌ ${num} : "${produit.title}" — ${error.message}`);
      echecs++;
      await pause(600);
    }
  }

  log('');
  log('════════════════════════════════════════');
  log('📊 RÉCAPITULATIF');
  log('════════════════════════════════════════');
  log(`✅ Prix mis à jour : ${reussis}/${produits.length}`);
  if (nonTrouves > 0) log(`⚠️  Non trouvés dans CSV : ${nonTrouves}`);
  if (echecs > 0)     log(`❌ Échecs              : ${echecs}`);
  log(`📁 Log : ${logFile}`);
  log('');
  log('🎉 Fix terminé — vérifie les prix dans Shopify Admin');
}

main().catch(err => {
  log(`❌ ERREUR FATALE : ${err.message}`);
  process.exit(1);
});
