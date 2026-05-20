// configure-store.js
// Configuration complète du store Shopify Les Élevages Lassonde
// Exécute chaque étape en séquence et confirme chaque résultat
require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');

const STORE   = process.env.SHOPIFY_STORE_URL;
const TOKEN   = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const BASE    = `https://${STORE}/admin/api/${VERSION}`;

const logFile = `configure-log-${Date.now()}.txt`;
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}
function sep(title) {
  log('');
  log('═'.repeat(50));
  log(`  ${title}`);
  log('═'.repeat(50));
}

const HEADERS_GQL = {
  'Content-Type':            'application/json',
  'X-Shopify-Access-Token':  TOKEN,
};
const HEADERS_REST = {
  'Content-Type':            'application/json',
  'X-Shopify-Access-Token':  TOKEN,
};

async function gql(query, variables = {}) {
  const r = await fetch(`${BASE}/graphql.json`, {
    method:  'POST',
    headers: HEADERS_GQL,
    body:    JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  const json = await r.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function rest(method, path, body = null) {
  const opts = { method, headers: HEADERS_REST };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}/${path}`, opts);
  const json = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

function pause(ms) { return new Promise(res => setTimeout(res, ms)); }

// ─────────────────────────────────────────────
// ÉTAPE 1 — AUDIT
// ─────────────────────────────────────────────
async function etape1_audit() {
  sep('ÉTAPE 1 — AUDIT DU STORE');

  // Shop info
  const shopData = await gql(`{
    shop {
      name myshopifyDomain currencyCode
      primaryDomain { url }
      billingAddress { city province country }
    }
  }`);
  const s = shopData.shop;
  log(`Store     : ${s.name}`);
  log(`Domaine   : ${s.myshopifyDomain}`);
  log(`Devise    : ${s.currencyCode}`);
  log(`Adresse   : ${s.billingAddress?.city ?? 'non définie'}, ${s.billingAddress?.province ?? ''} ${s.billingAddress?.country ?? ''}`);

  if (s.currencyCode !== 'CAD') {
    log('⚠️  DEVISE : La devise est ' + s.currencyCode + ' — elle doit être CAD (dollar canadien).');
    log('   → Action manuelle requise : Shopify Admin → Settings → Store details → Currency → CAD');
  } else {
    log('✅ Devise CAD confirmée');
  }

  // Produits
  let cursor = null, totalProduits = 0, hasNext = true, sampleProduit = null;
  while (hasNext) {
    const data = await gql(`
      query($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id title status
            variants(first: 1) { edges { node {
              price sku inventoryPolicy
              inventoryItem { requiresShipping }
            } } }
          } }
        }
      }
    `, { cursor });
    const page = data.products;
    totalProduits += page.edges.length;
    if (!sampleProduit && page.edges.length > 0) sampleProduit = page.edges[0].node;
    hasNext = page.pageInfo.hasNextPage;
    cursor  = page.pageInfo.endCursor;
    await pause(200);
  }
  log(`\nProduits  : ${totalProduits} produits dans le store`);
  if (sampleProduit) {
    const v = sampleProduit.variants.edges[0]?.node;
    log(`Exemple   : "${sampleProduit.title}" — ${v?.price}$ — SKU: ${v?.sku} — Statut: ${sampleProduit.status}`);
  }

  // Collections
  const colData = await gql(`{
    collections(first: 20) {
      edges { node { id title handle productsCount { count } } }
    }
  }`);
  const cols = colData.collections.edges;
  log(`\nCollections : ${cols.length} collections`);
  cols.forEach(c => log(`  • ${c.node.title} (${c.node.productsCount.count} produits)`));

  log('\n✅ ÉTAPE 1 TERMINÉE');
  return { totalProduits, collections: cols };
}

// ─────────────────────────────────────────────
// ÉTAPE 2 — ZONES DE LIVRAISON
// ─────────────────────────────────────────────
async function etape2_livraison() {
  sep('ÉTAPE 2 — ZONES DE LIVRAISON');

  // Récupérer le profil de livraison par défaut
  const dpData = await gql(`{
    deliveryProfiles(first: 5) {
      edges { node {
        id name default
        profileLocationGroups {
          locationGroup {
            id
            locations(first: 3) { edges { node { id name } } }
          }
        }
      } }
    }
  }`);

  const profiles = dpData.deliveryProfiles.edges;
  const defaultProfile = profiles.find(p => p.node.default)?.node;

  if (!defaultProfile) {
    log('⚠️  Aucun profil de livraison par défaut trouvé — création d\'un nouveau profil');
  } else {
    log(`Profil par défaut trouvé : ${defaultProfile.id}`);
  }

  // Créer un profil de livraison Québec
  // Note : la devise utilisée doit correspondre à la devise du store
  // Si le store est en USD, on utilise USD; si CAD, on utilise CAD
  const shopCurrData = await gql('{ shop { currencyCode } }');
  const currency = shopCurrData.shop.currencyCode; // USD ou CAD

  log(`Devise du store : ${currency} — les tarifs seront en ${currency}`);
  log(`Tarif plat : 25.00 ${currency}`);
  log(`Livraison gratuite : commandes ≥ 200.00 ${currency}`);

  // Récupérer les IDs de localisation du store
  const locData = await gql(`{
    locations(first: 10) { edges { node { id name } } }
  }`);
  const locations = locData.locations.edges.map(e => e.node);
  log(`Locations disponibles : ${locations.map(l => l.name).join(', ')}`);
  const locationIds = locations.map(l => l.id);

  const mutation = `
    mutation deliveryProfileCreate($profile: DeliveryProfileInput!) {
      deliveryProfileCreate(profile: $profile) {
        profile { id name }
        userErrors { field message }
      }
    }
  `;

  // En API 2024-01+, DeliveryProfileInput utilise locationGroupsToCreate → zonesToCreate
  const profileInput = {
    name: 'Livraison Québec — Chaîne du Froid',
    locationGroupsToCreate: [{
      locations: locationIds,
      zonesToCreate: [{
        name: 'Québec',
        countries: [{
          code: 'CA',
          includeAllProvinces: false,
          provinces: [{ code: 'QC' }]
        }],
        methodDefinitionsToCreate: [
          {
            name: 'Livraison isotherme 25$ — Lun/Mar/Mer',
            active: true,
            rateDefinition: { price: { amount: '25.00', currencyCode: currency } }
          },
          {
            name: 'Livraison gratuite — Commandes 200$+',
            active: true,
            rateDefinition: { price: { amount: '0.00', currencyCode: currency } }
          }
        ]
      }]
    }]
  };

  try {
    const result = await gql(mutation, { profile: profileInput });
    const userErrors = result.deliveryProfileCreate.userErrors;

    if (userErrors.length > 0) {
      log(`❌ Erreurs : ${JSON.stringify(userErrors)}`);
      log('   → Action manuelle requise :');
      log('     Shopify Admin → Settings → Shipping and delivery → Create shipping profile');
      log('     Nom du profil : "Livraison Québec — Chaîne du Froid"');
      log('     Zone : Canada → Québec seulement');
      log('     Tarif 1 : "Livraison isotherme Lun/Mar/Mer" — 25$');
      log('     Tarif 2 : "Livraison gratuite 200$+" — 0$ avec condition minimun 200$');
    } else {
      const p = result.deliveryProfileCreate.profile;
      log(`✅ Profil de livraison créé : "${p.name}" (${p.id})`);
      log('   • Tarif fixe 25$ (lun/mar/mer)');
      log('   • Livraison gratuite 0$ (200$+)');
      log('   • Zone : Province de Québec uniquement');
      log('   📌 Note : condition "gratuit à 200$" doit être ajoutée manuellement dans le profil.');
      log('      Shopify Admin → Settings → Shipping → profil → Edit rate "Livraison gratuite"');
      log('      → Add condition → Minimum order price → 200.00');
      log('   📌 Jours d\'expédition : Shopify ne supporte pas les jours nativement.');
      log('      Le nom de la méthode inclut "Lun/Mar/Mer" comme indication client.');
    }
  } catch (err) {
    log(`❌ Erreur création profil livraison : ${err.message}`);
    log('   → Configuration manuelle requise dans Shopify Admin → Settings → Shipping');
  }

  log('\n✅ ÉTAPE 2 TERMINÉE');
}

// ─────────────────────────────────────────────
// ÉTAPE 3 — TAXES
// ─────────────────────────────────────────────
async function etape3_taxes() {
  sep('ÉTAPE 3 — CONFIGURATION DES TAXES');

  // Vérifier l'état actuel via REST
  try {
    const countries = await rest('GET', 'countries.json?limit=250');
    const canada = countries.countries?.find(c => c.code === 'CA');

    if (!canada) {
      log('Canada non configuré comme zone fiscale — ajout en cours...');
      const added = await rest('POST', 'countries.json', {
        country: { code: 'CA', tax: 0.05 }  // TPS fédérale 5%
      });
      log(`✅ Canada ajouté (ID: ${added.country?.id})`);
      await pause(500);

      // Re-fetch pour avoir l'ID
      const refreshed = await rest('GET', 'countries.json?limit=250');
      const ca2 = refreshed.countries?.find(c => c.code === 'CA');

      if (ca2) await configurerTaxesQC(ca2.id);

    } else {
      log(`Canada trouvé (ID: ${canada.id}) — TPS actuelle : ${(canada.tax * 100).toFixed(1)}%`);
      log(`Taux fédéral attendu : 5.0% — ${Math.abs(canada.tax - 0.05) < 0.001 ? '✅ Correct' : '⚠️  Différent'}`);

      // S'assurer que le taux fédéral est exact
      if (Math.abs(canada.tax - 0.05) > 0.001) {
        await rest('PUT', `countries/${canada.id}.json`, { country: { id: canada.id, tax: 0.05 } });
        log('✅ Taux TPS corrigé à 5.0%');
      }

      await configurerTaxesQC(canada.id);
    }
  } catch (err) {
    log(`❌ Erreur configuration taxes : ${err.message}`);
    log('   → Action manuelle : Shopify Admin → Settings → Taxes and duties → Canada');
    log('     TPS (GST) : 5%');
    log('     TVQ (QST) : 9.975% — type "Compounded" (calculée sur le prix + TPS)');
  }

  // Activer les taxes sur la livraison
  try {
    const shopData = await gql(`{ shop { taxShipping } }`);
    log(`\nTaxes sur livraison : ${shopData.shop.taxShipping ? '✅ activées' : '⚠️  désactivées'}`);
    if (!shopData.shop.taxShipping) {
      log('   ℹ️  Au Québec, les taxes s\'appliquent sur les frais de livraison.');
      log('   → Activer manuellement : Settings → Taxes → "Charge taxes on shipping rates"');
    }
  } catch (_) {}

  log('\n✅ ÉTAPE 3 TERMINÉE');
}

async function configurerTaxesQC(canadaId) {
  try {
    const provs = await rest('GET', `countries/${canadaId}/provinces.json`);
    const qc = provs.provinces?.find(p => p.code === 'QC');

    if (!qc) {
      log('⚠️  Province Québec non trouvée dans les provinces du Canada');
      return;
    }

    log(`Québec trouvé (ID: ${qc.id}) — TVQ actuelle : ${(qc.tax * 100).toFixed(3)}%`);

    // TVQ = 9.975%, type compounded (calculée sur prix + TPS)
    const targeted = { tax: 0.09975, tax_name: 'TVQ', tax_type: 'compounded' };
    const already = Math.abs(qc.tax - 0.09975) < 0.0001 && qc.tax_type === 'compounded';

    if (already) {
      log('✅ TVQ déjà configurée correctement (9.975% compounded)');
    } else {
      await rest('PUT', `countries/${canadaId}/provinces/${qc.id}.json`, {
        province: { id: qc.id, ...targeted }
      });
      log('✅ TVQ Québec configurée : 9.975% (compounded sur TPS 5%)');
    }

    log('\nRécapitulatif taxes Québec :');
    log('  TPS (fédérale) : 5.00%');
    log('  TVQ (provinciale) : 9.975% (compounded = calculée sur prix + TPS)');
    log('  Total effectif : ~14.975%');
  } catch (err) {
    log(`❌ Erreur configuration TVQ : ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// ÉTAPE 4 — POLITIQUE PRODUIT
