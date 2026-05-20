#!/usr/bin/env node
// agent.js — Agent CLI intelligent Lassonde v2
// Lance avec : node agent.js
require('dotenv').config();

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');

const BRAIN_PATH    = path.join(__dirname, 'BRAIN.md');
const CLAUDE_MODEL  = 'claude-opus-4-5';
let   dbModule      = null;
try   { dbModule = require('./database'); } catch (_) {}
const API_KEY       = process.env.ANTHROPIC_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL    || 'lassonde-wagyu-test.myshopify.com';
const SHOPIFY_VER   = process.env.SHOPIFY_API_VERSION  || '2026-04';

if (!API_KEY) {
  console.error('\n❌  ANTHROPIC_API_KEY manquante dans .env\n');
  process.exit(1);
}

// ─── Couleurs terminal ────────────────────────────────────────────────────────
const c = {
  gold:  s => `\x1b[33m${s}\x1b[0m`,
  grey:  s => `\x1b[90m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

// ─── BRAIN.md ─────────────────────────────────────────────────────────────────
function readBrain() {
  try   { return fs.readFileSync(BRAIN_PATH, 'utf8'); }
  catch { console.error(c.red('❌  BRAIN.md introuvable dans ' + __dirname)); process.exit(1); }
}

function saveBrain(content) {
  // Met à jour la date dans l'en-tête
  const today = new Date().toLocaleDateString('fr-CA', { year:'numeric', month:'long', day:'numeric' });
  content = content.replace(/Dernière mise à jour : .+/, `Dernière mise à jour : ${today}`);
  fs.writeFileSync(BRAIN_PATH, content, 'utf8');
}

function appendChangelog(brain, entry) {
  const ts      = new Date().toLocaleString('fr-CA', { dateStyle:'short', timeStyle:'short' });
  const logLine = `- ${ts} — ${entry}`;
  const marker  = '## CHANGELOG';

  if (brain.includes(marker)) {
    // Insère après la ligne du marker
    return brain.replace(marker + '\n', marker + '\n' + logLine + '\n');
  } else {
    // Crée la section en bas
    return brain.trimEnd() + '\n\n## CHANGELOG\n' + logLine + '\n';
  }
}

// ─── API Anthropic ────────────────────────────────────────────────────────────
function claude(messages, system, maxTokens = 1024) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages });
    const req  = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error(j.error.message));
          resolve(j.content[0]?.text ?? '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// ─── Shopify (pour commande statut) ──────────────────────────────────────────
function shopifyGQL(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req  = https.request({
      hostname: SHOPIFY_STORE, path: `/admin/api/${SHOPIFY_VER}/graphql.json`, method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ─── Classification d'intention ───────────────────────────────────────────────
// Retourne : { type: 'update'|'question'|'command', command, newFact }
async function classifyIntent(input, brain) {
  const system = `Tu analyses une phrase en entrée et tu retournes UNIQUEMENT du JSON valide, rien d'autre.

Schéma :
{
  "type": "update" | "question" | "command",
  "command": null | "prochaine étape" | "résumé" | "pitch" | "questions" | "statut",
  "newFact": null | "le fait extrait mot pour mot"
}

Règles :
- "update" = l'utilisateur énonce un fait nouveau ou une correction de donnée (nom, date, chiffre, info)
- "question" = l'utilisateur demande quelque chose, veut une explication ou un conseil
- "command" = l'utilisateur utilise un mot-clé : prochaine étape, résumé, pitch, questions, statut
- Pour "update", extrais "newFact" = la donnée brute sans fioritures
- Exemples update : "Le boucher s'appelle Michel", "Prix élevage : 4000$", "livraison le 3 juin", "Lassonde a 8 bœufs"
- Exemples question : "qui est le boucher?", "quelle est notre marge?", "comment on vend?"`;

  const text = await claude([{ role:'user', content: input }], system, 256);
  return parseJSON(text) ?? { type:'question', command:null, newFact:null };
}

// ─── Détection de contradiction ───────────────────────────────────────────────
async function checkContradiction(newFact, brain) {
  const system = `Tu analyses si une nouvelle information contredit quelque chose dans BRAIN.md.
Réponds UNIQUEMENT en JSON :
{
  "contradiction": true | false,
  "existing": "citation exacte du texte existant qui contredit",
  "section": "nom de la section concernée"
}
Si pas de contradiction, retourne { "contradiction": false, "existing": null, "section": null }`;

  const text = await claude([{
    role: 'user',
    content: `BRAIN.md :\n${brain}\n\nNouvelle information : "${newFact}"\n\nY a-t-il contradiction?`,
  }], system, 256);
  return parseJSON(text) ?? { contradiction:false, existing:null, section:null };
}

// ─── Mise à jour BRAIN.md ─────────────────────────────────────────────────────
async function updateBrain(newFact, brain) {
  const system = `Tu es un éditeur de document Markdown.
Tu reçois BRAIN.md et un fait à intégrer.
Tu retournes UNIQUEMENT du JSON :
{
  "updatedBrain": "le contenu complet mis à jour de BRAIN.md",
  "section": "nom exact de la section modifiée",
  "change": "description courte du changement (max 80 chars)"
}
Règles :
- Intègre le fait dans la section la plus pertinente
- Si la section n'existe pas, crée-la
- Ne perds aucune information existante sauf ce qui est explicitement remplacé
- Ne change pas la structure générale du document
- "change" doit être informatif : ce qui était avant → ce qui est maintenant`;

  const text = await claude([{
    role: 'user',
    content: `BRAIN.md actuel :\n${brain}\n\nFait à intégrer : "${newFact}"`,
  }], system, 4096);

  const result = parseJSON(text);
  if (!result?.updatedBrain) throw new Error('Réponse malformée de Claude');
  return result;
}

// ─── Snapshot base de données pour le contexte ───────────────────────────────
function dbSnapshot() {
  if (!dbModule) return '(base de données non disponible)';
  try {
    const d = dbModule.getDashboard();
    const r = d.resume;
    const lines = [
      `INVENTAIRE LOCAL (${r.total_sacs} sacs · ${r.valeur_totale || 0}$ en stock) :`,
    ];
    if (d.top_coupes?.length) {
      lines.push('Top coupes disponibles :');
      d.top_coupes.forEach(c => lines.push(`  - ${c.coupe}: ${c.nb} sac(s) · ${c.valeur}$`));
    }
    if (r.par_statut?.length) {
      lines.push('Par statut : ' + r.par_statut.map(s => `${s.statut}=${s.nb}`).join(', '));
    }
    if (d.betes?.length) {
      lines.push('Bêtes :');
      d.betes.forEach(b => lines.push(`  - Bête #${b.numero_bete}: ${b.nb_sacs_scannés||0} sacs · marge ${b.marge_nette||'?'}$`));
    }
    if (d.prix_marche?.length) {
      lines.push('Prix marché référence :');
      d.prix_marche.slice(0, 5).forEach(p => lines.push(`  - ${p.coupe} (${p.concurrent}): ${p.prix_kg}$/kg`));
    }
    return lines.join('\n');
  } catch (e) {
    return '(erreur lecture DB: ' + e.message + ')';
  }
}

