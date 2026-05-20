/* ============================================================
   SCRIPT.JS — Les Élevages Lassonde · Scan Étiquette
   JavaScript vanilla (sans framework), commenté pour débutants.

   Flux général :
   1. L'app démarre → initialise la caméra arrière
   2. L'utilisateur appuie sur le bouton rond → capture une photo
   3. La photo est envoyée à l'API Claude (Anthropic) avec un prompt
   4. Claude répond avec un JSON contenant les données de l'étiquette
   5. Les données s'affichent dans le tableau pour vérification
   6. L'utilisateur confirme → entrée enregistrée dans localStorage
   ============================================================ */

'use strict'; /* Force un mode strict : aide à éviter des erreurs silencieuses */


/* ============================================================
   SECTION 1 : CONFIGURATION
   Toutes les valeurs modifiables sont ici, au même endroit.
============================================================ */

// ⚠️ IMPORTANT : Entrez votre clé API Anthropic dans les paramètres de l'app
// (bouton ⚙️ en haut à droite). La clé est sauvegardée dans votre navigateur.
// Ne jamais écrire la clé directement dans ce fichier si vous le partagez.

const CONFIG = {
  // Clé API lue depuis le localStorage (sauvegardée via les paramètres de l'app)
  apiKey: localStorage.getItem('anthropic_api_key') || '',

  // Modèle Claude à utiliser — peut être changé dans les paramètres
  model: localStorage.getItem('claude_model') || 'claude-opus-4-5',

  // URL de l'API Anthropic (ne pas modifier)
  apiEndpoint: 'https://api.anthropic.com/v1/messages',

  // Version de l'API Anthropic (ne pas modifier)
  anthropicVersion: '2023-06-01',

  // Clé utilisée pour stocker les entrées dans localStorage
  storageKey: 'lassonde_scan_log',
};

// Prompt envoyé à Claude pour analyser l'étiquette.
// Ce texte explique à Claude ce qu'on attend comme réponse.
const OCR_PROMPT = `Tu es un assistant spécialisé dans l'analyse d'étiquettes de boucherie.
Analyse cette étiquette et extrais les informations suivantes en JSON :
{
  "coupe": "nom de la coupe (ex: Faux-Filet)",
  "code_produit": "code ou SKU si visible",
  "poids_kg": "poids en kg (nombre décimal)",
  "poids_lb": "poids en lb (nombre décimal)",
  "prix_kg": "prix au kg (nombre décimal)",
  "prix_total": "prix total (nombre décimal)",
  "date_emballage": "date d'emballage au format YYYY-MM-DD",
  "meilleur_avant": "date meilleur avant au format YYYY-MM-DD",
  "notes": "autres informations pertinentes"
}
Si une information n'est pas visible, mets null pour cette valeur.
Réponds UNIQUEMENT avec le JSON, sans texte supplémentaire.`;


/* ============================================================
   SECTION 2 : RÉFÉRENCES AUX ÉLÉMENTS HTML
   On "attrape" les éléments de la page pour pouvoir les
   modifier depuis JavaScript.
============================================================ */

// --- Caméra ---
const videoEl        = document.getElementById('camera-preview');
const canvasEl       = document.getElementById('capture-canvas');
const btnCapture     = document.getElementById('btn-capture');
const placeholder    = document.getElementById('camera-placeholder');
const sectionCamera  = document.getElementById('section-camera');

// --- Résultats ---
const sectionResults = document.getElementById('section-results');
const loaderWrapper  = document.getElementById('loader-wrapper');
const resultsCard    = document.getElementById('results-card');
const errorBox       = document.getElementById('error-box');
const errorText      = document.getElementById('error-text');
const btnConfirm     = document.getElementById('btn-confirm');
const btnRestart     = document.getElementById('btn-restart');

// Cellules du tableau de résultats
const valCoupe        = document.getElementById('val-coupe');
const valCode         = document.getElementById('val-code');
const valPoids        = document.getElementById('val-poids');
const valPrixKg       = document.getElementById('val-prix-kg');
const valPrixTotal    = document.getElementById('val-prix-total');
const valDateEmb      = document.getElementById('val-date-emballage');
const valMeilleurAv   = document.getElementById('val-meilleur-avant');
const valNotes        = document.getElementById('val-notes');

// --- Log ---
const logToggle  = document.getElementById('log-toggle');
const logContent = document.getElementById('log-content');
const logList    = document.getElementById('log-list');
const logEmpty   = document.getElementById('log-empty');
const logCount   = document.getElementById('log-count');
const btnClearLog = document.getElementById('btn-clear-log');

