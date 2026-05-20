# PROJET LASSONDE — CERVEAU CENTRAL
Dernière mise à jour : 19 mai 2026

## CONTEXTE BUSINESS
- Client : Les Élevages Lassonde — Wagyu Halal — Repentigny QC
- Adresse : 255 ch. de la Presqu'île, Repentigny, J5Z 4C7
- Profil client : Connaissance tech ZÉRO, confiance établie, ouvert à l'app
- Visite : 19 mai 2026 — ferme visitée, bœufs et toros vus en personne
- Échantillon reçu : Short Ribs Wagyu, C-1528, 1.094kg, 39.99$/kg = 43.75$
- Wolff présenté comme partenaire (pas consultant ni employé)

## RÉALITÉ OPÉRATIONNELLE DE LASSONDE
- Ne fixe PAS ses propres prix — le boucher décide tout
- Suit aveuglément les prix du boucher sans vérification
- Code-barre sur étiquettes = décoratif, jamais utilisé
- Entre les prix manuellement à la caisse (prix + date seulement)
- Ne comptabilise pas le poids de chaque coupe
- Aucune idée de son profit réel par bête
- Logique actuelle : stock diminue → argent rentre → satisfait
- Ne communique jamais l'arrivée d'un nouveau bœuf
- Coût d'élevage par bœuf : 4000$

## INSIGHT MAJEUR — PEUR DU RUSH
- S'il annonce du stock disponible → rush instantané → tout part en 1 jour
- Préfère vendre lentement sans buzz pour éviter le stress
- Site web volontairement vide — pas un manque de compétence, un choix
- Réceptif à l'idée d'un système qui contrôle la demande automatiquement

## CHAÎNE DE VALEUR — 3 ACTEURS
Lassonde ←→ Boucher ←→ Marché

Lassonde contrôle : élevage, qualité, relation client
Boucher contrôle : prix, découpe, packaging, étiquettes
Résultat : Lassonde fait 100% du travail, boucher décide combien ça vaut

Questions à clarifier sur le boucher :
- Qui exactement? David et Philip Inc (C-1387) ou C-1528?
- Externe ou partenaire dédié?
- Plusieurs bouchers selon les coupes?

## QUALITÉ DU PRODUIT
Confirmé :
- Viande classée Prime niveau 3 (ratio gras/viande)
- Wagyu Halal certifié FAMBRAS
- Sous-vide et congelé — chaîne du froid plus tolérante
- Étiquettes lisibles — Claude Vision validé sur photos réelles

À clarifier :
- Prime niveau 3 selon quelle classification? BMS japonais, AAA canadien, système interne?
- F1, F2, ou full blood Wagyu?

## EXPERT QUALITÉ
- Aucun expert externe identifié pour l'instant
- Classification à clarifier lors de la prochaine rencontre

## ANALYSE DE PRIX — SHORT RIBS C-1528
| Source | Prix/kg | Status |
|--------|---------|--------|
| Lassonde | 39.99$ | Vendu |
| Élevages Westmount régulier | 39.99$ | Rupture |
| Élevages Westmount promo | 29.99$ | Rupture |
| Wagyu Shop USA | ~110-130$ USD | Dispo |
| Snake River Farms USA | ~120-150$ USD | Dispo |

Hypothèse : prix possiblement sous-évalué ou erreur boucher non détectée

## STACK TECHNIQUE
- Shopify store : lassonde-wagyu-test.myshopify.com
- 61 produits actifs, 11 collections (8 Lassonde + 3 système Shopify)
- Livraison Québec chaîne du froid 25$ lun/mar/mer
- Livraison gratuite 200$+
- TPS 5% + TVQ 9.975% configurées
- Devise : CAD
- API Anthropic : connectée et active
- app.html : PWA complète — Scanner, Stock, Agent (775 lignes)
- server.js : backend Node.js — routes /, /config, /health + CORS
- .env : credentials Shopify + Anthropic
- Déployé sur Railway : https://lassonde-app-production.up.railway.app
- Base de données SQLite locale : lassonde.db (better-sqlite3)
- Tables : inventaire, betes, ventes, prix_marche
- API locale : /api/inventaire, /api/resume, /api/betes, /api/prix-marche, /api/dashboard
- 10 prix marché de référence chargés
- Sync bidirectionnelle DB locale ↔ Shopify active

## DEUX BUSINESS
### Business 1 — SaaS Agent IA
- Système vendu en abonnement à n'importe quel commerce alimentaire
- Bouchers, fromageries, épiceries halal, fermiers, maraîchers
- Lassonde = client #1 et démo vivante
- Config par client dans CLIENT_CONFIG dans app.html
- Prix cible : 200-400$/mois par client
- Coût API réel : ~2-15$/mois selon volume
- Marge : 95%+

### Business 2 — Dropshipping Lassonde
- Propre boutique Shopify sous notre marque
- Achète à Lassonde prix gros, revend avec marge
- Marché cible : communauté Halal Montréal/Laval (~420 000 personnes)
- Certification FAMBRAS comme argument de confiance
- Positionnement : Wagyu Halal premium accessible