// ─── Réponse à une question ───────────────────────────────────────────────────
const chatHistory = [];

async function answerQuestion(input, brain) {
  const snap = dbSnapshot();
  const system = `Tu es l'agent IA stratégique du projet Lassonde Wagyu Halal.
Tu connais tout le projet via BRAIN.md et la base de données locale en temps réel.
Tu réponds en français québécois, direct, sans bullshit.
Sois concis mais complet. Utilise des listes quand c'est plus clair.

RÈGLE ABSOLUE : termine TOUJOURS par une ligne vide puis :
"Prochaine action recommandée : [action concrète et spécifique]"

${snap}

BRAIN.md :
${brain}`;

  chatHistory.push({ role:'user', content:input });
  const reply = await claude(chatHistory, system, 1024);
  chatHistory.push({ role:'assistant', content:reply });
  if (chatHistory.length > 20) chatHistory.splice(0, 2);
  return reply;
}

// ─── Commandes spéciales ──────────────────────────────────────────────────────
async function cmdNextStep(brain) {
  const system = `Tu analyses BRAIN.md et retournes uniquement la prochaine action PRIORITAIRE.
Format :
🎯 PROCHAINE ACTION : [action en 1 ligne]
Pourquoi maintenant : [1-2 phrases max]
Qui fait quoi : [assignation]

Termine par : "Prochaine action recommandée : [même action]"`;
  return claude([{ role:'user', content:`BRAIN.md :\n${brain}\n\nQuelle est la prochaine étape?` }], system, 512);
}

async function cmdSummary(brain) {
  const system = `Tu résumes BRAIN.md en exactement 5 points bullet concis.
Format :
• [point 1]
• [point 2]
• [point 3]
• [point 4]
• [point 5]

Termine par : "Prochaine action recommandée : [action]"`;
  return claude([{ role:'user', content:`BRAIN.md :\n${brain}` }], system, 512);
}

