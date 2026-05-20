# Les Élevages Lassonde — Projet E-commerce Wagyu Halal

> Wagyu certifié Halal du Québec. Présence digitale complète pour le seul éleveur québécois positionné explicitement sur le marché Halal premium.

**Tagline** : *"Passion Wagyu. Origine Québec. Certifié Halal."*

**Statut** : Phase de lancement (Phase 1 — Mois 1-2)

---

## Table des matières des livrables

| Fichier | Type | Description |
|---|---|---|
| `README.md` | Documentation | Point d'entrée du projet — vue d'ensemble, structure, instructions |
| `PROJET.md` | Brief stratégique | Vision, mission, cibles, modèle d'affaires, phases, KPIs, stack technique |
| `produits-lassonde.csv` | Données | Catalogue complet des 44 produits avec prix boutique, prix web (+15%), descriptions |
| `contenu-pages-fr.md` | Contenu web | Textes complets du site en français : accueil, à propos, certifications, FAQ |
| `contenu-pages-en.md` | Contenu web | Textes complets du site en anglais (version miroir) |
| `prompts-visuels.md` | Créatif | Prompts pour génération d'images : produits, lifestyle, publicités Meta Ads |
| `pitch-lassonde.md` | Vente | Document de présentation du projet au client — offre, valeur, tarification |
| `app-scan-ocr/` | Prototype | Application OCR avec Claude Vision API pour scanner les étiquettes produits |

---

## Comment utiliser les fichiers

### Ordre recommandé

1. **`PROJET.md`** — Commencer ici. Comprendre la vision, la cible, le positionnement et le modèle d'affaires avant toute chose.
2. **`produits-lassonde.csv`** — Référence des 44 produits. Nécessaire pour configurer Shopify et tous les contenus.
3. **`contenu-pages-fr.md`** + **`contenu-pages-en.md`** — Textes prêts à intégrer dans Shopify. Dépend du catalogue CSV.
4. **`prompts-visuels.md`** — Utiliser après avoir défini les pages et produits. Alimenter Midjourney, DALL-E ou Firefly.
5. **`pitch-lassonde.md`** — Pour présentation client ou onboarding d'un nouveau collaborateur.
6. **`app-scan-ocr/`** — Prototype technique indépendant. Consulter le README interne du dossier.

### Dépendances

```
PROJET.md
    └── produits-lassonde.csv
            ├── contenu-pages-fr.md
            ├── contenu-pages-en.md
            └── prompts-visuels.md

pitch-lassonde.md  (standalone — résume PROJET.md)
app-scan-ocr/      (standalone — prototype technique)
```

---

## Structure du dossier

```
les-elevages-lassonde/
├── README.md                  # Ce fichier
├── PROJET.md                  # Brief stratégique complet
├── produits-lassonde.csv      # Catalogue 44 produits
├── contenu-pages-fr.md        # Contenu web — français
├── contenu-pages-en.md        # Contenu web — anglais
├── prompts-visuels.md         # Prompts créatifs pour visuels
├── pitch-lassonde.md          # Présentation client
└── app-scan-ocr/
    ├── README.md              # Instructions du prototype
    ├── scan.py                # Script principal (Claude Vision API)
    ├── requirements.txt       # Dépendances Python
    └── samples/               # Exemples d'étiquettes pour tests
```

---

## Notes sur les prix

Les prix du catalogue proviennent de la grille tarifaire en boutique physique. **Tous les prix affichés sur le site web e-commerce sont majorés de +15%** par rapport aux prix boutique.

Cette majoration couvre :
- Emballage isotherme premium (maintien de la chaîne du froid)
- Expédition et livraison à domicile
- Expérience client e-commerce (présentation, photo, service)

### Exemples de calcul

| Produit | Prix boutique | Prix web (+15%) |
|---|---|---|
| Filet Mignon | 241,99 $/kg | 278,29 $/kg |
| Os à Soupe | 9,89 $/kg | 11,37 $/kg |
| Ribeye BMS 9-10 (12 oz) | ~119,30 $ | ~137,20 $ |

> **Important** : Toujours partir du fichier `produits-lassonde.csv` comme source de vérité pour les prix. Ne jamais ajuster manuellement les prix dans le contenu web sans mettre à jour le CSV d'abord.

---

## Direction visuelle

| Élément | Valeur |
|---|---|
| Couleurs | Noir mat, crème, rouge bordeaux, or subtil |
| Titres | Playfair Display / Cormorant Garamond |
| Corps de texte | Inter |
| Certification | FAMBRAS Halal |
| Origine viande | Bœuf F1 Wagyu Cross (Wagyu × Angus), certifié Halal du Brésil, transformé au Québec |

---

## Propriétaire du projet

**Client** : Les Élevages Lassonde
**Équipe créative** : Wolff + associé
**Modèle** : Retainer mensuel + commission sur ventes e-commerce
**Langue principale** : Français québécois (site bilingue FR/EN)

---

*Dernière mise à jour : Mai 2026 — Phase 1 en cours*