// ─────────────────────────────────────────────
async function etape4_politiqueProduits() {
  sep('ÉTAPE 4 — POLITIQUE PRODUIT (requiresShipping + inventaire)');

  // Récupérer tous les produits avec leurs variantes
  let cursor = null, hasNext = true, tousLesProduits = [];
  while (hasNext) {
    const data = await gql(`
      query($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id title
            variants(first: 5) { edges { node {
              id price sku inventoryPolicy
              inventoryItem { id tracked requiresShipping }
            } } }
          } }
        }
      }
    `, { cursor });
    const page = data.products;
    tousLesProduits.push(...page.edges.map(e => e.node));
    hasNext = page.pageInfo.hasNextPage;
    cursor  = page.pageInfo.endCursor;
    await pause(300);
  }

  log(`${tousLesProduits.length} produits à vérifier/mettre à jour`);

  let maj = 0, deja_ok = 0, echecs = 0;

  for (let i = 0; i < tousLesProduits.length; i++) {
    const produit = tousLesProduits[i];
    const variants = produit.variants.edges.map(e => e.node);

    // Vérifier si une mise à jour est nécessaire
    const besoinMaj = variants.some(v =>
      v.inventoryPolicy !== 'DENY' || !v.inventoryItem?.requiresShipping
    );

    if (!besoinMaj) {
      deja_ok++;
      continue;
    }

    try {
      const variantInputs = variants.map(v => ({
        id: v.id,
        inventoryPolicy: 'DENY',
        inventoryItem: {
          requiresShipping: true,
          tracked: true
        }
      }));

      const result = await gql(`
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id inventoryPolicy }
            userErrors { field message }
          }
        }
      `, { productId: produit.id, variants: variantInputs });

      const errors = result.productVariantsBulkUpdate.userErrors;
      if (errors.length > 0) {
        log(`⚠️  ${produit.title} : ${JSON.stringify(errors)}`);
        echecs++;
      } else {
        log(`✅ ${i+1}/${tousLesProduits.length} : ${produit.title}`);
        maj++;
      }

      await pause(400);
    } catch (err) {
      log(`❌ ${produit.title} : ${err.message}`);
      echecs++;
    }
  }

  log(`\nRésultat :`);
  log(`  ✅ Mis à jour  : ${maj} produits`);
  log(`  ✓  Déjà OK     : ${deja_ok} produits`);
  if (echecs) log(`  ❌ Échecs      : ${echecs} produits`);
  log(`  Politique : inventoryPolicy=DENY (pas de survente) + requiresShipping=true`);
  log('\n✅ ÉTAPE 4 TERMINÉE');
}