async function cmdPitch(brain) {
  const system = `Tu extrais le pitch reformulé post-visite depuis BRAIN.md et tu l'affiches tel quel.
Ajoute ensuite 2-3 points forts à mettre en avant lors du prochain contact.
Termine par : "Prochaine action recommandée : [action]"`;
  return claude([{ role:'user', content:`BRAIN.md :\n${brain}` }], system, 512);
}

async function cmdQuestions(brain) {
  const system = `Tu extrais les questions à clarifier depuis BRAIN.md.
Ajoute une colonne de priorité (🔴 critique / 🟡 important / 🟢 nice-to-have).
Termine par : "Prochaine action recommandée : [action]"`;
  return claude([{ role:'user', content:`BRAIN.md :\n${brain}` }], system, 512);
}

async function cmdStatus(brain) {
  // Statut local depuis BRAIN.md
  const sys = `Génère un tableau de bord statut du projet depuis BRAIN.md.
Inclus : état app (fonctionnel/en dev), store Shopify, prochaines étapes, timing.
Format propre avec émojis. Max 20 lignes.
Termine par : "Prochaine action recommandée : [action]"`;
  const brainStatus = claude([{ role:'user', content:`BRAIN.md :\n${brain}` }], sys, 512);

  // Statut Shopify live (optionnel)
  let shopifyLine = c.grey('  Shopify : vérification…');
  try {
    const d = await shopifyGQL('{ productsCount { count } shop { name } }');
    const count = d?.data?.productsCount?.count ?? '?';
    const name  = d?.data?.shop?.name ?? SHOPIFY_STORE;
    shopifyLine = c.green(`  Shopify : ✅ ${name} — ${count} produits actifs`);
  } catch {
    shopifyLine = c.grey('  Shopify : non vérifiable depuis CLI');
  }

  const text = await brainStatus;
  return shopifyLine + '\n\n' + text;
}

async function cmdHelp() {
  return `${c.bold('Commandes disponibles :')}

  ${c.gold('prochaine étape')}  — action prioritaire maintenant
  ${c.gold('résumé')}           — projet en 5 points
  ${c.gold('pitch')}            — pitch complet post-visite
  ${c.gold('questions')}        — liste des questions à poser à Lassonde
  ${c.gold('statut')}           — état de l'app et du store Shopify

${c.bold('Mise à jour automatique :')}
  Dis simplement le fait nouveau — l'agent l'intègre dans BRAIN.md :
  ${c.grey('"Le boucher s\'appelle Michel Tremblay"')}
  ${c.grey('"Prochaine livraison le 3 juin"')}
  ${c.grey('"Lassonde a 8 bœufs par année"')}

  ${c.gold('mise à jour : [info]')}  — forcer une mise à jour

${c.bold('Autre :')}
  ${c.gold('exit')} / ${c.gold('quit')}  — quitter`;
}

// ─── Affichage ────────────────────────────────────────────────────────────────
function printReply(text) {
  console.log();
  for (const line of text.split('\n')) {
    if (/^Prochaine action recommandée/i.test(line)) {
      console.log(c.gold('◆ ' + line));
    } else {
      console.log(line);
    }
  }
  console.log();
}

// ─── Normalisation commandes ──────────────────────────────────────────────────
function normalizeCommand(input) {
  const normalized = input.trim().toLowerCase()
    .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a').replace(/[îï]/g, 'i').replace(/[ô]/g, 'o').replace(/[ù]/g, 'u');
  if (/^(prochaine.?etape|next.?step)/.test(normalized)) return 'prochaine étape';
  if (/^(resum[e]?|summary)/.test(normalized))           return 'résumé';
  if (/^pitch/.test(normalized))                          return 'pitch';
  if (/^(questions?|clarif)/.test(normalized))            return 'questions';
  if (/^(statut|status|etat)/.test(normalized))           return 'statut';
  if (/^(aide|help|\?)/.test(normalized))                 return 'aide';
  return null;
}