// --- Modal paramètres ---
const btnOpenSettings  = document.getElementById('btn-open-settings');
const modalOverlay     = document.getElementById('modal-overlay');
const btnCloseModal    = document.getElementById('btn-close-modal');
const btnSaveSettings  = document.getElementById('btn-save-settings');
const inputApiKey      = document.getElementById('input-api-key');
const selectModel      = document.getElementById('select-model');
const settingsSavedMsg = document.getElementById('settings-saved-msg');


/* ============================================================
   SECTION 3 : ÉTAT DE L'APPLICATION
   Variable qui garde la dernière donnée extraite de l'étiquette.
   On en a besoin quand l'utilisateur clique sur "Confirmer".
============================================================ */

// Stocke le résultat JSON de la dernière analyse
let lastExtractedData = null;

// Référence au flux vidéo actif (pour pouvoir l'arrêter si besoin)
let cameraStream = null;


/* ============================================================
   SECTION 4 : INITIALISATION DE LA CAMÉRA
   On demande l'accès à la caméra arrière du téléphone.
   Sur desktop, ça utilise la webcam.
============================================================ */

/**
 * initCamera() — Démarre le flux vidéo de la caméra.
 * Utilise facingMode: 'environment' pour la caméra ARRIÈRE (dos du téléphone).
 */
async function initCamera() {
  try {
    // Demande d'accès à la caméra. Le navigateur affiche une popup de permission.
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // caméra arrière (dos du téléphone)
        width:  { ideal: 1920 },   // résolution idéale (la caméra choisit la plus proche)
        height: { ideal: 1080 },
      },
    });

    // Connecte le flux vidéo à l'élément <video> de la page
    videoEl.srcObject = cameraStream;

    // Attend que la vidéo soit prête à jouer
    await videoEl.play();

    // Cache le message "Chargement de la caméra…"
    placeholder.classList.add('hidden');

    // Active le bouton capture
    btnCapture.disabled = false;

    console.log('✅ Caméra initialisée avec succès');

  } catch (erreur) {
    // Si l'utilisateur refuse l'accès, ou si la caméra est indisponible
    console.error('❌ Erreur caméra :', erreur);

    placeholder.innerHTML = `
      <span class="placeholder-icon">🚫</span>
      <p>Accès à la caméra refusé.<br>
         Vérifiez les permissions de votre navigateur.</p>
    `;
  }
}

/* ============================================================
   SECTION 5 : CAPTURE DE PHOTO
   Quand l'utilisateur appuie sur le bouton, on "prend une photo"
   en dessinant le frame actuel de la vidéo dans un canvas invisible.
============================================================ */

/**
 * capturePhoto() — Capture le frame vidéo actuel et retourne une image base64.
 * @returns {string} Image en format base64 (JPEG), prête pour l'API.
 */
function capturePhoto() {
  const ctx = canvasEl.getContext('2d');

  // Ajuste la taille du canvas à celle de la vidéo
  canvasEl.width  = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;

  // Dessine le frame actuel de la vidéo dans le canvas
  ctx.drawImage(videoEl, 0, 0);

  // Convertit le canvas en image JPEG (qualité 90%)
  // Le résultat ressemble à : "data:image/jpeg;base64,/9j/4AAQ..."
  const dataUrl = canvasEl.toDataURL('image/jpeg', 0.9);

  // On enlève le préfixe "data:image/jpeg;base64," — l'API ne veut que la partie base64
  const base64 = dataUrl.split(',')[1];

  return base64;
}

/* ============================================================
   SECTION 6 : APPEL À L'API ANTHROPIC (Claude Vision)
   On envoie l'image + le prompt à Claude, qui répond avec un JSON.
============================================================ */

/**
 * analyzeImageWithClaude(base64Image) — Envoie l'image à l'API Claude.
 * @param {string} base64Image — Image encodée en base64
 * @returns {Object} Données extraites de l'étiquette (objet JavaScript)
 */
