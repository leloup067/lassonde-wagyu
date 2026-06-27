// database.js — Base de données locale Lassonde (better-sqlite3)
'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// Stocke la DB sur le disque persistant Railway si dispo (RAILWAY_VOLUME_MOUNT_PATH),
// sinon dans le dossier de l'app (local). Évite la perte de données à chaque deploy.
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DB_DIR || __dirname;
try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (_) {}
const DB_PATH = path.join(DB_DIR, 'lassonde.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
console.log(`📦 DB : ${DB_PATH}${process.env.RAILWAY_VOLUME_MOUNT_PATH ? ' (disque persistant ✅)' : ' (local)'}`);

// Dossier des photos de scan (sur le disque persistant)
const PHOTO_DIR = path.join(DB_DIR, 'photos');
try { fs.mkdirSync(PHOTO_DIR, { recursive: true }); } catch (_) {}

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
    categorie  TEXT DEFAULT 'Autre',
    date_maj   TEXT DEFAULT (date('now'))
  );
`);

// Migration : ajouter categorie si colonne absente (DB existante)
try {
  db.exec(`ALTER TABLE prix_marche ADD COLUMN categorie TEXT DEFAULT 'Autre'`);
} catch (_) { /* colonne existe déjà */ }

// Migrations betes → module Troupeau (bêtes vivantes + frigo)
// tag_atq = numéro de boucle d'oreille ATQ (Agri-Traçabilité Québec / MAPAQ)
const MIGRATIONS_BETES = [
  `ALTER TABLE betes ADD COLUMN tag_atq TEXT`,
  `ALTER TABLE betes ADD COLUMN nom TEXT`,
  `ALTER TABLE betes ADD COLUMN type TEXT DEFAULT 'bœuf'`,
  `ALTER TABLE betes ADD COLUMN date_naissance TEXT`,
  `ALTER TABLE betes ADD COLUMN poids_vif_kg REAL`,
  `ALTER TABLE betes ADD COLUMN race TEXT DEFAULT 'Wagyu'`,
  `ALTER TABLE betes ADD COLUMN date_abattage TEXT`,
  `ALTER TABLE betes ADD COLUMN poids_carcasse_kg REAL`,
  `ALTER TABLE betes ADD COLUMN notes TEXT`,
  `ALTER TABLE betes ADD COLUMN date_envoi_abattage TEXT`,
];
for (const m of MIGRATIONS_BETES) {
  try { db.exec(m); } catch (_) { /* colonne existe déjà */ }
}
// Statut legacy 'en cours' → 'pâturage' (nouveau vocabulaire troupeau)
db.exec(`UPDATE betes SET statut = 'pâturage' WHERE statut = 'en cours' OR statut IS NULL`);

// Migration : colonne photo sur inventaire (nom de fichier de la photo de scan)
try { db.exec(`ALTER TABLE inventaire ADD COLUMN photo TEXT`); } catch (_) { /* existe déjà */ }

// Migration : mode de paiement sur les ventes (Interac / comptant)
try { db.exec(`ALTER TABLE ventes ADD COLUMN mode_paiement TEXT`); } catch (_) { /* existe déjà */ }

// Migration : tag de la mère pour pedigree (vaches reproductrices)
try { db.exec(`ALTER TABLE betes ADD COLUMN mere_tag TEXT`); } catch (_) { /* existe déjà */ }

// Prix suggérés du marché (rafraîchis à la demande via recherche web)
db.exec(`
  CREATE TABLE IF NOT EXISTS prix_suggere (
    coupe_key TEXT PRIMARY KEY,
    coupe     TEXT,
    prix_kg   REAL,
    date_maj  TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ─── SEED : CATALOGUE COMPLET LASSONDE — 44 PRODUITS ────────────────────────
const prixLassonde = [
  // ULTRA PREMIUM
  { coupe: 'Filet Mignon',          prix_kg: 241.99, categorie: 'Ultra Premium' },
  { coupe: 'Tomahawk',              prix_kg: 149.99, categorie: 'Ultra Premium' },
  { coupe: 'Faux-Filet',            prix_kg: 149.99, categorie: 'Ultra Premium' },
  { coupe: 'Contre-Filet',          prix_kg: 149.99, categorie: 'Ultra Premium' },
  { coupe: 'Steak de Côte',         prix_kg: 119.99, categorie: 'Ultra Premium' },
  { coupe: 'T-Bone',                prix_kg: 119.99, categorie: 'Ultra Premium' },
  // PREMIUM
  { coupe: 'Onglet',                prix_kg: 104.49, categorie: 'Premium' },
  { coupe: 'Hampe',                 prix_kg: 104.49, categorie: 'Premium' },
  { coupe: 'Picanha (Culotte)',      prix_kg: 104.49, categorie: 'Premium' },
  { coupe: 'Macreuse',              prix_kg:  89.99, categorie: 'Premium' },
  { coupe: 'Araignée',              prix_kg:  89.99, categorie: 'Premium' },
  // STEAKS & GRILL
  { coupe: 'Surlonge',              prix_kg:  76.99, categorie: 'Steaks' },
  { coupe: 'Steak Français',        prix_kg:  76.99, categorie: 'Steaks' },
  { coupe: 'Baseball',              prix_kg:  76.99, categorie: 'Steaks' },
  { coupe: 'Tri-Tip',               prix_kg:  76.99, categorie: 'Steaks' },
  { coupe: 'Denver',                prix_kg:  76.99, categorie: 'Steaks' },
  { coupe: 'Flanc',                 prix_kg:  76.99, categorie: 'Steaks' },
  { coupe: 'Faux-Filet Palette',    prix_kg:  65.99, categorie: 'Steaks' },
  // BBQ & SLOW COOK
  { coupe: 'Brisket',               prix_kg:  54.99, categorie: 'BBQ' },
  { coupe: 'Tournedos',             prix_kg:  54.99, categorie: 'BBQ' },
  { coupe: 'Côtes Levées',          prix_kg:  49.99, categorie: 'BBQ' },
  { coupe: 'Osso Buco',             prix_kg:  44.99, categorie: 'BBQ' },
  { coupe: 'Short Ribs (Côte Coréenne)', prix_kg: 39.99, categorie: 'BBQ' },
  // RÔTIS
  { coupe: 'Rôti Français',         prix_kg:  65.99, categorie: 'Rôtis' },
  { coupe: 'Palette sans os',       prix_kg:  54.99, categorie: 'Rôtis' },
  { coupe: 'Palette avec os',       prix_kg:  49.99, categorie: 'Rôtis' },
  // BROCHETTES & PRÉPARÉ
  { coupe: 'Brochettes Teriyaki',       prix_kg: 54.99, categorie: 'Préparé' },
  { coupe: 'Brochettes Érable/Poivre',  prix_kg: 54.99, categorie: 'Préparé' },
  { coupe: 'Brochettes Whiskey Fumé',   prix_kg: 54.99, categorie: 'Préparé' },
  { coupe: 'Brochettes nature',         prix_kg: 49.99, categorie: 'Préparé' },
  { coupe: 'Burger Wagyu',              prix_kg: 33.99, categorie: 'Préparé' },
  { coupe: 'Haché Wagyu',              prix_kg: 33.99, categorie: 'Préparé' },
  // ACCESSIBLE
  { coupe: 'Bacon de Boeuf',        prix_kg:  69.99, categorie: 'Accessible' },
  { coupe: 'Bacon Bœuf Épices',     prix_kg:  69.99, categorie: 'Accessible' },
  { coupe: 'Mi Soter',              prix_kg:  29.99, categorie: 'Accessible' },
  { coupe: '1023',                  prix_kg:  29.99, categorie: 'Accessible' },
  { coupe: 'Marteau Thor (jarret)', prix_kg:  24.99, categorie: 'Accessible' },
  // ABATS & SPÉCIALITÉS
  { coupe: 'Coeur',                 prix_kg:  19.99, categorie: 'Abats' },
  { coupe: 'Joue',                  prix_kg:  24.99, categorie: 'Abats' },
  { coupe: 'Langue',                prix_kg:  19.99, categorie: 'Abats' },
  { coupe: 'Queue',                 prix_kg:  19.99, categorie: 'Abats' },
  { coupe: 'Foie',                  prix_kg:  14.99, categorie: 'Abats' },
  { coupe: 'Rognon',                prix_kg:  14.99, categorie: 'Abats' },
  { coupe: 'Os à Moelle',           prix_kg:  14.99, categorie: 'Abats' },
  { coupe: 'Os à Soupe',            prix_kg:   9.89, categorie: 'Abats' },
];

// Concurrents connus
const prixConcurrents = [
  { coupe: 'Short Ribs', concurrent: 'Westmount',         prix_kg: 39.99, categorie: 'BBQ' },
  { coupe: 'Short Ribs', concurrent: 'Westmount (promo)', prix_kg: 29.99, categorie: 'BBQ' },
];

const insertPrix = db.prepare(`
  INSERT INTO prix_marche (coupe, concurrent, prix_kg, categorie, date_maj)
  VALUES (?, ?, ?, ?, date('now'))
`);

db.transaction(() => {
  // Reset uniquement les prix Lassonde (garde les concurrents existants)
  db.prepare(`DELETE FROM prix_marche WHERE concurrent = 'Lassonde'`).run();
  prixLassonde.forEach(p => insertPrix.run(p.coupe, 'Lassonde', p.prix_kg, p.categorie));

  // Concurrents — insert or ignore
  const insertConc = db.prepare(`
    INSERT OR IGNORE INTO prix_marche (coupe, concurrent, prix_kg, categorie, date_maj)
    VALUES (?, ?, ?, ?, date('now'))
  `);
  prixConcurrents.forEach(p => insertConc.run(p.coupe, p.concurrent, p.prix_kg, p.categorie));
})();

console.log(`✅ ${prixLassonde.length} prix Lassonde chargés dans prix_marche`);

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
    numero_bete:        data.numero_bete != null ? data.numero_bete : null,  // garde le bœuf #0
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

function supprimerSac(id) {
  return db.prepare('DELETE FROM inventaire WHERE id = ?').run(id);
}

// Reclasser un sac (corriger la coupe d'une erreur de scan)
function updateCoupe(id, coupe) {
  return db.prepare('UPDATE inventaire SET coupe = ? WHERE id = ?').run(coupe, id);
}

// Enregistre la photo d'un sac (base64) sur le disque + référence en DB
function setSacPhoto(id, base64) {
  if (!base64) return null;
  const file = `${id}.jpg`;
  fs.writeFileSync(path.join(PHOTO_DIR, file), Buffer.from(base64, 'base64'));
  db.prepare('UPDATE inventaire SET photo = ? WHERE id = ?').run(file, id);
  return file;
}

function getPhotoPath(id) {
  const row = db.prepare('SELECT photo FROM inventaire WHERE id = ?').get(id);
  if (!row || !row.photo) return null;
  const p = path.join(PHOTO_DIR, row.photo);
  return fs.existsSync(p) ? p : null;
}

// Rattache tous les sacs SANS bête à un numéro de bête (ex: le bœuf test #0)
function rattacherOrphelins(numero_bete) {
  return db.prepare('UPDATE inventaire SET numero_bete = ? WHERE numero_bete IS NULL').run(numero_bete);
}

// Retire un bœuf du troupeau (détache ses morceaux plutôt que de les perdre)
function supprimerBete(numero_bete) {
  const detache = db.prepare('UPDATE inventaire SET numero_bete = NULL WHERE numero_bete = ?').run(numero_bete);
  const r = db.prepare('DELETE FROM betes WHERE numero_bete = ?').run(numero_bete);
  return { supprime: r.changes, morceaux_detaches: detache.changes };
}

function getInventaire({ statut, coupe, limit = 10000 } = {}) {
  let sql = 'SELECT * FROM inventaire WHERE 1=1';
  const params = [];
  if (statut) { sql += ' AND statut = ?'; params.push(statut); }
  if (coupe)  { sql += ' AND LOWER(coupe) LIKE ?'; params.push('%' + coupe.toLowerCase() + '%'); }
  // Le tri FIFO par coupe est fait côté affichage (renderLocalStock)
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
    INSERT INTO betes (numero_bete, tag_atq, nom, type, date_naissance, poids_vif_kg,
      race, date_livraison, cout_elevage, date_abattage, poids_carcasse_kg, notes, statut)
    VALUES (@numero_bete, @tag_atq, @nom, @type, @date_naissance, @poids_vif_kg,
      @race, @date_livraison, @cout_elevage, @date_abattage, @poids_carcasse_kg, @notes, @statut)
    ON CONFLICT(numero_bete) DO UPDATE SET
      tag_atq           = COALESCE(excluded.tag_atq, tag_atq),
      nom               = COALESCE(excluded.nom, nom),
      type              = COALESCE(excluded.type, type),
      date_naissance    = COALESCE(excluded.date_naissance, date_naissance),
      poids_vif_kg      = COALESCE(excluded.poids_vif_kg, poids_vif_kg),
      race              = COALESCE(excluded.race, race),
      date_livraison    = COALESCE(excluded.date_livraison, date_livraison),
      cout_elevage      = excluded.cout_elevage,
      date_abattage     = COALESCE(excluded.date_abattage, date_abattage),
      poids_carcasse_kg = COALESCE(excluded.poids_carcasse_kg, poids_carcasse_kg),
      notes             = COALESCE(excluded.notes, notes),
      statut            = excluded.statut
  `).run({
    numero_bete:       data.numero_bete != null ? data.numero_bete : 1,  // permet le bœuf #0
    tag_atq:           data.tag_atq           || null,
    nom:               data.nom               || null,
    type:              data.type              || 'bœuf',
    date_naissance:    data.date_naissance    || null,
    poids_vif_kg:      data.poids_vif_kg      || null,
    race:              data.race              || 'Wagyu',
    date_livraison:    data.date_livraison    || null,
    cout_elevage:      data.cout_elevage      || 4000,
    date_abattage:     data.date_abattage     || null,
    poids_carcasse_kg: data.poids_carcasse_kg || null,
    notes:             data.notes             || null,
    statut:            data.statut            || 'pâturage',
  });
  return db.prepare('SELECT * FROM betes WHERE numero_bete = ?').get(data.numero_bete != null ? data.numero_bete : 1);
}

// Import en masse (liste papier scannée ou CSV) — transaction unique
function importerBetes(rows) {
  let maxNum = db.prepare('SELECT COALESCE(MAX(numero_bete), 0) AS m FROM betes').get().m;
  const existeTag = db.prepare('SELECT 1 FROM betes WHERE tag_atq = ?');
  const existeNum = db.prepare('SELECT 1 FROM betes WHERE numero_bete = ?');
  const insert = db.prepare(`
    INSERT INTO betes (numero_bete, tag_atq, nom, type, date_naissance, poids_vif_kg, race, notes, statut)
    VALUES (@numero_bete, @tag_atq, @nom, @type, @date_naissance, @poids_vif_kg, @race, @notes, 'pâturage')
  `);
  let ajouts = 0, doublons = 0;
  db.transaction(() => {
    for (const r of rows) {
      const tag = (r.tag_atq || '').toString().trim() || null;
      if (tag && existeTag.get(tag)) { doublons++; continue; }
      let num = parseInt(r.numero_bete) || 0;
      if (!num || existeNum.get(num)) num = ++maxNum;
      else maxNum = Math.max(maxNum, num);
      insert.run({
        numero_bete:    num,
        tag_atq:        tag,
        nom:            (r.nom   || '').toString().trim().slice(0, 80)  || null,
        type:           ['bœuf', 'veau', 'vache'].includes(r.type) ? r.type : 'bœuf',
        date_naissance: (r.date_naissance || '').toString().trim().slice(0, 10) || null,
        poids_vif_kg:   parseFloat(r.poids_vif_kg) || null,
        race:           (r.race  || '').toString().trim().slice(0, 60)  || 'Wagyu',
        notes:          (r.notes || '').toString().trim().slice(0, 200) || null,
      });
      ajouts++;
    }
  })();
  return { ajouts, doublons };
}

// Troupeau complet : chaque bête + agrégats des morceaux scannés (liés par numero_bete)
function getTroupeau() {
  return db.prepare(`
    SELECT
      b.*,
      COUNT(i.id)                                                          AS nb_morceaux,
      ROUND(SUM(i.poids_kg), 2)                                            AS poids_decoupe_kg,
      ROUND(SUM(i.prix_total), 2)                                          AS valeur_totale,
      SUM(CASE WHEN i.statut = 'disponible' THEN 1 ELSE 0 END)             AS nb_disponibles,
      ROUND(SUM(CASE WHEN i.statut = 'vendu' THEN i.prix_total ELSE 0 END), 2) AS valeur_vendue,
      MIN(i.date_scan)                                                     AS date_entree_frigo
    FROM betes b
    LEFT JOIN inventaire i ON i.numero_bete = b.numero_bete
    GROUP BY b.id
    ORDER BY
      CASE b.statut
        WHEN 'pâturage' THEN 0
        WHEN 'abattoir' THEN 1
        WHEN 'frigo'    THEN 2
        ELSE 3
      END,
      b.numero_bete
  `).all();
}

function setStatutBete(numero_bete, statut, dates = {}) {
  // dates: { date_abattage, date_envoi_abattage } — chacune optionnelle
  db.prepare(`
    UPDATE betes SET
      statut              = @statut,
      date_abattage       = COALESCE(@date_abattage, date_abattage),
      date_envoi_abattage = COALESCE(@date_envoi_abattage, date_envoi_abattage)
    WHERE numero_bete = @numero_bete
  `).run({
    numero_bete, statut,
    date_abattage:       dates.date_abattage       || null,
    date_envoi_abattage: dates.date_envoi_abattage || null,
  });
  return db.prepare('SELECT * FROM betes WHERE numero_bete = ?').get(numero_bete);
}

// Rapport complet d'une bête : fiche + tous les morceaux + totaux
function getRapportBete(numero_bete) {
  const bete = db.prepare('SELECT * FROM betes WHERE numero_bete = ?').get(numero_bete);
  if (!bete) return null;
  const morceaux = db.prepare(`
    SELECT id, coupe, poids_kg, prix_kg, prix_total, meilleur_avant, statut, date_scan
    FROM inventaire WHERE numero_bete = ?
    ORDER BY prix_total DESC
  `).all(numero_bete);
  const totaux = {
    nb_morceaux:      morceaux.length,
    poids_total_kg:   Math.round(morceaux.reduce((s, m) => s + (m.poids_kg   || 0), 0) * 1000) / 1000,
    valeur_totale:    Math.round(morceaux.reduce((s, m) => s + (m.prix_total || 0), 0) * 100) / 100,
    marge_estimee:    Math.round((morceaux.reduce((s, m) => s + (m.prix_total || 0), 0) - (bete.cout_elevage || 4000)) * 100) / 100,
  };
  return { bete, morceaux, totaux };
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
    INSERT INTO ventes (inventaire_id, shopify_order_id, prix_vendu, mode_paiement)
    VALUES (?, ?, ?, ?)
  `).run(data.inventaire_id, data.shopify_order_id || null, data.prix_vendu || null, data.mode_paiement || null);
  // Marquer le sac comme vendu
  updateStatut(data.inventaire_id, 'vendu');
  return vente.lastInsertRowid;
}