function forcedUpdate(input) {
  return /^(mise.?à.?jour|mets?.?à.?jour|update|modifi|corrig|ajout|supprim|enlev)\s*:/i.test(input.trim());
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + c.gold('🥩  Agent Lassonde — Intelligence Stratégique v2'));
  console.log(c.grey('    Lecture de BRAIN.md…'));

  let brain = readBrain();
  const lines = brain.split('\n').length;
  console.log(c.grey(`    BRAIN.md chargé — ${lines} lignes`));
  console.log(c.grey('    Tape ta question, un fait nouveau, ou "aide" pour les commandes.\n'));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: c.gold('> ') });
  rl.prompt();

  // État pour la confirmation de contradiction
  let pendingConfirm = null;

  rl.on('line', async rawInput => {
    const input = rawInput.trim();
    if (!input) { rl.prompt(); return; }
    if (/^(exit|quit)$/i.test(input)) { console.log(c.grey('\nAgent arrêté.\n')); process.exit(0); }

    rl.pause();

    try {
      // ── Confirmation de contradiction en attente ──────────────────────────
      if (pendingConfirm) {
        const confirm = pendingConfirm;
        pendingConfirm = null;

        if (/^(o|oui|y|yes)$/i.test(input)) {
          process.stdout.write(c.grey('🔄  Mise à jour forcée…\n'));
          const result = await updateBrain(confirm.newFact, brain);
          const withLog = appendChangelog(result.updatedBrain, `[${result.section}] ${result.change}`);
          saveBrain(withLog);
          brain = readBrain();
          console.log(c.green(`✅  BRAIN.md mis à jour — section "${result.section}" modifiée`));
          console.log(c.grey(`    → ${result.change}`));
          console.log(c.gold('\nProchaine action recommandée : Vérifier que la modification est correcte avec "résumé"'));
        } else {
          console.log(c.grey('⏭️   Modification annulée — BRAIN.md inchangé'));
        }
        console.log();
        rl.resume();
        rl.prompt();
        return;
      }

      // ── Commandes directes ────────────────────────────────────────────────
      const cmd = normalizeCommand(input);
      if (cmd) {
        process.stdout.write(c.grey(`⚡  Commande : ${cmd}…\n`));
        let reply;
        switch (cmd) {
          case 'prochaine étape': reply = await cmdNextStep(brain); break;
          case 'résumé':         reply = await cmdSummary(brain);   break;
          case 'pitch':          reply = await cmdPitch(brain);     break;
          case 'questions':      reply = await cmdQuestions(brain); break;
          case 'statut':         reply = await cmdStatus(brain);    break;
          case 'aide':           reply = await cmdHelp();           break;
        }
        printReply(reply);
        rl.resume(); rl.prompt();
        return;
      }

      // ── Mise à jour forcée (syntaxe explicite) ────────────────────────────
      const isForced = forcedUpdate(input);
      const newFact  = isForced ? input.replace(/^[^:]+:\s*/, '').trim() : null;

      // ── Classification si pas forcé ───────────────────────────────────────
      let intent;
      if (isForced) {
        intent = { type:'update', newFact };
      } else {
        process.stdout.write(c.grey('🔍  Analyse…\n'));
        intent = await classifyIntent(input, brain);
      }

      // ── Traitement selon intention ────────────────────────────────────────
      if (intent.type === 'update') {
        const fact = intent.newFact || input;
        process.stdout.write(c.grey('🔍  Vérification des contradictions…\n'));
        const { contradiction, existing, section } = await checkContradiction(fact, brain);

        if (contradiction) {
          console.log();
          console.log(c.gold('⚠️   Contradiction détectée'));
          console.log(c.grey(`    Section : ${section}`));
          console.log(c.grey(`    Existant : "${existing}"`));
          console.log(c.cyan(`    Nouveau  : "${fact}"`));
          console.log();
          process.stdout.write(c.bold('Confirmer le remplacement? (oui/non) : '));
          pendingConfirm = { newFact: fact };
          rl.resume(); rl.prompt();
          return;
        }

        process.stdout.write(c.grey('🔄  Mise à jour de BRAIN.md…\n'));
        const result = await updateBrain(fact, brain);
        const withLog = appendChangelog(result.updatedBrain, `[${result.section}] ${result.change}`);
        saveBrain(withLog);
        brain = readBrain();

        console.log();
        console.log(c.green(`✅  BRAIN.md mis à jour — section "${result.section}" modifiée`));
        console.log(c.grey(`    → ${result.change}`));
        console.log(c.gold('\nProchaine action recommandée : Continuer à alimenter l\'agent avec les nouvelles infos'));
        console.log();

      } else {
        // Question normale
        process.stdout.write(c.grey('⏳  Réflexion…\n'));
        const reply = await answerQuestion(input, brain);
        printReply(reply);
      }

    } catch (e) {
      console.error('\n' + c.red('❌  Erreur : ' + e.message) + '\n');
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => { console.log(c.grey('\nAgent arrêté.\n')); process.exit(0); });
}

main();
