#!/usr/bin/env node
// backup-prod.js — Sauvegarde TOUS les sacs de la prod (contourne la limite 200
// en récupérant coupe par coupe), pour ne rien perdre avant un déploiement.
'use strict';
const fs = require('fs');
const URL = 'https://lassonde-app-production.up.railway.app';

async function jget(path) {
  const r = await fetch(URL + path);
  return r.json();
}

async function run() {
  // 1. Liste des coupes depuis le résumé (non limité)
  const resume = await jget('/api/inventaire/resume');
  console.log(`Total en base : ${resume.total_sacs} sacs`);
  const coupes = [...new Set((resume.par_coupe || []).map(c => c.coupe))];
  console.log(`Coupes distinctes : ${coupes.length}`);

  // 2. Récupère les sacs coupe par coupe (chaque coupe < 200), dédoublonne par id
  const parId = new Map();
  for (const coupe of coupes) {
    const d = await jget(`/api/inventaire?coupe=${encodeURIComponent(coupe)}`);
    for (const it of (d.items || [])) parId.set(it.id, it);
    process.stdout.write(`  ${coupe} : ${(d.items || []).length} · cumul ${parId.size}\n`);
    await new Promise(r => setTimeout(r, 120));
  }

  const tous = [...parId.values()];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `/Users/adamo/Desktop/CLAUDE/backup-prod-${stamp}.json`;
  fs.writeFileSync(file, JSON.stringify(tous, null, 2));

  const valeur = tous.reduce((s, i) => s + (i.prix_total || 0), 0);
  console.log(`\n✅ Sauvegarde : ${tous.length} sacs · ${valeur.toFixed(2)} $`);
  console.log(`   Fichier : ${file}`);
  if (tous.length < resume.total_sacs) {
    console.log(`⚠️  ${resume.total_sacs - tous.length} sacs non récupérés (limite par coupe ?) — à vérifier`);
  } else {
    console.log(`   Tous les sacs récupérés ✅`);
  }
}
run().catch(e => { console.error('ERREUR backup:', e.message); process.exit(1); });
