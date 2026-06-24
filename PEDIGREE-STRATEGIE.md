# STRATÉGIE — Système de pedigree / reproduction (à intégrer plus tard)

> Demandé par le client (test réel juin 2026). Non prioritaire — à bâtir après que
> l'inventaire multi-bœufs hebdomadaire soit rodé. Ce document = le PLAN, pas du code.

## 1. Le besoin

Le troupeau ne contient pas que des bœufs d'engraissement (viande). Il y a aussi :
- **Taureaux** → reproduction seulement (pas pour la viande)
- **Vaches** → reproduction seulement

Le client veut éventuellement que l'app puisse :
1. Savoir **quel taureau × quelle vache** a produit chaque animal
2. Évaluer **combien de veaux chaque vache a eus** (productivité)
3. Évaluer les **taureaux** (qualité de leur descendance)
4. **Éviter la consanguinité** (ne pas accoupler des animaux trop proches)

## 2. Modèle de données proposé

On étend la table `betes` existante (déjà : numero_bete, tag_atq, nom, type,
date_naissance, poids_vif_kg, race, statut, date_abattage…) avec :

| Colonne | Rôle |
|---|---|
| `role` | `reproducteur` (taureau/vache) ou `engraissement` (bœuf/veau→viande) |
| `sexe` | `male` / `femelle` (taureau=mâle reproducteur, vache=femelle reproductrice) |
| `pere_tag` | tag ATQ du **taureau** géniteur |
| `mere_tag` | tag ATQ de la **vache** mère |

+ ajouter `taureau` aux types permis (actuellement bœuf/veau/vache).

**Le tag ATQ est la clé stable** pour relier parents↔enfants (plus fiable que numero_bete
qu'on assigne nous-mêmes). C'est déjà l'identifiant unique du MAPAQ.

Nouvelle table `saillies` (registre des accouplements) :
```
saillies(id, taureau_tag, vache_tag, date_saillie, date_naissance_prevue,
         veau_tag (résultat, nullable), notes)
```
Une saillie confirmée crée automatiquement la fiche du veau avec père/mère remplis.

## 3. Fonctions clés

**Pedigree (arbre généalogique)** — en partant d'un animal, remonter pere_tag/mere_tag
sur N générations → afficher parents, grands-parents, etc.

**Détection de consanguinité** — avant d'accoupler taureau T × vache V :
1. Lister les ancêtres de T et de V sur 3-4 générations
2. Chercher les **ancêtres communs**
3. Indicateur : ✅ « aucun lien sur 4 générations » / ⚠️ « grand-père commun » /
   🔴 « père commun — à éviter »
- Départ simple : « ancêtre commun à ≤3 générations = avertissement ». Plus tard :
  vrai coefficient de Wright si besoin.

**Analytics génétiques** :
- Par **vache** : nombre de veaux (COUNT où mere_tag = elle), liste + dates
- Par **taureau** : nombre de descendants + **valeur de carcasse moyenne** de sa
  descendance (en reliant les veaux devenus bœufs au frigo → rapport/bête existant)
- → identifie les **meilleurs reproducteurs** (ROI génétique)

## 4. Intégration à l'app existante

- **Troupeau** : séparer visuellement « Reproducteurs » (taureaux + vaches) des
  « Animaux d'engraissement » (bœufs/veaux). Filtre par rôle.
- Nouvelle vue/onglet **Reproduction** : registre des saillies + vérif consanguinité +
  pedigree par animal.
- **Saisie** : scanner les tags ATQ + choisir les parents dans le troupeau. Plus tard :
  OCR des documents de pedigree MAPAQ (réutilise le moteur d'import registre déjà bâti).

## 5. Déploiement par phases (recommandé)

1. **Rôles** — ajouter type `taureau` + champ `role`. Marquer qui est reproducteur.
   *(faible effort, sépare déjà les reproducteurs de la viande)*
2. **Parents** — champs père/mère par animal. Pedigree de base (parents visibles).
3. **Registre de saillies** — journal taureau×vache×date → crée le veau auto.
4. **Consanguinité** — vérif des ancêtres communs avant un accouplement planifié.
5. **Analytics** — compte de descendance + valeur des descendants → meilleurs reproducteurs.

## 6. Pourquoi attendre

- L'inventaire viande (multi-bœufs hebdo) est la priorité opérationnelle immédiate.
- La reproduction est un cycle long (gestation ~9 mois) — pas d'urgence applicative.
- Mieux vaut stabiliser les données du troupeau (tags ATQ propres) avant d'y greffer
  la généalogie, qui en dépend entièrement.
