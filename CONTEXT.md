# LASSONDE — CONTEXT CONDENSÉ
## STACK
- App: app.html (PWA) + server.js (Node) + database.js (SQLite)
- APIs: Anthropic claude-sonnet-4-5 + Shopify Admin 2026-04
- Deploy: Railway — https://lassonde-app-production.up.railway.app
- Local: http://localhost:3000

## FICHIERS CRITIQUES
- app.html — PWA 5 tabs: Scanner/Stock/Troupeau/Vérif/Agent (vanilla HTML/CSS/JS)
- server.js — routes: /config /health /api/agent /api/scan /api/scan-liste /api/inventaire /api/dashboard /api/prix-marche /api/betes /api/troupeau (+/:numero/statut +/:numero/rapport)
- database.js — SQLite better-sqlite3: inventaire/betes/ventes/prix_marche (44 prix chargés au boot)
- .env — ANTHROPIC_API_KEY SHOPIFY_ACCESS_TOKEN SHOPIFY_STORE_URL SHOPIFY_API_VERSION RAILWAY_TOKEN
- BRAIN.md — mémoire projet complète (lire pour contexte business)
- agent.js — CLI intelligent avec mise à jour BRAIN.md

## CLIENT
- Lassonde Wagyu Halal — Repentigny QC
- Tech: ZÉRO — interface ultra-simple obligatoire
- Peur: rush de demande — veut contrôle de la vente
- Boucher fixe tous les prix — Lassonde suit aveuglément

## PRODUIT
- 44 coupes — 9.89$ à 241.99$/kg — catégories: Ultra Premium/Premium/Steaks/BBQ/Rôtis/Préparé/Accessible/Abats
- Certification FAMBRAS Halal — abattage islamique strict
- ~24 216$/boeuf — 6 boeufs/an — ~145K$/an potentiel
- Sous-vide congelé — livraison chaîne du froid

## SHOPIFY
- Store: lassonde-wagyu-test.myshopify.com
- API version: 2026-04 (GraphQL Admin)
- 61 produits actifs — 8 collections Lassonde
- Livraison: Québec 25$ lun/mar/mer — gratuit 200$+
- TPS 5% + TVQ 9.975% — CAD

## DEUX BUSINESS
1. SaaS agent IA — 200-400$/mois/client — marge 95%+
2. Dropshipping Lassonde — marché Halal MTL/Laval (~420K personnes)

## FEATURES FAITES ✅
- Scan photo Claude Vision (claude-sonnet-4-5 avec image/jpeg base64)
- Boutons Recommencer / Corriger / Confirmer post-scan
- Badge Halal FAMBRAS dans le formulaire
- Cards résultat scan (groupes: Scan / Prix / Traçabilité)
- Création produit Shopify Admin API réelle
- Dashboard stock live depuis DB locale + fallback Shopify
- Agent chat français québécois + web search (web_search_20250305)
- Typing indicator animé dans le chat
- Toast slide-up + skeleton loading stock
- Base données SQLite 44 prix + catégories
- BRAIN.md + agent.js CLI
- Deploy Railway auto via GitHub (leloup067/lassonde-wagyu)
- SVG icons (tabs + scanner + send + upload + refresh)
- Accessibilité: aria-labels, focus rings, prefers-reduced-motion
- TROUPEAU: inventaire bêtes vivantes (pâturage) + abattues (frigo) — tag ATQ MAPAQ, naissance, poids vif, âge, ETA abattage 30 mois — statuts pâturage→abattoir→frigo→vendu — agrégats morceaux/poids/valeur par bête (lien numero_bete dans inventaire)
- VÉRIF COMMANDE: client photographie sa liste de découpe (/api/scan-liste Claude vision) → checklist → scanne chaque morceau → pointage auto fuzzy (coupe+poids) → progression + poids total + valeur totale — persist localStorage
- Scanner: champ "Bête (tag ATQ)" lie chaque sac scanné à une bête

## FEATURES À FAIRE ❌
- Mode stock caché / drops contrôlés (Shopify status=draft)
- Système pré-commandes
- Dashboard profit par bête (coût élevage vs revenus réels — partiellement fait via /api/troupeau/:n/rapport)
- Alerte prix marché auto (boucher sous-évalue?)
- Calendrier disponibilité prochain boeuf
- Étiquettes synthétiques — test 9 conditions photo

## ERREURS CONNUES
- Date agent: toujours injectée server-side via `new Date().toLocaleDateString('fr-CA')`
- 413 photo trop grosse: compression JPEG auto dans compresserImage() — max 1200px 85%
- Railway CLI inaccessible depuis Claude Code: déployer via git push → Railway auto-deploy GitHub

## DESIGN — RÈGLES NON-NÉGOCIABLES
- #0a0a0a fond — #c8a96e or — Georgia — mobile first
- 1 seule action visible à la fois — zéro mot technique
- SVG icons uniquement (pas d'emojis dans les boutons)
- Animations: transform/opacity uniquement — prefers-reduced-motion respecté

## PITCH LASSONDE
"Vous allez voir EXACTEMENT combien chaque boeuf vous rapporte,
coupe par coupe. Et contrôler quand et combien vous vendez,
sans stress, sans rush."