async function analyzeImageWithClaude(base64Image) {
  // Vérifie qu'une clé API a été configurée
  if (!CONFIG.apiKey) {
    throw new Error(
      'Clé API manquante. Appuyez sur ⚙️ en haut à droite pour entrer votre clé API Anthropic.'
    );
  }

  // Construction du corps de la requête (format JSON attendu par l'API Anthropic)
  const requestBody = {
    model: CONFIG.model,
    max_tokens: 1024, // Nombre maximum de tokens dans la réponse de Claude

    messages: [
      {
        role: 'user',
        content: [
          // Contenu de type "image" — on envoie la photo de l'étiquette
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image,
            },
          },
          // Contenu de type "texte" — on envoie le prompt OCR
          {
            type: 'text',
            text: OCR_PROMPT,
          },
        ],
      },
    ],
  };

  // Envoi de la requête à l'API Anthropic
  // fetch() est la fonction JavaScript native pour faire des appels HTTP
  const response = await fetch(CONFIG.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       CONFIG.apiKey,         // Votre clé secrète
      'anthropic-version': CONFIG.anthropicVersion,
    },
    body: JSON.stringify(requestBody), // Convertit l'objet JS en texte JSON
  });

  // Vérifie si la réponse HTTP est un succès (code 200-299)
  if (!response.ok) {
    // La requête a échoué — on lit le message d'erreur de l'API
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: { message: `Erreur HTTP ${response.status}` } };
    }

    // Erreurs courantes :
    // 401 = clé API invalide
    // 429 = trop de requêtes (limite atteinte)
    // 500 = erreur côté Anthropic
    const message = errorData?.error?.message || `Erreur HTTP ${response.status}`;
    throw new Error(`Erreur API Anthropic : ${message}`);
  }

  // Lit le corps de la réponse comme JSON
  const responseData = await response.json();

  // La réponse de l'API a cette structure :
  // { content: [ { type: 'text', text: '{ "coupe": "...", ... }' } ] }
  const rawText = responseData.content[0].text.trim();

  console.log('📥 Réponse brute de Claude :', rawText);

  // Parse le JSON retourné par Claude
  // On essaie d'extraire le JSON même si Claude a ajouté du texte autour
  let parsedData;
  try {
    // Tentative directe
    parsedData = JSON.parse(rawText);
  } catch {
    // Si ça échoue, on cherche un bloc JSON entre { } dans le texte
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Claude n\'a pas retourné un JSON valide. Essayez de reprendre la photo.');
    }
    parsedData = JSON.parse(jsonMatch[0]);
  }

  return parsedData;
}


/* ============================================================
   SECTION 7 : AFFICHAGE DES RÉSULTATS
   On remplit le tableau HTML avec les données extraites.
============================================================ */

/**
 * displayResults(data) — Affiche les données dans le tableau.
 * @param {Object} data — Objet contenant les champs de l'étiquette
 */
function displayResults(data) {
  // Fonction utilitaire : formate une valeur pour l'affichage.
  // Si la valeur est null/undefined, on affiche "—" en gris.
  const fmt = (val, suffix = '') => {
    if (val === null || val === undefined || val === '') {
      return '<span class="is-null">Non trouvé</span>';
    }
    return `${val}${suffix}`;
  };

  // Remplissage des cellules du tableau
  valCoupe.innerHTML      = fmt(data.coupe);
  valCode.innerHTML       = fmt(data.code_produit);

  // Poids : on affiche kg et lb sur la même ligne si disponibles
  if (data.poids_kg !== null && data.poids_lb !== null) {
    valPoids.innerHTML = `${data.poids_kg} kg&nbsp;/&nbsp;${data.poids_lb} lb`;
  } else if (data.poids_kg !== null) {
    valPoids.innerHTML = `${data.poids_kg} kg`;
  } else if (data.poids_lb !== null) {
    valPoids.innerHTML = `${data.poids_lb} lb`;
  } else {
    valPoids.innerHTML = '<span class="is-null">Non trouvé</span>';
  }

  valPrixKg.innerHTML     = data.prix_kg    !== null ? `${data.prix_kg} $/kg`  : '<span class="is-null">Non trouvé</span>';
  valPrixTotal.innerHTML  = data.prix_total !== null ? `${data.prix_total} $`  : '<span class="is-null">Non trouvé</span>';
  valDateEmb.innerHTML    = fmt(data.date_emballage);
  valMeilleurAv.innerHTML = fmt(data.meilleur_avant);
  valNotes.innerHTML      = fmt(data.notes);
}

/**
 * showError(message) — Affiche un message d'erreur dans la carte résultats.
 * @param {string} message — Texte d'erreur à afficher
 */
function showError(message) {
  errorText.textContent = message;
  errorBox.hidden = false;
  // Désactive le bouton Confirmer si on a une erreur
  btnConfirm.disabled = true;
}