## FONCTIONNALITÉS APP — PRIORITÉS
### Fait
- Scanner photo 1 par 1 avec Claude Vision
- Dashboard stock live depuis Shopify
- Agent chat en français québécois
- Connexion Shopify Admin API réelle

### Rapport de précision Claude Vision — 19 mai 2026
| Condition | Précision | Status |
|-----------|-----------|--------|
| Photo parfaite | 100% | 🟢 |
| Légèrement floue | 80% | 🟡 |
| Très floue | 0% | 🔴 |
| Reflet plastique | 80% | 🟡 |
| Angle 45° | 80% | 🟡 |
| Étiquette coupée | 100% | 🟢 |
| Trop sombre | 92% | 🟢 |
| Surexposé | 80% | 🟡 |
| Étiquette froissée | 100% | 🟢 |
| **MOYENNE** | **79%** | 🟡 |
- Point fort : tient parfaitement avec image coupée, sombre, froissée
- Point faible critique : très floue = 0% détection
- RAPPORT-PRECISION-VISION.pdf généré — prêt à montrer à Lassonde

### À construire — priorité haute
1. Mode stock caché — produits sur réservation par défaut
2. Drops contrôlés — Lassonde décide quand et combien vendre
3. Système pré-commandes — clients réservent à l'avance
4. Dashboard profit par bête — coût élevage vs revenus réels
5. Alerte prix marché — détecte erreurs du boucher automatiquement
6. Calendrier disponibilité — prochain bœuf sans date exacte

## DESIGN APP — RÈGLES NON-NÉGOCIABLES
- Fond noir #0a0a0a, accent or #c8a96e, font Georgia
- 1 seule action principale visible à la fois
- Zéro mot technique dans l'interface
- L'agent parle en premier et suggère quoi faire
- Confirmation toujours visible avant d'agir
- Rapport quotidien automatique par texto le soir

## PITCH REFORMULÉ POST-VISITE
Avant : "On va vous aider à mieux gérer votre inventaire"
Après : "On va vous donner les chiffres exacts de votre business 
— qu'aujourd'hui seul le boucher connaît. Vous allez voir 
EXACTEMENT combien chaque bœuf vous rapporte, coupe par coupe. 
Et vous allez pouvoir contrôler exactement quand et combien vous 
vendez, sans stress, sans rush."

## PROCHAINES ÉTAPES — DANS L'ORDRE
1. [CETTE SEMAINE] Générer 20-30 étiquettes synthétiques Lassonde
2. [CETTE SEMAINE] Tester 9 conditions photo différentes
3. [CETTE SEMAINE] Rapport de précision Claude Vision documenté
4. [2-3 SEMAINES] Proposer test gratuit à Lassonde — prochaine livraison
5. [2-3 SEMAINES] Wolff va chez Lassonde, photographie tout, génère rapport
6. [APRÈS TEST] Pitch officiel avec données réelles de SON bœuf

## QUESTIONS À CLARIFIER — PROCHAINE RENCONTRE
1. Boucher — qui exactement? Relation contractuelle?
2. Classification Prime niveau 3 — quelle échelle?
3. F1, F2 ou full blood Wagyu?
4. ~~Coût d'élevage par bœuf? (alimentation, vétérinaire, abattage)~~ RÉPONDU : 4000$
5. Combien de bœufs par année? Confirmer 1/2 mois = 6/an
6. Clients actuels — restaurants, particuliers, distributeurs?
7. Comment les clients le trouvent actuellement?

## TIMING
- Stock actuel : bas
- Nouveau bœuf arrivé : 15 mai 2026
- Prochaine livraison : dans les semaines à venir
- Fenêtre parfaite pour proposer test gratuit

## EXPERTISE HALAL ET ABATTAGE
- Certification : FAMBRAS (Federação das Associações Muçulmanas do Brasil) — reconnue internationalement
- Abattage : animal vivant, par un musulman pratiquant, Bismillah prononcé, jugulaire/carotide/trachée tranchées net
- Saignée complète — sang totalement évacué
- Zéro contact porc/alcool dans toute la chaîne
- Traçabilité : bœuf → abattoir certifié Halal QC → emballage sous-vide → livraison chaîne du froid
- Certification visible sur chaque boîte de matière première
- Classification viande : Prime niveau 3 (ratio gras/viande), Wagyu croisé ou full blood (à confirmer)

## DATE SYSTÈME
- Toujours injecter `new Date().toLocaleDateString('fr-CA', {timeZone:'America/Toronto'})` dans chaque prompt agent
- Ne jamais laisser Claude assumer l'année — date injectée dynamiquement à chaque appel /api/agent
- Timezone : America/Toronto (heure de Montréal)

## CHANGELOG
- 2026-05-19 14 h 40 — [RÉALITÉ OPÉRATIONNELLE] Ajout coût d'élevage par bœuf (4000$), question #4 marquée répondue
- 2026-05-19 18 h 47 — [STACK TECHNIQUE] Diagnostic : 11 collections confirmées, Railway URL ajoutée, server.js /health + CORS ajoutés
- 2026-05-19 19 h 08 — [STACK TECHNIQUE] Base SQLite créée : inventaire + bêtes + ventes + prix_marche. Agent lit DB en temps réel. Tab Stock → /api/inventaire.