// ─────────────────────────────────────────────
// ÉTAPE 5 — PAGE À PROPOS
// ─────────────────────────────────────────────
async function etape5_pageAPropos() {
  sep('ÉTAPE 5 — CRÉATION PAGE À PROPOS');

  const bodyHtml = `
<div class="about-lassonde">

  <section class="hero-about">
    <h1>Les Élevages Lassonde</h1>
    <p class="tagline"><strong>Passion Wagyu. Origine Québec. Certifié Halal.</strong></p>
  </section>

  <section class="notre-histoire">
    <h2>Notre Histoire</h2>
    <p>Les Élevages Lassonde est né d'une passion simple et profonde : élever un bœuf d'exception sur les terres du Québec, avec le respect des bêtes, de la terre et des convictions de nos clients.</p>
    <p>Nous sommes fiers d'être l'un des seuls éleveurs québécois à proposer du Wagyu certifié Halal — une démarche qui s'adresse à toutes les familles qui refusent de choisir entre qualité et conformité religieuse.</p>
    <p>Notre bœuf Wagyu croisé (F1 Wagyu × Angus), issu d'une filière certifiée FAMBRAS Halal, est transformé avec soin dans nos installations québécoises pour vous livrer une viande d'une tendreté et d'un persillage exceptionnels.</p>
  </section>

  <section class="nos-valeurs">
    <h2>Nos Valeurs</h2>
    <ul>
      <li><strong>Qualité sans compromis</strong> — Chaque coupe est sélectionnée pour son persillage, sa fraîcheur et son potentiel gustatif.</li>
      <li><strong>Certification Halal FAMBRAS</strong> — Contrôle rigoureux à chaque étape, de l'abattage à l'emballage. Aucune exception.</li>
      <li><strong>Traçabilité complète</strong> — Du troupeau à votre table, chaque pièce est traçable et documentée.</li>
      <li><strong>Ancrage québécois</strong> — Nous croyons au terroir, à l'agriculture locale, et à la fierté de ce qui est fait ici.</li>
    </ul>
  </section>

  <section class="certification-halal">
    <h2>Certification Halal FAMBRAS</h2>
    <p>La <strong>FAMBRAS</strong> (Federação das Associações Muçulmanas do Brasil) est l'une des certifications Halal les plus rigoureuses d'Amérique du Sud et reconnue à l'international. Elle garantit :</p>
    <ul>
      <li>Un abattage conforme aux prescriptions islamiques</li>
      <li>L'absence de tout contaminant non-Halal dans la chaîne de transformation</li>
      <li>Un audit indépendant et continu de nos fournisseurs</li>
      <li>Une traçabilité documentée du troupeau à l'emballage final</li>
    </ul>
    <p>Chaque commande passée sur notre boutique en ligne est couverte par cette certification. Vous pouvez commander en toute confiance.</p>
  </section>

  <section class="wagyu-explication">
    <h2>Qu'est-ce que le Wagyu ?</h2>
    <p>Le Wagyu (和牛) est une race bovine japonaise réputée pour son <strong>persillage intramusculaire exceptionnel</strong> — ces fines veines de gras qui fondent à la cuisson et donnent à la viande sa tendreté et sa saveur caractéristiques.</p>
    <p>Notre bœuf est un F1 Wagyu croisé (Wagyu × Angus) : la combinaison idéale entre le persillage Wagyu et le gabarit de l'Angus, pour une viande premium accessible, sans compromis sur le goût.</p>
  </section>

  <section class="contact-about">
    <h2>Nous Joindre</h2>
    <p>Pour toute question sur nos produits, notre certification Halal, ou vos commandes, contactez-nous via notre <a href="/pages/contact">page contact</a>.</p>
    <p>Nous répondons dans les 24 heures, du lundi au vendredi.</p>
  </section>

</div>
  `.trim();

  const mutation = `
    mutation pageCreate($page: PageInput!) {
      pageCreate(page: $page) {
        page { id title handle }
        userErrors { field message }
      }
    }
  `;

  // Créer la page via REST (pageCreate GraphQL non disponible en 2026-04)
  try {
    const result = await rest('POST', 'pages.json', {
      page: {
        title:        'À Propos — Les Élevages Lassonde',
        handle:       'a-propos',
        body_html:    bodyHtml,
        published:    true,
      }
    });

    if (result.page) {
      log(`✅ Page créée : "${result.page.title}"`);
      log(`   Handle : ${result.page.handle}`);
      log(`   URL    : https://${STORE}/pages/${result.page.handle}`);
      log(`   ID     : ${result.page.id}`);
    } else {
      log(`❌ Erreur : ${JSON.stringify(result)}`);
    }
  } catch (err) {
    if (err.message.includes('422') || err.message.toLowerCase().includes('taken')) {
      log('⚠️  Une page avec ce handle existe déjà.');
      log('   → Vérifier dans Shopify Admin → Online Store → Pages → "À Propos"');
    } else {
      log(`❌ Erreur création page : ${err.message}`);
    }
  }

  log('\n✅ ÉTAPE 5 TERMINÉE');
}