/**
 * hideError() — Cache le message d'erreur.
 */
function hideError() {
  errorBox.hidden = true;
  btnConfirm.disabled = false;
}


/* ============================================================
   SECTION 8 : CONFIRMATION ET LOG
   Quand l'utilisateur clique "Confirmer", on sauvegarde l'entrée.
============================================================ */

/**
 * saveEntry(data) — Sauvegarde une entrée dans localStorage.
 * localStorage est un espace de stockage local au navigateur.
 * Les données persistent après fermeture du navigateur.
 * @param {Object} data — Données de l'étiquette à sauvegarder
 */
function saveEntry(data) {
  // Récupère les entrées existantes (ou tableau vide si c'est la première fois)
  const existing = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');

  // Crée la nouvelle entrée avec un timestamp
  const entry = {
    ...data,                                // Toutes les données de l'étiquette
    timestamp: new Date().toISOString(),    // Date/heure de la confirmation
    id: Date.now(),                         // Identifiant unique (timestamp en ms)
  };

  // Ajoute la nouvelle entrée au début de la liste
  existing.unshift(entry);

  // Sauvegarde dans localStorage
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(existing));

  console.log('💾 Entrée sauvegardée :', entry);

  // Met à jour l'affichage du log
  renderLog();
}

/**
 * renderLog() — Met à jour la liste d'entrées dans le log visible.
 * Lit les données depuis localStorage et génère le HTML.
 */
function renderLog() {
  const entries = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');

  // Met à jour le badge de compteur
  logCount.textContent = entries.length;

  if (entries.length === 0) {
    // Affiche le message "Aucune entrée"
    logEmpty.hidden = false;
    logList.innerHTML = '';
    return;
  }

  // Cache le message "Aucune entrée"
  logEmpty.hidden = true;

  // Génère le HTML pour chaque entrée
  logList.innerHTML = entries.map(entry => {
    // Formate la date de confirmation de façon lisible
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString('fr-CA') + ' ' + date.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });

    return `
      <li class="log-item" data-id="${entry.id}">
        <span class="log-item-coupe">${entry.coupe || 'Coupe inconnue'}</span>
        <span>${entry.poids_kg ? entry.poids_kg + ' kg' : ''} ${entry.prix_total ? '· ' + entry.prix_total + ' $' : ''}</span>
        <span>${dateStr}</span>
      </li>
    `;
  }).join('');
}


/* ============================================================
   SECTION 9 : GESTION DE L'INTERFACE (show/hide)
   Fonctions pour naviguer entre les différentes sections.
============================================================ */

/**
 * showCameraSection() — Affiche la section caméra, cache les résultats.
 */
function showCameraSection() {
  sectionCamera.hidden  = false;
  sectionResults.hidden = true;
  hideError();
  lastExtractedData = null;
}

/**
 * showResultsLoading() — Affiche la section résultats avec le spinner.
 * Appelée juste avant d'envoyer la requête à l'API.
 */
function showResultsLoading() {
  sectionCamera.hidden  = true;
  sectionResults.hidden = false;
  loaderWrapper.hidden  = false;
  resultsCard.hidden    = true;
  hideError();
}

/**
 * showResultsCard() — Cache le spinner et affiche la carte de résultats.
 * Appelée quand l'API a répondu avec succès.
 */
function showResultsCard() {
  loaderWrapper.hidden = true;
  resultsCard.hidden   = false;
}


/* ============================================================
   SECTION 10 : GESTIONNAIRES D'ÉVÉNEMENTS
   Ici on "écoute" les clics et actions de l'utilisateur.
============================================================ */

// ---------- BOUTON CAPTURE ----------
btnCapture.addEventListener('click', async () => {
  console.log('📸 Photo prise');

  // 1. Capture la photo depuis le flux vidéo
  const base64Image = capturePhoto();

  // 2. Bascule l'interface vers le mode "chargement"
  showResultsLoading();

  try {
    // 3. Envoie l'image à Claude et attend la réponse
    const data = await analyzeImageWithClaude(base64Image);

    // 4. Sauvegarde les données pour utilisation ultérieure (bouton Confirmer)
    lastExtractedData = data;

    // 5. Affiche les données dans le tableau
    displayResults(data);

    // 6. Cache le spinner, montre la carte
    showResultsCard();

  } catch (erreur) {
    // En cas d'erreur, on affiche quand même la carte mais avec le message d'erreur
    console.error('❌ Erreur lors de l\'analyse :', erreur);
    showResultsCard();
    showError(erreur.message);
  }
});