// Encaisser un panier : plusieurs morceaux d'un coup, même mode de paiement
function encaisserPanier(inventaire_ids, mode_paiement) {
  let n = 0;
  db.transaction(() => {
    for (const id of inventaire_ids) {
      const sac = db.prepare(`SELECT prix_total FROM inventaire WHERE id = ? AND statut = 'disponible'`).get(id);
      if (!sac) continue;
      enregistrerVente({ inventaire_id: id, prix_vendu: sac.prix_total, mode_paiement });
      n++;
    }
  })();
  return { vendus: n };
}

// Renommer une coupe en lot (corrige toute une catégorie de coupe d'un coup)
function reclasserLot(ids, coupe) {
  if (!Array.isArray(ids) || !ids.length || !coupe) return { changes: 0 };
  const stmt = db.prepare('UPDATE inventaire SET coupe = ? WHERE id = ?');
  let n = 0;
  db.transaction(() => { for (const id of ids) n += stmt.run(coupe, id).changes; })();
  return { changes: n };
}

// Trouve le sac DISPONIBLE qui correspond le mieux à une étiquette scannée
// (même coupe, poids le plus proche). null si rien en stock.
function chercherSacDisponible(coupe, poidsKg) {
  const c = '%' + (coupe || '').toLowerCase() + '%';
  const candidats = db.prepare(
    `SELECT * FROM inventaire WHERE statut = 'disponible' AND LOWER(coupe) LIKE ? ORDER BY date_scan ASC`
  ).all(c);
  if (!candidats.length) return null;
  if (!poidsKg) return candidats[0];               // pas de poids → le plus vieux (FIFO)
  return candidats.reduce((best, s) =>
    Math.abs((s.poids_kg || 0) - poidsKg) < Math.abs((best.poids_kg || 0) - poidsKg) ? s : best);
}

