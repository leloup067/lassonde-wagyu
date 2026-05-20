# 🥩 Scan Étiquette — Les Élevages Lassonde

Application web mobile pour scanner et extraire les données des étiquettes de bœuf Wagyu à l'aide de la caméra du téléphone et de l'intelligence artificielle Claude (Anthropic).

---

## C'est quoi cette app ?

Cette app permet à un employé des Élevages Lassonde de :

1. **Pointer sa caméra** vers une étiquette de boucherie Wagyu
2. **Prendre une photo** d'un seul tap
3. **Laisser Claude analyser** l'étiquette (type de coupe, poids, prix, dates…)
4. **Vérifier les données** extraites dans un tableau clair
5. **Confirmer et enregistrer** l'entrée localement

> La connexion Shopify sera ajoutée dans une prochaine version. Pour l'instant, les données confirmées sont enregistrées dans le navigateur (localStorage).

---

## 🚀 Comment l'utiliser

### Étape 1 — Obtenir une clé API Anthropic

1. Allez sur [console.anthropic.com](https://console.anthropic.com)
2. Créez un compte (ou connectez-vous)
3. Dans le menu, allez dans **API Keys**
4. Cliquez **Create Key** — copiez la clé (elle commence par `sk-ant-api03-…`)
5. **Gardez cette clé secrète** — ne la partagez pas

### Étape 2 — Ouvrir l'app et configurer la clé

1. Ouvrez l'app dans votre navigateur (voir section Déploiement ci-dessous)
2. Appuyez sur le bouton **⚙️** en haut à droite
3. Collez votre clé API dans le champ prévu
4. Choisissez le modèle (recommandé : `claude-opus-4-5`)
5. Appuyez **Enregistrer** — la clé est sauvegardée dans votre téléphone

### Étape 3 — Scanner une étiquette

1. Accordez l'accès à la caméra quand le navigateur le demande
2. Pointez la caméra vers l'étiquette et centrez-la dans le cadre
3. Appuyez sur le **grand bouton rouge** pour prendre la photo
4. Attendez quelques secondes pendant que Claude analyse l'image
5. Vérifiez les données extraites dans le tableau
6. Si tout est correct, appuyez **Confirmer et enregistrer**
7. Appuyez **Recommencer** pour scanner une autre étiquette

---

## 🌐 Comment déployer l'app

### Option 1 — En local sur votre ordinateur (pour tester)

1. Téléchargez ou copiez le dossier `app-scan-ocr/`
2. Ouvrez `index.html` directement dans **Chrome** ou **Firefox**

> ⚠️ **Limitation** : La caméra ne fonctionnera pas en local sans HTTPS, sauf sur `localhost`. Pour tester la caméra localement, utilisez une extension comme [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) dans VS Code.

### Option 2 — Sur GitHub Pages (gratuit, HTTPS inclus ✅)

1. Créez un compte sur [github.com](https://github.com)
2. Créez un nouveau dépôt public (ex: `scan-lassonde`)
3. Uploadez les 3 fichiers : `index.html`, `style.css`, `script.js`
4. Dans **Settings → Pages**, choisissez la branche `main` et sauvegardez
5. L'app sera disponible à `https://votre-nom.github.io/scan-lassonde/`
6. La caméra fonctionnera correctement grâce au HTTPS 📱

### Option 3 — Sur Netlify (drag & drop, gratuit ✅)

1. Allez sur [netlify.com](https://netlify.com) et créez un compte gratuit
2. Sur le tableau de bord, faites glisser le **dossier `app-scan-ocr/`** dans la zone de dépôt
3. Netlify génère automatiquement une URL HTTPS (ex: `https://random-name.netlify.app`)
4. Partagez cette URL avec votre équipe

---

## 📱 Notes techniques

### Navigateurs compatibles

| Navigateur | iOS (iPhone) | Android | Desktop |
|------------|-------------|---------|---------|
| Safari     | ✅ Requis   | —       | ✅      |
| Chrome     | ⚠️ Partiel  | ✅      | ✅      |
| Firefox    | ❌          | ✅      | ✅      |

> Sur iPhone, **Safari est le seul navigateur** qui permet l'accès à la caméra arrière. Chrome iOS utilise le moteur WebKit et peut avoir des limitations.

### Permissions caméra

- L'app demande l'accès à la caméra à la première utilisation
- Sur iOS : **Réglages → Safari → Caméra → Autoriser**
- Sur Android : Accordez l'accès quand Chrome le demande

### HTTPS obligatoire pour la caméra

Les navigateurs modernes exigent que le site soit servi en HTTPS pour utiliser `getUserMedia()` (accès caméra). GitHub Pages et Netlify fournissent HTTPS gratuitement.

---

## 🔮 Prochaines étapes

- [ ] **Connexion Shopify** : envoyer les données confirmées à l'inventaire Shopify via l'API Admin
- [ ] **Export CSV** : télécharger le log des entrées en fichier Excel
- [ ] **Mode hors ligne** : mettre en file d'attente les scans quand il n'y a pas de connexion
- [ ] **Historique** : voir et chercher dans tous les scans précédents
- [ ] **Multi-utilisateurs** : associer les scans à un employé spécifique

---

## 🗄️ Structure des données enregistrées

Chaque entrée confirmée est sauvegardée dans le `localStorage` du navigateur sous la clé `lassonde_scan_log`, au format JSON :

```json
[
  {
    "coupe": "Faux-Filet",
    "code_produit": "1234-FF-WGY",
    "poids_kg": 0.823,
    "poids_lb": 1.814,
    "prix_kg": 89.24,
    "prix_total": 73.44,
    "date_emballage": "2024-11-08",
    "meilleur_avant": "2024-11-14",
    "notes": "Wagyu Halal FAMBRAS",
    "timestamp": "2024-11-08T14:32:11.000Z",
    "id": 1731073931000
  }
]
```

Pour récupérer les données manuellement, ouvrez la **console développeur** (F12) et tapez :
```javascript
JSON.parse(localStorage.getItem('lassonde_scan_log'))
```

---

## 📁 Structure des fichiers

```
app-scan-ocr/
├── index.html           → Interface de l'application
├── style.css            → Styles dark theme premium
├── script.js            → Logique JavaScript (caméra + API + log)
├── README.md            → Ce fichier
└── exemple-etiquette.txt → Exemples d'étiquettes pour tester
```

---

*Prototype développé pour Les Élevages Lassonde — Wagyu Halal du Québec.*
