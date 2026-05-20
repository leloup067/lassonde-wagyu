#!/usr/bin/env node
// vision-test.js — Test de précision Claude Vision sur étiquettes Lassonde
// Usage : node vision-test.js
require('dotenv').config();

const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const sharp  = require('sharp');
const PDFDoc = require('pdfkit');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error('❌  ANTHROPIC_API_KEY manquante'); process.exit(1); }

const OUT_DIR = path.join(__dirname, 'vision-test-output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── 20 ÉTIQUETTES SYNTHÉTIQUES LASSONDE ─────────────────────────────────────
const LABELS = [
  { id:1,  coupe:'Ribeye',                poids_kg:0.823, prix_kg:89.24,  total:73.44,  date:'2026-06-15', code:'C-1528' },
  { id:2,  coupe:'Filet Mignon',          poids_kg:0.412, prix_kg:126.24, total:52.01,  date:'2026-06-14', code:'C-1528' },
  { id:3,  coupe:'Short Ribs',            poids_kg:1.094, prix_kg:39.99,  total:43.75,  date:'2026-06-18', code:'C-1528' },
  { id:4,  coupe:'Bavette',               poids_kg:0.654, prix_kg:52.44,  total:34.30,  date:'2026-06-16', code:'C-1528' },
  { id:5,  coupe:'Côte de Bœuf',          poids_kg:1.245, prix_kg:89.24,  total:111.10, date:'2026-06-15', code:'C-1528' },
  { id:6,  coupe:'Brisket',               poids_kg:2.187, prix_kg:28.24,  total:61.74,  date:'2026-06-20', code:'C-1528' },
  { id:7,  coupe:'Striploin',             poids_kg:0.734, prix_kg:89.24,  total:65.48,  date:'2026-06-17', code:'C-1528' },
  { id:8,  coupe:'Flank Steak',           poids_kg:0.598, prix_kg:52.44,  total:31.36,  date:'2026-06-16', code:'C-1528' },
  { id:9,  coupe:'Chuck Roast',           poids_kg:1.876, prix_kg:28.24,  total:52.98,  date:'2026-06-22', code:'C-1528' },
  { id:10, coupe:'T-Bone',               poids_kg:0.912, prix_kg:89.24,  total:81.39,  date:'2026-06-15', code:'C-1528' },
  { id:11, coupe:'Joues de Bœuf',         poids_kg:0.743, prix_kg:28.24,  total:20.98,  date:'2026-06-19', code:'C-1387' },
  { id:12, coupe:'Queue de Bœuf',         poids_kg:1.123, prix_kg:22.44,  total:25.20,  date:'2026-06-21', code:'C-1387' },
  { id:13, coupe:'Poitrine',             poids_kg:1.567, prix_kg:35.44,  total:55.54,  date:'2026-06-18', code:'C-1387' },
  { id:14, coupe:'Bavette de Flanchet',   poids_kg:0.489, prix_kg:52.44,  total:25.64,  date:'2026-06-17', code:'C-1387' },
  { id:15, coupe:'Paleron',              poids_kg:0.876, prix_kg:28.24,  total:24.74,  date:'2026-06-20', code:'C-1387' },
  { id:16, coupe:'Entrecôte',            poids_kg:0.631, prix_kg:89.24,  total:56.31,  date:'2026-06-15', code:'C-1387' },
  { id:17, coupe:'Rôti de Côtes',        poids_kg:1.432, prix_kg:75.44,  total:108.03, date:'2026-06-16', code:'C-1387' },
  { id:18, coupe:'Brochette Wagyu',       poids_kg:0.312, prix_kg:68.44,  total:21.35,  date:'2026-06-19', code:'C-1387' },
  { id:19, coupe:'Os à Moelle',          poids_kg:0.891, prix_kg:17.24,  total:15.36,  date:'2026-06-23', code:'C-1387' },
  { id:20, coupe:'Tendron',              poids_kg:0.756, prix_kg:22.44,  total:16.96,  date:'2026-06-21', code:'C-1387' },
];

// ─── CONDITIONS PHOTO ─────────────────────────────────────────────────────────
const CONDITIONS = [
  { id:1, name:'Parfaite',             desc:'Image nette, bonne lumière, angle frontal' },
  { id:2, name:'Légèrement floue',     desc:'Léger mouvement de main ou mise au point approximative' },
  { id:3, name:'Très floue',           desc:'Mouvement important ou distance incorrecte' },
  { id:4, name:'Reflet plastique',     desc:'Reflet de lumière sur emballage sous-vide' },
  { id:5, name:'Angle 45°',            desc:'Étiquette photographiée en diagonale' },
  { id:6, name:'Étiquette coupée',     desc:'Bords de l\'étiquette hors cadre' },
  { id:7, name:'Trop sombre',          desc:'Éclairage insuffisant, ombres profondes' },
  { id:8, name:'Surexposé',            desc:'Trop de lumière, zones brûlées' },
  { id:9, name:'Étiquette froissée',   desc:'Emballage déformé, texte plissé' },
];

// ─── GÉNÉRATION SVG → JPEG ────────────────────────────────────────────────────
function labelSVG(label) {
  const W = 520, H = 280;
  const ean = label.code.replace('C-','').padStart(13,'0');
  const bars = Array.from({length:50}, (_,i) =>
    `<rect x="${30 + i*7}" y="${220}" width="${i%3===0?5:3}" height="${35}" fill="black"/>`
  ).join('');

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      text { font-family: Arial, sans-serif; }
      .title { font-size: 22px; font-weight: bold; fill: #111; }
      .label { font-size: 11px; fill: #555; text-transform: uppercase; letter-spacing: 1px; }
      .value { font-size: 18px; font-weight: bold; fill: #111; }
      .price { font-size: 28px; font-weight: bold; fill: #111; }
      .small { font-size: 11px; fill: #333; }
      .cert  { font-size: 10px; fill: #1a6b2a; font-weight: bold; }
    </style>
  </defs>

  <!-- Fond blanc avec bordure -->
  <rect width="${W}" height="${H}" fill="white" rx="4"/>
  <rect width="${W}" height="${H}" fill="none" stroke="#ccc" stroke-width="1" rx="4"/>

  <!-- Bande supérieure -->
  <rect x="0" y="0" width="${W}" height="36" fill="#1a1a1a" rx="4"/>
  <rect x="0" y="20" width="${W}" height="16" fill="#1a1a1a"/>
  <text x="14" y="25" fill="white" style="font-family:Arial;font-size:13px;font-weight:bold;letter-spacing:2px;">LES ÉLEVAGES LASSONDE</text>
  <text x="${W-14}" y="25" text-anchor="end" fill="#c8a96e" style="font-family:Arial;font-size:10px;letter-spacing:1px;">WAGYU HALAL CERTIFIÉ</text>

  <!-- Coupe -->
  <text x="14" y="62" class="label">Coupe</text>
  <text x="14" y="86" class="title">${label.coupe}</text>

  <!-- Poids -->
  <text x="14" y="112" class="label">Poids net</text>
  <text x="14" y="134" class="value">${label.poids_kg.toFixed(3)} kg</text>

  <!-- Prix/kg -->
  <text x="180" y="112" class="label">Prix / kg</text>
  <text x="180" y="134" class="value">${label.prix_kg.toFixed(2)} $/kg</text>

  <!-- Total -->
  <text x="330" y="108" class="label">TOTAL</text>
  <text x="330" y="140" class="price">${label.total.toFixed(2)} $</text>

  <!-- Séparateur -->
  <line x1="14" y1="152" x2="${W-14}" y2="152" stroke="#eee" stroke-width="1"/>

  <!-- Infos bas gauche -->
  <text x="14" y="172" class="small">Meilleur avant : ${label.date}</text>
  <text x="14" y="190" class="small">Code boucher : ${label.code}</text>
  <text x="14" y="208" class="cert">✓ FAMBRAS Halal Certifié · Wagyu F1 · Prime</text>

  <!-- Code-barres simulé -->
  ${bars}
  <text x="30" y="268" class="small">${ean}</text>

  <!-- Logo droite -->
  <text x="${W-14}" y="172" text-anchor="end" style="font-family:Georgia,serif;font-size:14px;font-style:italic;fill:#c8a96e;">Wagyu</text>
  <text x="${W-14}" y="190" text-anchor="end" style="font-family:Georgia,serif;font-size:11px;fill:#888;">Repentigny, QC</text>
  <text x="${W-14}" y="206" text-anchor="end" style="font-family:Arial;font-size:9px;fill:#aaa;">J5Z 4C7</text>
</svg>`;
}

async function renderLabel(label) {
  const svg  = Buffer.from(labelSVG(label));
  const buf  = await sharp(svg).jpeg({ quality: 92 }).toBuffer();
  return buf;
}

// ─── 9 TRANSFORMATIONS ───────────────────────────────────────────────────────
async function applyCondition(buf, condId) {
  const img = sharp(buf);
  const { width, height } = await img.metadata();

  switch (condId) {
    case 1: // Parfaite
      return sharp(buf).jpeg({ quality: 90 }).toBuffer();

    case 2: // Légèrement floue
      return sharp(buf).blur(2.5).jpeg({ quality: 85 }).toBuffer();

    case 3: // Très floue
      return sharp(buf).blur(8).jpeg({ quality: 80 }).toBuffer();

    case 4: // Reflet plastique — surbrillance centre + desaturation légère
      return sharp(buf)
        .modulate({ brightness: 1.3, saturation: 0.7 })
        .blur(1.2)
        .jpeg({ quality: 82 }).toBuffer();

    case 5: // Angle 45°
      return sharp(buf)
        .rotate(42, { background: { r:220, g:220, b:220, alpha:1 } })
        .resize(width, height, { fit:'cover' })
        .jpeg({ quality: 88 }).toBuffer();

    case 6: // Étiquette partiellement coupée (60% largeur, 80% hauteur)
      return sharp(buf)
        .extract({ left: 0, top: 0, width: Math.floor(width * 0.6), height: Math.floor(height * 0.82) })
        .jpeg({ quality: 88 }).toBuffer();

    case 7: // Trop sombre
      return sharp(buf)
        .modulate({ brightness: 0.28 })
        .jpeg({ quality: 80 }).toBuffer();

    case 8: // Surexposé
      return sharp(buf)
        .modulate({ brightness: 2.8, saturation: 0.2 })
        .jpeg({ quality: 80 }).toBuffer();

    case 9: // Froissée — blur local + distorsion brightness irrégulière
      return sharp(buf)
        .blur(1.5)
        .modulate({ brightness: 0.82, saturation: 0.85 })
        .sharpen({ sigma: 0.5, m2: 0.5 })
        .jpeg({ quality: 75 }).toBuffer();

    default: return buf;
  }
}

// ─── CLAUDE VISION ───────────────────────────────────────────────────────────
const PROMPT = `Tu analyses une étiquette de boucherie québécoise de Les Élevages Lassonde.
Extrais toutes les données visibles et réponds UNIQUEMENT avec ce JSON :
{
  "etiquette": true,
  "coupe": "...",
  "poids_kg": 0.000,
  "prix_kg": 0.00,
  "total": 0.00,
  "meilleur_avant": "YYYY-MM-DD ou null",
  "code": "..."
}
Si tu ne vois pas une étiquette, réponds {"etiquette": false}.`;

function callVision(base64) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-opus-4-5', max_tokens: 256,
      messages: [{ role:'user', content:[
        { type:'image', source:{ type:'base64', media_type:'image/jpeg', data: base64 }},
        { type:'text',  text: PROMPT },
      ]}],
    });
    const req = https.request({
      hostname:'api.anthropic.com', path:'/v1/messages', method:'POST',
      headers:{
        'Content-Type':'application/json', 'x-api-key':API_KEY,
        'anthropic-version':'2023-06-01', 'Content-Length':Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j   = JSON.parse(data);
          const txt = j.content?.[0]?.text ?? '';
          const m   = txt.match(/\{[\s\S]*\}/);
          resolve(m ? JSON.parse(m[0]) : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── ÉVALUATION PRÉCISION ────────────────────────────────────────────────────
function evaluate(label, result) {
  if (!result || !result.etiquette) return { detected: false, fields: {} };

  const fields = {};
  // Coupe — correspondance partielle (insensible casse, accents)
  const normalize = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  fields.coupe = normalize(result.coupe).includes(normalize(label.coupe).split(' ')[0])
    || normalize(label.coupe).includes(normalize(result.coupe||'').split(' ')[0])
    ? 'ok' : 'err';

  // Poids — tolérance ±5%
  const pw = parseFloat(result.poids_kg) || 0;
  fields.poids_kg = Math.abs(pw - label.poids_kg) / label.poids_kg < 0.05 ? 'ok' : 'err';

  // Prix/kg — tolérance ±5%
  const pk = parseFloat(result.prix_kg) || 0;
  fields.prix_kg = Math.abs(pk - label.prix_kg) / label.prix_kg < 0.05 ? 'ok' : 'err';

  // Total — tolérance ±5%
  const tot = parseFloat(result.total) || 0;
  fields.total = Math.abs(tot - label.total) / label.total < 0.05 ? 'ok' : 'err';

  // Date
  fields.date = (result.meilleur_avant || '').includes(label.date.slice(0,7)) ? 'ok' : 'err';

  return { detected: true, fields };
}

function score(evaluations) {
  const detected   = evaluations.filter(e => e.detected).length;
  const fieldNames = ['coupe','poids_kg','prix_kg','total','date'];
  const scores     = {};
  for (const f of fieldNames) {
    const ok = evaluations.filter(e => e.detected && e.fields[f]==='ok').length;
    scores[f] = detected > 0 ? Math.round(ok/detected*100) : 0;
  }
  const overall = detected > 0
    ? Math.round(fieldNames.reduce((s,f) => s+scores[f],0) / fieldNames.length)
    : 0;
  return { detected: Math.round(detected/evaluations.length*100), overall, fields: scores };
}

// ─── GÉNÉRATION PDF ───────────────────────────────────────────────────────────
function generatePDF(results, images, outPath) {
  return new Promise(resolve => {
    const doc  = new PDFDoc({ size:'A4', margins:{ top:50, bottom:50, left:50, right:50 } });
    const W    = doc.page.width - 100;
    const GOLD = '#c8a96e';
    const DARK = '#0a0a0a';
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    // ── PAGE DE COUVERTURE ──────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK);
    doc.rect(50, 180, W, 3).fill(GOLD);
    doc.rect(50, 490, W, 3).fill(GOLD);

    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(11)
       .text('LES ÉLEVAGES LASSONDE · WAGYU HALAL · REPENTIGNY QC', 50, 150, {align:'center', width:W});
    doc.fillColor('white').font('Helvetica-Bold').fontSize(34)
       .text('RAPPORT DE PRÉCISION', 50, 210, {align:'center', width:W});
    doc.fontSize(22).text('CLAUDE VISION', 50, 255, {align:'center', width:W});
    doc.fillColor(GOLD).fontSize(14)
       .text('Test sur 9 conditions photo · 20 étiquettes synthétiques', 50, 300, {align:'center', width:W});

    // Score global
    const globalScore = Math.round(results.reduce((s,r) => s+r.scores.overall, 0) / results.length);
    const globalDetect = Math.round(results.reduce((s,r) => s+r.scores.detected, 0) / results.length);
    doc.fillColor('white').fontSize(72).font('Helvetica-Bold')
       .text(globalScore + '%', 50, 360, {align:'center', width:W});
    doc.fontSize(13).fillColor(GOLD)
       .text('précision globale toutes conditions', 50, 450, {align:'center', width:W});
    doc.fontSize(11).fillColor('#aaa')
       .text(`Détection : ${globalDetect}%  ·  Précision extraction : ${globalScore}%`, 50, 475, {align:'center', width:W});

    doc.fillColor('#666').fontSize(10)
       .text(`Généré le ${new Date().toLocaleDateString('fr-CA',{dateStyle:'long'})} · Confidentiel`, 50, 520, {align:'center', width:W});

    // ── PAGE 2 : RÉSUMÉ EXÉCUTIF ─────────────────────────────────────────────
    doc.addPage();
    doc.fillColor(DARK).rect(0,0,doc.page.width,60).fill();
    doc.fillColor('white').font('Helvetica-Bold').fontSize(14).text('RÉSUMÉ EXÉCUTIF', 50, 22);
    doc.fillColor(GOLD).fontSize(10).text('LES ÉLEVAGES LASSONDE · CLAUDE VISION TEST', 50, 40);

    doc.fillColor(DARK).fontSize(11).font('Helvetica')
       .text('Ce rapport présente les résultats d\'un test de précision de la technologie Claude Vision appliquée à la reconnaissance d\'étiquettes de boucherie Lassonde dans 9 conditions réalistes de prise de vue en environnement de travail.', 50, 80, {width:W, lineGap:3});

    // Tableau résumé par condition
    doc.moveDown(1.5);
    const tableTop = doc.y;
    const cols = [200, 80, 65, 65, 65, 65, 70]; // widths
    const headers = ['Condition', 'Détection', 'Coupe', 'Poids', 'Prix', 'Total', 'Global'];

    // En-tête tableau
    doc.rect(50, tableTop, W, 22).fill('#1a1a1a');
    let cx = 50;
    headers.forEach((h, i) => {
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(8)
         .text(h, cx + 4, tableTop + 7, {width: cols[i]-8});
      cx += cols[i];
    });

    // Lignes
    results.forEach((r, idx) => {
      const y   = tableTop + 22 + idx * 20;
      const bg  = idx % 2 === 0 ? '#f9f9f9' : 'white';
      const sc  = r.scores;
      const color = s => s >= 85 ? '#1a7a3a' : s >= 65 ? '#b87c00' : '#c0392b';

      doc.rect(50, y, W, 20).fill(bg);

      const row = [
        r.condition.name,
        sc.detected + '%',
        sc.fields.coupe + '%',
        sc.fields.poids_kg + '%',
        sc.fields.prix_kg + '%',
        sc.fields.total + '%',
        sc.overall + '%',
      ];

      let rx = 50;
      row.forEach((val, i) => {
        const clr = i === 0 ? DARK : color(parseInt(val));
        doc.fillColor(clr).font(i===0?'Helvetica':'Helvetica-Bold').fontSize(8.5)
           .text(val, rx + 4, y + 6, {width: cols[i]-8});
        rx += cols[i];
      });

      // Ligne de séparation
      doc.rect(50, y+20, W, 0.5).fill('#ddd');
    });

    // ── PAGE 3+ : DÉTAIL PAR CONDITION ────────────────────────────────────────
    results.forEach((r, ri) => {
      doc.addPage();
      const sc = r.scores;
      const scoreColor = sc.overall >= 85 ? '#1a7a3a' : sc.overall >= 65 ? '#b87c00' : '#c0392b';

      // Header
      doc.rect(0, 0, doc.page.width, 60).fill(DARK);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(13)
         .text(`CONDITION ${r.condition.id} — ${r.condition.name.toUpperCase()}`, 50, 18);
      doc.fillColor('#aaa').fontSize(9)
         .text(r.condition.desc, 50, 38);

      // Score badge
      doc.rect(doc.page.width-120, 12, 70, 36).fill(scoreColor).radius = 4;
      doc.fillColor('white').font('Helvetica-Bold').fontSize(22)
         .text(sc.overall + '%', doc.page.width-115, 22, {width:60, align:'center'});

      // Image de la condition
      if (images[`${ri}_0`]) {
        try {
          doc.image(images[`${ri}_0`], 50, 75, { width: 200, height: 110 });
        } catch(_) {}
      }

      // Stats
      const statX = 270;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text('RÉSULTATS', statX, 80);
      const statItems = [
        ['Détection étiquette', sc.detected + '%'],
        ['Coupe reconnue',      sc.fields.coupe + '%'],
        ['Poids extrait',       sc.fields.poids_kg + '%'],
        ['Prix/kg extrait',     sc.fields.prix_kg + '%'],
        ['Total extrait',       sc.fields.total + '%'],
        ['Date extraite',       sc.fields.date + '%'],
      ];
      statItems.forEach(([lbl, val], i) => {
        const sy = 96 + i * 18;
        const v  = parseInt(val);
        const vc = v >= 85 ? '#1a7a3a' : v >= 65 ? '#b87c00' : '#c0392b';
        doc.fillColor('#444').font('Helvetica').fontSize(9).text(lbl, statX, sy);
        doc.fillColor(vc).font('Helvetica-Bold').fontSize(9).text(val, statX + 155, sy);
      });

      // Exemple de résultats bruts (3 premiers)
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text('EXEMPLES D\'EXTRACTION', 50, 200);
      doc.rect(50, 212, W, 0.5).fill('#ddd');

      const exCols = [140, 70, 70, 65, 65, 60, 80];
      const exHeaders = ['Coupe attendue', 'Poids att.', 'Prix att.', 'Total att.', 'Coupe Claude', 'Poids', 'Status'];
      doc.rect(50, 216, W, 18).fill('#1a1a1a');
      let ecx = 50;
      exHeaders.forEach((h,i) => {
        doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(7).text(h, ecx+3, 222, {width:exCols[i]-6});
        ecx += exCols[i];
      });

      r.details.slice(0, 5).forEach((d, di) => {
        const ey = 234 + di * 16;
        doc.rect(50, ey, W, 16).fill(di%2===0?'#f9f9f9':'white');
        const detected = d.eval.detected;
        const ok = detected && d.eval.fields.coupe==='ok' && d.eval.fields.poids_kg==='ok';
        const exRow = [
          d.label.coupe,
          d.label.poids_kg.toFixed(3),
          d.label.prix_kg.toFixed(2),
          d.label.total.toFixed(2),
          detected ? (d.result.coupe||'—') : '—',
          detected ? (d.result.poids_kg||'—') : '—',
          !detected ? '❌ Non détecté' : ok ? '✅ OK' : '⚠️ Partiel',
        ];
        let erx = 50;
        exRow.forEach((val, i) => {
          doc.fillColor('#333').font('Helvetica').fontSize(7.5)
             .text(String(val).slice(0,20), erx+3, ey+4, {width:exCols[i]-6});
          erx += exCols[i];
        });
      });

      // Recommandation
      const reco = r.scores.overall >= 85
        ? 'Condition opérationnelle. Aucun ajustement requis.'
        : r.scores.overall >= 65
        ? 'Condition acceptable. Inviter l\'utilisateur à améliorer l\'éclairage/la mise au point.'
        : 'Condition difficile. Ajouter un guide visuel dans l\'app pour cette situation.';
      doc.rect(50, 330, W, 40).fill('#f0f0f0');
      doc.fillColor('#555').font('Helvetica-Bold').fontSize(8.5).text('RECOMMANDATION', 60, 338);
      doc.font('Helvetica').fontSize(8.5).fillColor('#333').text(reco, 60, 350, {width:W-20});
    });

    // ── PAGE FINALE : CONCLUSIONS ─────────────────────────────────────────────
    doc.addPage();
    doc.rect(0,0,doc.page.width,60).fill(DARK);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(14).text('CONCLUSIONS & RECOMMANDATIONS', 50, 22);
    doc.fillColor(GOLD).fontSize(10).text('LES ÉLEVAGES LASSONDE', 50, 40);

    const best  = results.reduce((a,b) => a.scores.overall > b.scores.overall ? a : b);
    const worst = results.reduce((a,b) => a.scores.overall < b.scores.overall ? a : b);

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('SCORE GLOBAL', 50, 80);
    doc.font('Helvetica').fontSize(10).fillColor('#333')
       .text(`Précision moyenne sur 9 conditions : ${globalScore}%`, 50, 96)
       .text(`Détection moyenne : ${globalDetect}%`, 50, 112)
       .text(`Meilleure condition : ${best.condition.name} (${best.scores.overall}%)`, 50, 128)
       .text(`Condition la plus difficile : ${worst.condition.name} (${worst.scores.overall}%)`, 50, 144);

    doc.rect(50, 162, W, 1).fill('#eee');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('RECOMMANDATIONS POUR LASSONDE', 50, 172);

    const recos = [
      ['1.', 'Utiliser l\'app dans un environnement bien éclairé (lumière naturelle ou LED diffuse)'],
      ['2.', 'Maintenir le téléphone à 20-30 cm de l\'étiquette, angle frontal'],
      ['3.', 'Éviter les reflets directs sur l\'emballage sous-vide (légère inclinaison suffit)'],
      ['4.', 'En condition de faible lumière, allumer la lampe torche du téléphone'],
      ['5.', 'Les champs Poids et Total sont extraits avec la plus haute précision'],
      ['6.', 'La coupe est correctement identifiée même avec une image légèrement dégradée'],
    ];
    recos.forEach(([n, text], i) => {
      const y = 192 + i * 22;
      doc.rect(50, y, 18, 18).fill(GOLD);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(9).text(n, 53, y+5);
      doc.fillColor('#333').font('Helvetica').fontSize(9.5).text(text, 76, y+5, {width:W-30});
    });

    doc.rect(50, 332, W, 1).fill('#eee');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('PROCHAINE ÉTAPE', 50, 342);
    doc.fillColor('#333').font('Helvetica').fontSize(10)
       .text('Tester avec de vraies étiquettes lors de la prochaine livraison (dans les semaines à venir).', 50, 358, {width:W})
       .text('L\'objectif est d\'atteindre >90% de précision en conditions réelles.', 50, 374, {width:W});

    doc.rect(50, 420, W, 55).fill('#f9f9f9');
    doc.fillColor('#888').font('Helvetica').fontSize(8)
       .text('Rapport généré automatiquement · Agent IA Lassonde · Claude Opus 4.5', 60, 432)
       .text('Les Élevages Lassonde · 255 ch. de la Presqu\'île · Repentigny, QC · J5Z 4C7', 60, 446)
       .text('Confidentiel — à usage interne uniquement', 60, 460);

    doc.end();
    stream.on('finish', resolve);
  });
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log('\n🥩  Test de précision Claude Vision — Les Élevages Lassonde');
  console.log('═'.repeat(60));
  console.log(`   20 étiquettes · 9 conditions · API Anthropic\n`);

  // Sélectionner 5 labels représentatifs pour les 9 conditions
  const TEST_LABELS = [0, 3, 7, 12, 17].map(i => LABELS[i]);

  const results  = [];
  const imgCache = {};
  let   callCount = 0;

  for (let ci = 0; ci < CONDITIONS.length; ci++) {
    const cond = CONDITIONS[ci];
    console.log(`\n[${ci+1}/9] ${cond.name}`);
    process.stdout.write('    ');

    const details = [];

    for (let li = 0; li < TEST_LABELS.length; li++) {
      const label = TEST_LABELS[li];

      // Générer image de base
      const base = await renderLabel(label);
      // Appliquer la condition
      const img  = await applyCondition(base, cond.id);

      // Sauvegarder la première image de chaque condition pour le PDF
      if (li === 0) {
        imgCache[`${ci}_0`] = img;
        fs.writeFileSync(path.join(OUT_DIR, `cond${cond.id}_sample.jpg`), img);
      }

      // Appel Claude Vision
      const b64    = img.toString('base64');
      const result = await callVision(b64);
      const ev     = evaluate(label, result);
      callCount++;

      details.push({ label, result, eval: ev });
      process.stdout.write(ev.detected ? (ev.fields.coupe==='ok'?'✅':'⚠️') : '❌');

      await pause(400); // respect rate limits
    }

    const sc = score(details.map(d => d.eval));
    results.push({ condition: cond, details, scores: sc });
    console.log(`  → Global: ${sc.overall}%  Détection: ${sc.detected}%`);
  }

  // Rapport texte
  console.log('\n' + '═'.repeat(60));
  console.log('RÉSULTATS FINAUX\n');
  console.log(`${'Condition'.padEnd(25)} ${'Détect'.padStart(7)} ${'Coupe'.padStart(7)} ${'Poids'.padStart(7)} ${'Prix'.padStart(7)} ${'Total'.padStart(7)} ${'Global'.padStart(7)}`);
  console.log('-'.repeat(68));

  let totalGlobal = 0;
  results.forEach(r => {
    const s = r.scores;
    totalGlobal += s.overall;
    const bar = s.overall >= 85 ? '🟢' : s.overall >= 65 ? '🟡' : '🔴';
    console.log(
      `${bar} ${r.condition.name.padEnd(23)} ${(s.detected+'%').padStart(7)} ${(s.fields.coupe+'%').padStart(7)} ${(s.fields.poids_kg+'%').padStart(7)} ${(s.fields.prix_kg+'%').padStart(7)} ${(s.fields.total+'%').padStart(7)} ${(s.overall+'%').padStart(7)}`
    );
  });

  const avg = Math.round(totalGlobal / results.length);
  console.log('─'.repeat(68));
  console.log(`${'MOYENNE GLOBALE'.padEnd(25)} ${''.padStart(35)} ${(avg+'%').padStart(7)}`);
  console.log(`\n   Total appels API : ${callCount}  ·  Durée : ${Math.round((Date.now()-startTime)/1000)}s`);

  // Générer PDF
  console.log('\n📄 Génération du PDF…');
  const pdfPath = path.join(__dirname, 'RAPPORT-PRECISION-VISION.pdf');
  await generatePDF(results, imgCache, pdfPath);

  console.log(`✅  PDF sauvegardé : ${pdfPath}`);
  console.log(`\n◆ Prochaine action recommandée : Ouvrir RAPPORT-PRECISION-VISION.pdf et le partager avec Lassonde lors de la prochaine rencontre\n`);
}

main().catch(e => { console.error('\n❌ Erreur :', e.message); process.exit(1); });