// Annuler une vente : supprime la vente ET remet le morceau en stock (disponible)
function annulerVente(id) {
  const vente = db.prepare('SELECT inventaire_id FROM ventes WHERE id = ?').get(id);
  if (!vente) return { ok: false };
  db.transaction(() => {
    db.prepare('DELETE FROM ventes WHERE id = ?').run(id);
    if (vente.inventaire_id) {
      db.prepare(`UPDATE inventaire SET statut = 'disponible' WHERE id = ?`).run(vente.inventaire_id);
    }
  })();
  return { ok: true, inventaire_id: vente.inventaire_id };
}

// Historique des ventes (avec coupe + bête depuis l'inventaire)
function getVentes(limit = 50) {
  return db.prepare(`
    SELECT v.id, v.prix_vendu, v.date_vente, v.mode_paiement,
           i.coupe, i.poids_kg, i.numero_bete, i.id AS inventaire_id
    FROM ventes v
    LEFT JOIN inventaire i ON i.id = v.inventaire_id
    ORDER BY v.date_vente DESC
    LIMIT ?
  `).all(limit);
}

// Stats de reproduction pour une vache : nombre de veaux vivants et morts
function getStatsVache(tag_atq) {
  if (!tag_atq) return { vivants: 0, morts: 0 };

  // Chercher tous les descendants (notes contient "Mère: TAG")
  const pattern = `Mère: ${tag_atq}`;
  const all = db.prepare(`
    SELECT notes FROM betes
    WHERE notes LIKE ? AND type IN ('veau', 'bœuf')
  `).all(`%${pattern}%`);

  const vivants = all.filter(r => !r.notes?.includes('MORT')).length;
  const morts = all.filter(r => r.notes?.includes('MORT')).length;

  return { vivants, morts };
}

