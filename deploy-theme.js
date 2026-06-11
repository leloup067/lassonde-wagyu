#!/usr/bin/env node
// deploy-theme.js — Déploie le thème premium Lassonde sur Shopify
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE_URL;
const TOKEN   = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';

async function api(method, endpoint, body) {
  const r = await fetch(`https://${STORE}/admin/api/${VERSION}${endpoint}`, {
    method,
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

// ── CSS PREMIUM LASSONDE ──────────────────────────────────────────────────────
const CSS = `
/* ═══════════════════════════════════════════
   LASSONDE WAGYU — THÈME PREMIUM
   Fond noir · Accent or · Georgia serif
   ═══════════════════════════════════════════ */
:root {
  --bg:       #0a0a0a;
  --surface:  #141414;
  --surface2: #1e1e1e;
  --border:   #2a2a2a;
  --accent:   #c8a96e;
  --accent2:  #e8c98e;
  --text:     #f0ede8;
  --muted:    #777;
  --green:    #52b788;
  --green-bg: #1a3a2a;
}

/* Base */
body, html {
  background: var(--bg) !important;
  color: var(--text) !important;
  font-family: Georgia, 'Times New Roman', serif !important;
}

/* Header / Nav */
.site-header, header, .header, #shopify-section-header {
  background: rgba(10,10,10,0.96) !important;
  border-bottom: 0.5px solid var(--border) !important;
  backdrop-filter: blur(12px) !important;
}
.site-header a, header a, .header a, .header__heading-link {
  color: var(--text) !important;
  font-family: Georgia, serif !important;
}
.header__heading-link:hover, .header a:hover { color: var(--accent) !important; }

/* Logo */
.header__heading { font-family: Georgia, serif !important; letter-spacing: 0.08em !important; }

/* Navigation links */
.header__menu-item, .list-menu__item {
  font-family: Georgia, serif !important;
  font-size: 13px !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
  color: var(--muted) !important;
}
.header__menu-item:hover { color: var(--accent) !important; }

/* Boutons */
.btn, .button, button[type="submit"], .shopify-payment-button__button,
[class*="btn-"], .product-form__submit, .cart__checkout-button {
  background: var(--accent) !important;
  background-image: none !important;
  color: #0a0a0a !important;
  border: none !important;
  font-family: Georgia, serif !important;
  letter-spacing: 1px !important;
  text-transform: uppercase !important;
  font-size: 13px !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
.btn:hover, .button:hover, button[type="submit"]:hover {
  background: var(--accent2) !important;
  color: #0a0a0a !important;
}
.btn--secondary, .button--secondary {
  background: transparent !important;
  color: var(--accent) !important;
  border: 1px solid var(--accent) !important;
}

/* Cartes produit */
.card, .card-wrapper, .product-card, .grid__item .card,
[class*="card--"], .card--product {
  background: var(--surface) !important;
  border: 0.5px solid var(--border) !important;
  border-radius: 10px !important;
  overflow: hidden !important;
  transition: border-color 0.25s ease, transform 0.2s ease !important;
}
.card:hover, .card-wrapper:hover, .card--product:hover {
  border-color: var(--accent) !important;
}
.card__inner, .card__content { background: var(--surface) !important; }
.card__heading, .card__heading a {
  color: var(--text) !important;
  font-family: Georgia, serif !important;
  font-size: 14px !important;
  letter-spacing: 0.04em !important;
}

/* Prix */
.price, .price__regular, .price__sale, [class*="price"],
.price-item, .price-item--regular {
  color: var(--accent) !important;
  font-family: Georgia, serif !important;
  font-size: 18px !important;
}
.price__unit { color: var(--muted) !important; font-size: 12px !important; }

/* Sections */
.shopify-section, section, .section { background: var(--bg) !important; }
.color-background-1, .color-base, .color-scheme-1, [class*="color-background"] {
  background: var(--bg) !important;
  color: var(--text) !important;
}

/* Titres */
h1, h2, h3, h4, h5, h6 {
  font-family: Georgia, serif !important;
  color: var(--text) !important;
  font-weight: 400 !important;
  letter-spacing: 0.04em !important;
}

/* Textes */
p, span, li, a { color: var(--text) !important; font-family: Georgia, serif !important; }
.caption, small, [class*="caption"] { color: var(--muted) !important; }

/* Inputs */
input, select, textarea, .field__input, .select__select {
  background: var(--surface2) !important;
  border: 0.5px solid var(--border) !important;
  border-radius: 6px !important;
  color: var(--text) !important;
  font-family: Georgia, serif !important;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--accent) !important;
  outline: none !important;
  box-shadow: 0 0 0 2px rgba(200,169,110,0.12) !important;
}

/* Grille collections */
.collections-grid, .collection-list {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
  gap: 16px !important;
}

/* Collection cards */
.collection-list__item, .collection-card {
  background: var(--surface) !important;
  border: 0.5px solid var(--border) !important;
  border-radius: 10px !important;
  overflow: hidden !important;
  transition: border-color 0.25s !important;
}
.collection-list__item:hover { border-color: var(--accent) !important; }

/* Badge Halal */
.badge-halal {
  background: var(--green-bg) !important;
  color: var(--green) !important;
  font-size: 10px !important;
  font-family: Georgia, serif !important;
  padding: 3px 10px !important;
  border-radius: 20px !important;
  letter-spacing: 1px !important;
  text-transform: uppercase !important;
  display: inline-block !important;
}

/* Footer */
footer, .footer, #shopify-section-footer {
  background: var(--surface) !important;
  border-top: 0.5px solid var(--border) !important;
}
footer a, .footer a, .footer__list-item a { color: var(--muted) !important; }
footer a:hover, .footer a:hover { color: var(--accent) !important; }

/* Panier / Cart */
.cart, .cart-drawer, .cart__empty-text, .totals {
  background: var(--bg) !important;
  color: var(--text) !important;
}
.cart__item, .cart-item { border-color: var(--border) !important; }
.cart-drawer { background: var(--surface) !important; border-left: 0.5px solid var(--border) !important; }

/* Breadcrumb */
.breadcrumbs, .breadcrumb { color: var(--muted) !important; }
.breadcrumb a { color: var(--muted) !important; }

/* Pagination */
.pagination { background: transparent !important; }
.pagination__list-item a { color: var(--accent) !important; border-color: var(--border) !important; background: var(--surface) !important; }
.pagination__list-item--current a { background: var(--accent) !important; color: #0a0a0a !important; }

/* Media / images */
.media, .card__media { background: var(--surface2) !important; }

/* Ligne décorative or */
.accent-line {
  width: 60px; height: 1px;
  background: var(--accent);
  margin: 20px auto;
  display: block;
}

/* Utilitaires */
.text-gold { color: var(--accent) !important; }
.text-muted { color: var(--muted) !important; }
.bg-surface { background: var(--surface) !important; }
`;

// ── HERO SECTION LIQUID ───────────────────────────────────────────────────────
const HERO_LIQUID = `
<style>
.lassonde-hero {
  min-height: 90vh;
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 24px;
  position: relative;
  overflow: hidden;
}
.lassonde-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 50% 40%, rgba(200,169,110,0.06) 0%, transparent 70%);
  pointer-events: none;
}
.hero-halal-badge {
  background: #1a3a2a;
  color: #52b788;
  font-size: 11px;
  font-family: Georgia, serif;
  padding: 5px 16px;
  border-radius: 20px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 32px;
  display: inline-block;
  border: 0.5px solid rgba(82,183,136,0.3);
}
.lassonde-hero h1 {
  font-size: clamp(28px, 5.5vw, 68px);
  color: #f0ede8;
  font-weight: 400;
  letter-spacing: 2px;
  font-family: Georgia, serif;
  margin-bottom: 12px;
  line-height: 1.2;
}
.hero-sub {
  color: #666;
  letter-spacing: 3px;
  text-transform: uppercase;
  font-size: 11px;
  font-family: Georgia, serif;
  margin-bottom: 0;
}
.hero-line {
  width: 50px;
  height: 1px;
  background: #c8a96e;
  margin: 24px auto;
  display: block;
}
.hero-cta {
  margin-top: 36px;
  padding: 14px 36px;
  background: #c8a96e;
  color: #0a0a0a !important;
  text-decoration: none !important;
  font-family: Georgia, serif;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-size: 12px;
  display: inline-block;
  transition: background 0.2s;
}
.hero-cta:hover { background: #e8c98e !important; color: #0a0a0a !important; }
.hero-badges {
  display: flex;
  gap: 10px;
  margin-top: 36px;
  flex-wrap: wrap;
  justify-content: center;
}
.hero-badge-item {
  background: #141414;
  border: 0.5px solid #2a2a2a;
  color: #666 !important;
  font-size: 11px;
  padding: 6px 14px;
  border-radius: 20px;
  letter-spacing: 1px;
  font-family: Georgia, serif;
}
.hero-values {
  display: flex;
  gap: 48px;
  margin-top: 64px;
  padding-top: 48px;
  border-top: 0.5px solid #2a2a2a;
  flex-wrap: wrap;
  justify-content: center;
}
.hero-value-item { text-align: center; }
.hero-value-num {
  font-size: 28px;
  color: #c8a96e;
  font-family: Georgia, serif;
  display: block;
  margin-bottom: 4px;
}
.hero-value-label {
  font-size: 10px;
  color: #555;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-family: Georgia, serif;
}
</style>

<div class="lassonde-hero">
  <div class="hero-halal-badge">☪ FAMBRAS · Halal Certifié</div>
  <h1>{{ section.settings.titre }}</h1>
  <span class="hero-line"></span>
  <p class="hero-sub">{{ section.settings.sous_titre }}</p>
  <a href="/collections/all" class="hero-cta">Découvrir nos coupes</a>
  <div class="hero-badges">
    <span class="hero-badge-item">Wagyu Premium</span>
    <span class="hero-badge-item">Élevé au Québec</span>
    <span class="hero-badge-item">Sous-vide congelé</span>
    <span class="hero-badge-item">Livraison isotherme</span>
  </div>
  <div class="hero-values">
    <div class="hero-value-item">
      <span class="hero-value-num">44</span>
      <span class="hero-value-label">Coupes disponibles</span>
    </div>
    <div class="hero-value-item">
      <span class="hero-value-num">2-3 ans</span>
      <span class="hero-value-label">D'élevage par bœuf</span>
    </div>
    <div class="hero-value-item">
      <span class="hero-value-num">FAMBRAS</span>
      <span class="hero-value-label">Certification Halal</span>
    </div>
    <div class="hero-value-item">
      <span class="hero-value-num">Repentigny</span>
      <span class="hero-value-label">Québec, Canada</span>
    </div>
  </div>
</div>

{% schema %}
{
  "name": "Hero Lassonde",
  "settings": [
    {"type":"text","id":"titre","label":"Titre","default":"Wagyu Halal.\\nÉlevé au Québec."},
    {"type":"text","id":"sous_titre","label":"Sous-titre","default":"Certifié FAMBRAS — Repentigny, Québec"}
  ],
  "presets": [{"name":"Hero Lassonde"}]
}
{% endschema %}
`;

// ── SECTION STORYTELLING ─────────────────────────────────────────────────────
const STORY_LIQUID = `
<style>
.lassonde-story {
  background: #0a0a0a;
  padding: 80px 24px;
  text-align: center;
  border-top: 0.5px solid #2a2a2a;
}
.story-inner { max-width: 640px; margin: 0 auto; }
.story-label {
  font-size: 10px;
  color: #c8a96e;
  letter-spacing: 3px;
  text-transform: uppercase;
  font-family: Georgia, serif;
  margin-bottom: 16px;
  display: block;
}
.story-title {
  font-size: clamp(22px, 3.5vw, 38px);
  color: #f0ede8;
  font-family: Georgia, serif;
  font-weight: 400;
  line-height: 1.4;
  margin-bottom: 20px;
}
.story-text {
  font-size: 15px;
  color: #666;
  line-height: 1.8;
  font-family: Georgia, serif;
  margin-bottom: 12px;
}
.story-address {
  font-size: 12px;
  color: #444;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-family: Georgia, serif;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 0.5px solid #2a2a2a;
}
</style>
<div class="lassonde-story">
  <div class="story-inner">
    <span class="story-label">Notre histoire</span>
    <h2 class="story-title">{{ section.settings.titre }}</h2>
    <p class="story-text">{{ section.settings.texte }}</p>
    <p class="story-address">{{ section.settings.adresse }}</p>
  </div>
</div>
{% schema %}
{
  "name": "Storytelling Lassonde",
  "settings": [
    {"type":"text","id":"titre","label":"Titre","default":"Élevé avec soin, à Repentigny."},
    {"type":"textarea","id":"texte","label":"Texte","default":"Chaque bœuf Wagyu passe 2 à 3 ans sur notre ferme de Repentigny avant d'atteindre votre table. Une alimentation soignée, un abattage islamique certifié FAMBRAS, et un emballage sous-vide immédiat — pour une viande d'exception à chaque fois."},
    {"type":"text","id":"adresse","label":"Adresse","default":"255 ch. de la Presqu'île, Repentigny, Québec J5Z 4C7"}
  ],
  "presets": [{"name":"Storytelling Lassonde"}]
}
{% endschema %}
`;

// ── DEPLOY ────────────────────────────────────────────────────────────────────
async function deployTheme() {
  console.log('🎨 Déploiement thème Lassonde...\n');

  // Thème actif
  const themes = await api('GET', '/themes.json');
  const active = themes.themes.find(t => t.role === 'main');
  console.log(`✅ Thème actif : "${active.name}" — ID: ${active.id}`);
  const tid = active.id;

  // 1. CSS
  await api('PUT', `/themes/${tid}/assets.json`, {
    asset: { key: 'assets/lassonde-custom.css', value: CSS }
  });
  console.log('✅ CSS premium créé (assets/lassonde-custom.css)');

  // 2. Hero section
  await api('PUT', `/themes/${tid}/assets.json`, {
    asset: { key: 'sections/lassonde-hero.liquid', value: HERO_LIQUID }
  });
  console.log('✅ Section Hero créée (sections/lassonde-hero.liquid)');

  // 3. Storytelling section
  await api('PUT', `/themes/${tid}/assets.json`, {
    asset: { key: 'sections/lassonde-story.liquid', value: STORY_LIQUID }
  });
  console.log('✅ Section Storytelling créée (sections/lassonde-story.liquid)');

  // 4. Injecte le CSS dans theme.liquid
  const themeAsset = await api('GET', `/themes/${tid}/assets.json?asset[key]=layout/theme.liquid`);
  let themeHtml = themeAsset.asset.value;

  if (!themeHtml.includes('lassonde-custom.css')) {
    themeHtml = themeHtml.replace(
      '</head>',
      `  {{ 'lassonde-custom.css' | asset_url | stylesheet_tag }}\n</head>`
    );
    await api('PUT', `/themes/${tid}/assets.json`, {
      asset: { key: 'layout/theme.liquid', value: themeHtml }
    });
    console.log('✅ CSS lié dans layout/theme.liquid');
  } else {
    console.log('ℹ️  CSS déjà lié dans theme.liquid');
  }

  console.log('\n🎉 THÈME DÉPLOYÉ AVEC SUCCÈS');
  console.log(`🔗 Store : https://${STORE}`);
  console.log(`🔗 Admin  : https://admin.shopify.com/store/lassonde-wagyu-test/themes/${tid}/editor`);
}

deployTheme().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