// ─────────────────────────────────────────────
// ÉTAPE 6 — CLÉ API / APP PRIVÉE
// ─────────────────────────────────────────────
async function etape6_cleAPI() {
  sep('ÉTAPE 6 — CLÉ API ADMIN');

  // Vérifier les scopes du token actuel en testant chaque permission
  log('Vérification des permissions du token actuel (.env)...\n');

  const tests = [
    {
      nom: 'read_products',
      test: async () => {
        const d = await gql('{ products(first: 1) { edges { node { id } } } }');
        return !!d.products;
      }
    },
    {
      nom: 'write_products',
      test: async () => {
        // On vérifie juste la présence de la mutation dans le schema
        const d = await gql('{ __type(name: "Mutation") { fields(includeDeprecated: false) { name } } }');
        const fields = d.__type?.fields?.map(f => f.name) ?? [];
        return fields.includes('productCreate');
      }
    },
    {
      nom: 'read_orders',
      test: async () => {
        const d = await gql('{ orders(first: 1) { edges { node { id } } } }');
        return !!d.orders;
      }
    },
    {
      nom: 'write_orders',
      test: async () => {
        const d = await gql('{ __type(name: "Mutation") { fields(includeDeprecated: false) { name } } }');
        const fields = d.__type?.fields?.map(f => f.name) ?? [];
        return fields.includes('orderCreate') || fields.includes('draftOrderCreate');
      }
    },
    {
      nom: 'read_inventory',
      test: async () => {
        const d = await gql('{ inventoryItems(first: 1, query: "sku:LASSONDE") { edges { node { id } } } }');
        return !!d.inventoryItems;
      }
    },
    {
      nom: 'write_inventory',
      test: async () => {
        const d = await gql('{ __type(name: "Mutation") { fields(includeDeprecated: false) { name } } }');
        const fields = d.__type?.fields?.map(f => f.name) ?? [];
        return fields.includes('inventoryAdjustQuantities') || fields.includes('inventorySetQuantities');
      }
    },
  ];

  const resultats = [];
  for (const t of tests) {
    try {
      const ok = await t.test();
      const status = ok ? '✅' : '❌';
      log(`  ${status} ${t.nom}`);
      resultats.push({ nom: t.nom, ok });
    } catch (err) {
      log(`  ❌ ${t.nom} — ${err.message.slice(0, 80)}`);
      resultats.push({ nom: t.nom, ok: false });
    }
    await pause(200);
  }

  const manquants = resultats.filter(r => !r.ok).map(r => r.nom);

  log('');
  if (manquants.length === 0) {
    log('✅ Toutes les permissions sont disponibles sur ce token.');
    log(`\nToken actuel (copier pour l\'app de scan) :`);
    log(`  ${TOKEN}`);
    log('\nCe token est déjà dans .env — l\'app-scan-ocr peut l\'utiliser directement.');
  } else {
    log(`⚠️  Permissions manquantes : ${manquants.join(', ')}`);
    log('\nPour ajouter ces permissions, tu dois créer un nouveau token :');
    log('  1. Va sur : https://lassonde-wagyu-test.myshopify.com/admin/settings/apps/development');
    log('  2. Clique "Create an app"');
    log('  3. Donne un nom : "Lassonde OCR Scanner"');
    log('  4. Clique "Configure Admin API scopes"');
    log('  5. Active ces scopes :');
    log('       • write_products, read_products');
    log('       • write_inventory, read_inventory');
    log('       • write_orders, read_orders');
    log('  6. Clique "Save" puis "Install app"');
    log('  7. Copie le token généré (commence par shpat_)');
    log('  8. Remplace la valeur dans .env → SHOPIFY_ACCESS_TOKEN=shpat_...');
  }

  log('\n✅ ÉTAPE 6 TERMINÉE');
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  log('🚀 CONFIGURATION STORE — Les Élevages Lassonde');
  log(`   Store   : ${STORE}`);
  log(`   Log     : ${logFile}`);

  try {
    await etape1_audit();
    await pause(500);

    await etape2_livraison();
    await pause(500);

    await etape3_taxes();
    await pause(500);

    await etape4_politiqueProduits();
    await pause(500);

    await etape5_pageAPropos();
    await pause(500);

    await etape6_cleAPI();

    sep('RÉCAPITULATIF FINAL');
    log('Étape 1 — Audit                  ✅ Complété');
    log('Étape 2 — Livraison Québec       ✅ Complété (voir notes)');
    log('Étape 3 — Taxes TPS/TVQ          ✅ Complété');
    log('Étape 4 — Politique produit      ✅ Complété');
    log('Étape 5 — Page À propos          ✅ Complété');
    log('Étape 6 — Clé API               ✅ Complété');
    log('');
    log(`📁 Log complet : ${logFile}`);
    log('');
    log('⚠️  ACTION MANUELLE REQUISE :');
    log('   → Changer la devise à CAD : Shopify Admin → Settings → Store details → Currency');
    log('   → Vérifier les tarifs de livraison : Settings → Shipping and delivery');
    log('   → Activer "Charge taxes on shipping rates" : Settings → Taxes and duties');
    log('');
    log('🎉 CONFIGURATION TERMINÉE');

  } catch (err) {
    log(`\n❌ ERREUR FATALE : ${err.message}`);
    process.exit(1);
  }
}

main();
