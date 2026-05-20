// database.js — Base de données locale Lassonde (better-sqlite3)
'use strict';

const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, 'lassonde.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── SCHÉMA ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS inventaire (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    coupe              TEXT    NOT NULL,
    poids_kg           REAL    NOT NULL,
    prix_kg            REAL    NOT NULL,
    prix_total         REAL    NOT NULL,
    meilleur_avant     TEXT,
    code_produit       TEXT,
    halal              INTEGER DEFAULT 1,
    statut             TEXT    DEFAULT 'disponible',
    shopify_product_id TEXT,
    date_scan          TEXT    DEFAULT (datetime('now','localtime')),
    date_livraison     TEXT,
    numero_bete        INTEGER
  );

  CREATE TABLE IF NOT EXISTS betes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_bete    INTEGER UNIQUE,
    date_livraison TEXT,
    cout_elevage   REAL    DEFAULT 4000,
    nombre_sacs    INTEGER,
    revenu_total   REAL,
    marge_nette    REAL,
    statut         TEXT    DEFAULT 'en cours'
  );

  CREATE TABLE IF NOT EXISTS ventes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    inventaire_id    INTEGER,
    shopify_order_id TEXT,
    prix_vendu       REAL,
    date_vente       TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (inventaire_id) REFERENCES inventaire(id)
  );

  CREATE TABLE IF NOT EXISTS prix_marche (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    coupe      TEXT NOT NULL,
    concurrent TEXT NOT NULL,
    prix_kg    REAL NOT NULL,
    date_maj   TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ─── SEED : PRIX MARCHÉ ───────────────────────────────────────────────────────
const seedPrixMarche = db.prepare(
  'INSERT OR IGNORE INTO prix_marche (id, coupe, concurrent, prix_kg) VALUES (?,?,?,?)'
);
const seedData = [
  [1,  'Short Ribs',        'Westmount',           39.99],
  [2,  'Short Ribs',        'Westmount (promo)',    29.99],
  [3,  'Boeuf Haché Wagyu', 'Lassonde',            33.99],
  [4,  'Bacon de Boeuf',    'Lassonde',            69.99],
  [5,  'Steak Français',    'Lassonde',            76.99],
  [6,  'Faux-Filet',        'Lassonde',           149.99],
  [7,  'Tomahawk',          'Lassonde',           149.99],
  [8,  'Culotte Picanha',   'Lassonde',           104.49],
  [9,  'Steak de Côte',     'Lassonde',           119.99],
  [10, 'Viande à Fondue',   'Lassonde',            77.99],
];
const seedTx = db.transaction(() => seedData.forEach(row => seedPrixMarche.run(...row)));
seedTx();

// ─── INVENTAIRE ──────────────────────────────────────────────────────────────
const stmtInsertSac = db.prepare(`
  INSERT INTO inventaire (coupe, poids_kg, prix_kg, prix_total, meilleur_avant,
    code_produit, statut, shopify_product_id, date_livraison, numero_bete)
  VALUES (@coupe, @poids_kg, @prix_kg, @prix_total, @meilleur_avant,
    @code_produit, @statut, @shopify_product_id, @date_livraison, @numero_bete)
`);

const stmtUpdateStatut = db.prepare(
  `UPDATE inventaire SET statut = @statut, shopify_product_id = COALESCE(@shopify_product_id, shopify_product_id)
   WHERE id = @id`
);

function insertSac(data) {
  const row = {
    coupe:              data.coupe              || '(inconnu)',
    poids_kg:           data.poids_kg           || 0,
    prix_kg:            data.prix_kg            || 0,
    prix_total:         data.prix_total         || 0,
    meilleur_avant:     data.meilleur_avant      || null,
    code_produit:       data.code_produit        || null,
    statut:             data.statut              || 'disponible',
    shopify_product_id: data.shopify_product_id  || null,
    date_livraison:     data.date_livraison      || null,
    numero_bete:        data.numero_bete         || null,
  };
  const result = stmtInsertSac.run(row);
  return result.lastInsertRowid;
}

function updateStatut(id, statut, shopifyId = null) {
  stmtUpdateStatut.run({ id, statut, shopify_product_id: shopifyId });
}

function getSac(id) {
  return db.prepare('SELECT * FROM inventaire WHERE id = ?').get(id);
}

function getInventaire({ statut, coupe, limit = 200 } = {}) {
  let sql = 'SELECT * FROM inventaire WHERE 1=1';
  const params = [];
  if (statut) { sql += ' AND statut = ?'; params.push(statut); }
  if (coupe)  { sql += ' AND LOWER(coupe) LIKE ?'; params.push('%' + coupe.toLowerCase() + '%'); }
  sql += ' ORDER BY date_scan DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

function getResume() {
  const total = db.prepare(`
    SELECT
      COUNT(*) as total_sacs,
      ROUND(SUM(prix_total), 2) as valeur_totale,
      ROUND(SUM(poids_kg), 3) as poids_total_kg,
      COUNT(DISTINCT coupe) as nb_coupes
    FROM inventaire
  `).get();

  const par_statut = db.prepare(`
    SELECT statut, COUNT(*) as nb, ROUND(SUM(prix_total),2) as valeur
    FROM inventaire GROUP BY statut
  `).all();

  const par_coupe = db.prepare(`
    SELECT coupe,
      COUNT(*) as nb_sacs,
      ROUND(AVG(prix_kg),2) as prix_kg_moyen,
      ROUND(SUM(prix_total),2) as valeur_totale,
      statut
    FROM inventaire
    GROUP BY coupe, statut
    ORDER BY valeur_totale DESC
  `).all();

  return { ...total, par_statut, par_coupe };
}

// ─── BÊTES ────────────────────────────────────────────────────────────────────
function upsertBete(data) {
  db.prepare(`
    INSERT INTO betes (numero_bete, date_livraison, cout_elevage, statut)
    VALUES (@numero_bete, @date_livraison, @cout_elevage, @statut)
    ON CONFLICT(numero_bete) DO UPDATE SET
      date_livraison = excluded.date_livraison,
      cout_elevage   = excluded.cout_elevage,
      statut         = excluded.statut
  `).run({
    numero_bete:    data.numero_bete   || 1,
    date_livraison: data.date_livraison|| null,
    cout_elevage:   data.cout_elevage  || 4000,
    statut:         data.statut        || 'en cours',
  });
}

function getBetes() {
  // Calcule le revenu et la marge depuis inventaire + ventes
  return db.prepare(`
    SELECT
      b.*,
      COUNT(i.id)                       AS nb_sacs_scannés,
      ROUND(SUM(i.prix_total), 2)        AS revenu_brut,
      COUNT(v.id)                        AS nb_vendus,
      ROUND(SUM(CASE WHEN i.statut='vendu' THEN i.prix_total ELSE 0 END), 2) AS revenu_encaissé,
      ROUND(SUM(CASE WHEN i.statut='vendu' THEN i.prix_total ELSE 0 END) - b.cout_elevage, 2) AS marge_nette
    FROM betes b
    LEFT JOIN inventaire i ON i.numero_bete = b.numero_bete
    LEFT JOIN ventes v ON v.inventaire_id = i.id
    GROUP BY b.id
    ORDER BY b.date_livraison DESC
  `).all();
}

// ─── VENTES ──────────────────────────────────────────────────────────────────
function enregistrerVente(data) {
  const vente = db.prepare(`
    INSERT INTO ventes (inventaire_id, shopify_order_id, prix_vendu)
    VALUES (@inventaire_id, @shopify_order_id, @prix_vendu)
  `).run(data);
  // Marquer le sac comme vendu
  updateStatut(data.inventaire_id, 'vendu');
  return vente.lastInsertRowid;
}

// ─── PRIX MARCHÉ ──────────────────────────────────────────────────────────────
function getPrixMarche() {
  return db.prepare('SELECT * FROM prix_marche ORDER BY coupe, concurrent').all();
}

function comparerPrix(coupe) {
  return db.prepare(`
    SELECT
      i.coupe,
      ROUND(AVG(i.prix_kg), 2) as notre_prix_kg,
      m.concurrent,
      m.prix_kg as prix_concurrent,
      ROUND((AVG(i.prix_kg) - m.prix_kg) / m.prix_kg * 100, 1) as diff_pct
    FROM inventaire i
    JOIN prix_marche m ON LOWER(m.coupe) LIKE '%' || LOWER(SUBSTR(i.coupe,1,5)) || '%'
    WHERE LOWER(i.coupe) LIKE ?
    GROUP BY m.concurrent
  `).all('%' + (coupe || '').toLowerCase() + '%');
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function getDashboard() {
  const resume      = getResume();
  const betes       = getBetes();
  const prix_marche = getPrixMarche();
  const recents     = getInventaire({ statut:'disponible', limit:20 });

  // Top coupes disponibles
  const top_coupes = db.prepare(`
    SELECT coupe, COUNT(*) as nb, ROUND(SUM(prix_total),2) as valeur
    FROM inventaire WHERE statut='disponible'
    GROUP BY coupe ORDER BY nb DESC LIMIT 10
  `).all();

  return {
    ts: new Date().toISOString(),
    resume,
    top_coupes,
    betes,
    prix_marche,
    recents: recents.slice(0, 10),
  };
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  db,
  insertSac,
  updateStatut,
  getSac,
  getInventaire,
  getResume,
  upsertBete,
  getBetes,
  enregistrerVente,
  getPrixMarche,
  comparerPrix,
  getDashboard,
};
