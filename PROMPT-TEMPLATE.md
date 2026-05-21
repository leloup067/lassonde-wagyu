# TEMPLATE PROMPT — ÉCONOMISE LES TOKENS

## POUR CHAQUE NOUVELLE TÂCHE — COPIE CE FORMAT :

---
Contexte: [lis CONTEXT.md]
Tâche: [description courte et précise]
Fichiers concernés: [app.html / server.js / database.js / autre]
Input: [ce qui existe déjà]
Output attendu: [ce qu'on veut exactement]
Contraintes: [limites importantes]
Test: [comment valider que c'est bon]
---

## EXEMPLES D'UTILISATION :

### Bug fix :
```
Contexte: lis CONTEXT.md
Tâche: Fix erreur 413 sur upload photo
Fichiers: server.js + app.html
Input: Photos iPhone HEIC/JPEG ~3-5MB
Output: Compression auto avant envoi + limite 50mb server
Contraintes: Pas toucher aux autres routes
Test: Upload photo 5MB → pas d'erreur
```

### Nouvelle feature :
```
Contexte: lis CONTEXT.md
Tâche: Ajoute mode stock caché dans app.html
Fichiers: app.html + server.js
Input: Produits Shopify existants
Output: Toggle visible/caché par produit + sync Shopify status=draft
Contraintes: Ultra simple — 1 tap pour cacher/montrer
Test: Cacher un produit → vérifie Shopify status=draft
```

### Déploiement :
```
Contexte: lis CONTEXT.md
Tâche: Déploie sur Railway
Fichiers: tous
Input: Code local à jour
Output: URL live fonctionnelle
Contraintes: Variables .env présentes sur Railway
Test: curl /health → shopify:true anthropic:true
```

### Design change :
```
Contexte: lis CONTEXT.md
Tâche: Améliore les cards du stock
Fichiers: app.html
Input: .stock-item CSS actuel
Output: Cards avec hover lift + prix en evidence + badge coupe
Contraintes: #0a0a0a fond / #c8a96e or / Georgia / SVG icons uniquement
Test: Preview dans browser
```

### Database :
```
Contexte: lis CONTEXT.md
Tâche: Ajoute colonne note_boucher à inventaire
Fichiers: database.js + server.js
Input: Table inventaire existante
Output: ALTER TABLE migration + exposed dans /api/inventaire
Contraintes: Migration silencieuse (try/catch) pour DB existante
Test: node -e "require('./database.js')" → pas d'erreur
```

## TOKENS ÉCONOMISÉS PAR CE FORMAT
- Évite de réexpliquer le projet à chaque fois
- Claude Code lit CONTEXT.md (1 page) au lieu de fouiller tous les fichiers
- Format structuré = moins d'aller-retours = moins de tokens
- Estimé: -60% de tokens par session
