# START — LIS EN PREMIER

## 1. CONTEXTE
```
lis CONTEXT.md   → état du projet en 1 page
lis BRAIN.md     → contexte business complet
```

## 2. LANCER L'APP
```bash
node server.js          # app locale sur :3000
node agent.js           # cerveau CLI du projet
curl localhost:3000/health  # vérifie: shopify:true anthropic:true
```

## 3. COMMANDES RAPIDES
```bash
node server.js                    # démarre l'app PWA
node agent.js                     # agent CLI intelligent
node deploy.js                    # déploie Railway (si Railway CLI dispo)
git push origin main              # → Railway auto-deploy via GitHub

curl localhost:3000/health        # santé du serveur
curl localhost:3000/api/dashboard # dashboard JSON complet
curl localhost:3000/api/prix-marche # 44 prix Lassonde + concurrents
curl localhost:3000/api/inventaire  # sacs scannés
```

## 4. RÈGLES ABSOLUES
- **Jamais hardcoder** une clé API dans le code (utiliser .env)
- **Toujours compresser** les images avant envoi (compresserImage() dans app.html)
- **Toujours confirmer** avant de créer/modifier dans Shopify
- **Design**: 1 seule action visible à la fois, SVG icons uniquement, #0a0a0a/#c8a96e/Georgia
- **Langue**: français québécois dans toute l'interface utilisateur
- **Deploy**: git push → Railway auto-deploy (pas railway CLI, inaccessible depuis Claude Code)

## 5. FICHIERS CRITIQUES — NE PAS CASSER
| Fichier | Rôle | Toucher? |
|---|---|---|
| app.html | PWA complète | Oui — avec soin |
| server.js | Backend Express + routes | Oui |
| database.js | Schéma SQLite + seed 44 prix | Avec migration |
| .env | Credentials | JAMAIS committer |
| BRAIN.md | Mémoire projet | Via agent.js uniquement |

## 6. PROCHAINES ÉTAPES PRIORITAIRES (ordre)
1. **Mode stock caché** — `status=draft` Shopify + toggle dans app.html
2. **Dashboard profit bête** — coût 4000$ vs revenus scannés
3. **Alerte prix** — détecte si prix scanné < prix_marche × 0.5 (erreur boucher)
4. **Étiquettes synthétiques** — générer 20-30 étiquettes pour tester Vision
5. **Pré-commandes** — formulaire client + liste d'attente

## 7. ARCHITECTURE RAPIDE
```
app.html (PWA mobile)
    ↓ fetch
server.js (Express :3000)
    ├── /api/scan → Anthropic Claude Vision
    ├── /api/agent → Anthropic Claude + web_search
    ├── /api/inventaire → database.js (SQLite)
    └── /api/shopify/* → Shopify Admin GraphQL 2026-04

database.js (better-sqlite3)
    ├── inventaire (sacs scannés)
    ├── betes (par boeuf)
    ├── ventes (sync Shopify orders)
    └── prix_marche (44 prix Lassonde + concurrents)
```

## 8. EN CAS DE PROBLÈME
```bash
# App ne démarre pas
cat .env                    # vérifier variables présentes
node -e "require('./database')"  # tester la DB

# Railway ne déploie pas
git log --oneline -3        # vérifier dernier commit
git push origin main        # forcer push

# Agent retourne erreur
curl -X POST localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}' | python3 -m json.tool
```