// ---------- BOUTON CONFIRMER ----------
btnConfirm.addEventListener('click', () => {
  if (!lastExtractedData) return;

  // Sauvegarde l'entrée dans le log
  saveEntry(lastExtractedData);

  // Feedback visuel bref
  btnConfirm.textContent = '✓ Enregistré !';
  btnConfirm.disabled = true;

  // Retour à la caméra après 1.5 secondes
  setTimeout(() => {
    btnConfirm.textContent = '✓ Confirmer et enregistrer';
    btnConfirm.disabled = false;
    showCameraSection();
  }, 1500);
});

// ---------- BOUTON RECOMMENCER ----------
btnRestart.addEventListener('click', () => {
  showCameraSection();
});

// ---------- TOGGLE DU LOG ----------
logToggle.addEventListener('click', () => {
  const isExpanded = logToggle.getAttribute('aria-expanded') === 'true';

  // Inverse l'état
  logToggle.setAttribute('aria-expanded', !isExpanded);
  logContent.hidden = isExpanded;
});

// ---------- EFFACER LE LOG ----------
btnClearLog.addEventListener('click', () => {
  if (!confirm('Effacer toutes les entrées enregistrées ?')) return;

  localStorage.removeItem(CONFIG.storageKey);
  renderLog();

  // Ferme le log après effacement
  logToggle.setAttribute('aria-expanded', 'false');
  logContent.hidden = true;
});

// ---------- OUVRIR LE MODAL PARAMÈTRES ----------
btnOpenSettings.addEventListener('click', () => {
  // Pré-remplit les champs avec les valeurs actuelles
  inputApiKey.value = CONFIG.apiKey;
  selectModel.value = CONFIG.model;
  settingsSavedMsg.hidden = true;

  modalOverlay.hidden = false;
});

// ---------- FERMER LE MODAL (bouton Annuler) ----------
btnCloseModal.addEventListener('click', () => {
  modalOverlay.hidden = true;
});

// ---------- FERMER LE MODAL (clic sur le fond) ----------
modalOverlay.addEventListener('click', (event) => {
  // Ferme seulement si on clique sur le fond, pas sur la carte
  if (event.target === modalOverlay) {
    modalOverlay.hidden = true;
  }
});

// ---------- FERMER LE MODAL (touche Escape) ----------
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modalOverlay.hidden) {
    modalOverlay.hidden = true;
  }
});

// ---------- SAUVEGARDER LES PARAMÈTRES ----------
btnSaveSettings.addEventListener('click', () => {
  const newKey   = inputApiKey.value.trim();
  const newModel = selectModel.value;

  // Validation basique : la clé doit commencer par "sk-ant"
  if (newKey && !newKey.startsWith('sk-ant')) {
    alert('La clé API semble invalide. Elle devrait commencer par "sk-ant-api03-…"');
    return;
  }

  // Sauvegarde dans localStorage
  localStorage.setItem('anthropic_api_key', newKey);
  localStorage.setItem('claude_model', newModel);

  // Met à jour la config en mémoire
  CONFIG.apiKey = newKey;
  CONFIG.model  = newModel;

  console.log('⚙️ Paramètres sauvegardés. Modèle :', newModel);

  // Affiche le message de confirmation
  settingsSavedMsg.hidden = false;

  // Ferme le modal après 1.5 secondes
  setTimeout(() => {
    modalOverlay.hidden = true;
    settingsSavedMsg.hidden = true;
  }, 1500);
});


/* ============================================================
   SECTION 11 : DÉMARRAGE DE L'APPLICATION
   Code exécuté au chargement de la page.
============================================================ */

// Attend que le DOM soit entièrement chargé avant de démarrer
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Application Scan Étiquette Lassonde démarrée');

  // Vérifie si le navigateur supporte getUserMedia (accès caméra)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    placeholder.innerHTML = `
      <span class="placeholder-icon">⚠️</span>
      <p>Votre navigateur ne supporte pas l'accès caméra.<br>
         Utilisez Chrome ou Safari sur iOS/Android.</p>
    `;
    return; // Arrête l'initialisation
  }

  // Initialise la caméra
  initCamera();

  // Charge et affiche les entrées existantes dans le log
  renderLog();

  // Alerte si aucune clé API n'est configurée
  if (!CONFIG.apiKey) {
    console.warn('⚠️ Aucune clé API configurée. Appuyez sur ⚙️ pour en ajouter une.');
  }
});
