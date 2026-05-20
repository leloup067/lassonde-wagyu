#!/usr/bin/env node
// deploy.js — Déploie sur Railway via API GraphQL + upload tarball
'use strict';

require('dotenv').config();
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

const TOKEN      = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const SERVICE_ID = process.env.RAILWAY_SERVICE_ID;
const ENV_ID     = process.env.RAILWAY_ENV_ID; // optional, defaults to production

if (!TOKEN) {
  console.error('❌ RAILWAY_TOKEN manquant dans .env');
  process.exit(1);
}

// ─── GraphQL helper ──────────────────────────────────────────────────────────
function gql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req  = https.request({
      hostname: 'backboard.railway.app',
      path:     '/graphql/v2',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${TOKEN}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.errors) return reject(new Error(j.errors[0]?.message ?? 'GraphQL error'));
          resolve(j.data);
        } catch (e) { reject(new Error('Parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout 30s — backboard.railway.app inaccessible')); });
    req.write(body);
    req.end();
  });
}

// ─── Upload helper (PUT vers URL pré-signée) ─────────────────────────────────
function uploadFile(uploadUrl, filePath) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath);
    const url        = new URL(uploadUrl);
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'PUT',
      headers: {
        'Content-Type':   'application/gzip',
        'Content-Length': fileBuffer.length,
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Upload HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Upload timeout')); });
    req.write(fileBuffer);
    req.end();
  });
}

// ─── Crée le tarball du projet ────────────────────────────────────────────────
function createTarball() {
  const tarPath = '/tmp/lassonde-deploy.tar.gz';
  const dir     = __dirname;
  // Exclut node_modules, .git, lassonde.db, .env, tmp files
  execSync(
    `tar -czf ${tarPath} \
      --exclude='./node_modules' \
      --exclude='./.git' \
      --exclude='./lassonde.db' \
      --exclude='./.env' \
      --exclude='./*.log' \
      --exclude='./*.pdf' \
      --exclude='./tmp' \
      --exclude='./deploy.js' \
      -C "${dir}" .`,
    { stdio: 'pipe' }
  );
  const size = fs.statSync(tarPath).size;
  console.log(`  📦 Tarball créé : ${(size / 1024).toFixed(0)} KB`);
  return tarPath;
}

// ─── ÉTAPE 1 : Lister projets et services ────────────────────────────────────
async function listProjects() {
  console.log('🔍 Connexion à Railway...\n');
  const data = await gql(`
    query {
      me {
        projects {
          edges {
            node {
              id
              name
              environments { edges { node { id name } } }
              services {
                edges {
                  node { id name }
                }
              }
            }
          }
        }
      }
    }
  `);

  console.log('📋 Projets et services :\n');
  for (const { node: p } of data.me.projects.edges) {
    console.log(`  Projet : ${p.name}`);
    console.log(`    RAILWAY_PROJECT_ID=${p.id}`);
    for (const { node: e } of p.environments.edges) {
      console.log(`    Env    : ${e.name} → RAILWAY_ENV_ID=${e.id}`);
    }
    for (const { node: s } of p.services.edges) {
      console.log(`    Service: ${s.name} → RAILWAY_SERVICE_ID=${s.id}`);
    }
    console.log('');
  }
  console.log('→ Ajoute RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID, RAILWAY_ENV_ID dans .env');
  console.log('→ Puis relance : node deploy.js\n');
}

// ─── ÉTAPE 2 : Déployer ───────────────────────────────────────────────────────
async function deploy() {
  console.log('🚀 Déploiement Railway...\n');

  // Trouver l'environment ID si pas fourni
  let envId = ENV_ID;
  if (!envId) {
    const data = await gql(`
      query($projectId: String!) {
        project(id: $projectId) {
          environments { edges { node { id name } } }
        }
      }
    `, { projectId: PROJECT_ID });
    const envs   = data.project.environments.edges;
    const prod   = envs.find(e => e.node.name === 'production') || envs[0];
    envId        = prod?.node?.id;
    console.log(`  Environnement : ${prod?.node?.name} (${envId})`);
  }

  // 1. Créer un slot d'upload
  console.log('  1/4 Création slot upload…');
  const uploadData = await gql(`
    mutation($serviceId: String!, $environmentId: String!) {
      deploymentUploadCreate(serviceId: $serviceId, environmentId: $environmentId) {
        url
        token
        deploymentId
      }
    }
  `, { serviceId: SERVICE_ID, environmentId: envId });

  const { url: uploadUrl, deploymentId } = uploadData.deploymentUploadCreate;
  console.log(`  → Deployment ID : ${deploymentId}`);

  // 2. Créer tarball
  console.log('  2/4 Compression des fichiers…');
  const tarPath = createTarball();

  // 3. Upload
  console.log('  3/4 Upload vers Railway…');
  await uploadFile(uploadUrl, tarPath);
  console.log('  → Upload terminé ✓');

  // 4. Vérifier le statut du déploiement
  console.log('  4/4 Build en cours…');
  console.log(`\n✅ Déploiement déclenché !`);
  console.log(`   Logs : https://railway.com/project/${PROJECT_ID}/service/${SERVICE_ID}`);
  console.log('   Dans ~60s : https://lassonde-app-production.up.railway.app\n');

  // Nettoyer
  fs.unlinkSync(tarPath);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    if (!PROJECT_ID || !SERVICE_ID) {
      await listProjects();
    } else {
      await deploy();
    }
  } catch (e) {
    console.error('\n❌ Erreur :', e.message);
    if (e.message.includes('Timeout') || e.message.includes('inaccessible')) {
      console.error('\n⚠️  backboard.railway.app est inaccessible depuis ce réseau.');
      console.error('   → Lance depuis ton terminal local :');
      console.error('     cd /Users/adamo/Desktop/CLAUDE && railway up --service lassonde-app');
    }
    process.exit(1);
  }
})();