// Calcul des stats pour TOUTES les vaches (optimisé: 1 requête)
function getAllStatsVaches() {
  const result = {};
  // Récupérer tous les animaux avec une mère mentionnée
  const all = db.prepare(`
    SELECT notes FROM betes
    WHERE notes LIKE 'Mère:%' AND type IN ('veau', 'bœuf')
  `).all();

  // Grouper par mère
  all.forEach(r => {
    const match = r.notes?.match(/Mère:\s*(\d+)/);
    if (!match) return;
    const merTag = match[1];
    if (!result[merTag]) result[merTag] = { vivants: 0, morts: 0 };
    if (r.notes?.includes('MORT')) result[merTag].morts++;
    else result[merTag].vivants++;
  });

  return result;
}

// ─── PRIX MARCHÉ ──────────────────────────────────────────────────────────────
function getPrixMarche() {
  return db.prepare('SELECT * FROM prix_marche ORDER BY coupe, concurrent').all();
}

// Prix suggérés du marché (recherche web à la demande)
function setPrixSuggeres(list) {
  const upsert = db.prepare(`
    INSERT INTO prix_suggere (coupe_key, coupe, prix_kg, date_maj)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(coupe_key) DO UPDATE SET coupe=excluded.coupe, prix_kg=excluded.prix_kg, date_maj=excluded.date_maj
  `);
  let n = 0;
  db.transaction(() => {
    for (const p of list) {
      if (!p.coupe_key || p.prix_kg == null) continue;
      upsert.run(p.coupe_key, p.coupe || p.coupe_key, p.prix_kg);
      n++;
    }
  })();
  return n;
}

function getPrixSuggeres() {
  const rows = db.prepare('SELECT coupe_key, coupe, prix_kg, date_maj FROM prix_suggere').all();
  const maj  = db.prepare('SELECT MAX(date_maj) AS m FROM prix_suggere').get().m;
  return { prix: rows, date_maj: maj };
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
  supprimerSac,
  updateCoupe,
  reclasserLot,
  encaisserPanier,
  setSacPhoto,
  getPhotoPath,
  rattacherOrphelins,
  getInventaire,
  getResume,
  upsertBete,
  importerBetes,
  supprimerBete,
  annulerVente,
  getBetes,
  getTroupeau,
  setStatutBete,
  getRapportBete,
  enregistrerVente,
  chercherSacDisponible,
  getVentes,
  getStatsVache,
  getAllStatsVaches,
  getPrixMarche,
  setPrixSuggeres,
  getPrixSuggeres,
  comparerPrix,
  getDashboard,
};
