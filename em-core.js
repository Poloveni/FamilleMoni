// ─────────────────────────────────────────────────────────────────────────────
//  em-core.js — le socle de l'espace membre : connexion (Supabase, e-mail ou
//  Discord), validation du compte, navigation entre panneaux dans la coque du
//  modèle Roxwood Network (rail, onglets du téléphone : espace.js), tirer-pour-
//  actualiser, mode TV.
//
//  Ce fichier ne sait rien des données : les panneaux « bot » sont remplis par
//  em-bot.js (API REST du bot via l'Edge Function bot-suivi), les panneaux
//  « site » (profil, galerie, planning, hiérarchie) par em-site.js. Il ne fait
//  qu'ouvrir le bon panneau et prévenir le bon module.
//
//  Chargé en premier, en fin de <body> : les autres modules s'appuient sur ses
//  globales (sb, currentUser, currentNom, isApproved, escT, toast, showPanel…).
// ─────────────────────────────────────────────────────────────────────────────
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

let mode = 'login';
let currentUser = null;
let pendingFile = null;
let currentPhotoUrl = null;
let currentNom = '';
let isApproved = false;

/** Panneaux alimentés par l'API du bot (em-bot.js) — tout le reste vient du site. */
const BOT_PANELS = ['moi', 'famille', 'stocks', 'armurerie', 'braquages', 'garage', 'taxes', 'bilan'];

// ── OUTILS ──────────────────────────────────────────────────────────────────
function escT(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function fmtArgent(n) { return '$' + Number(n || 0).toLocaleString('fr-FR'); }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function showMsg(id, text, ok) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'error'); }
}
function hideMsg(id) { const el = document.getElementById(id); if (el) el.className = 'msg'; }
// toast(texte) = succès ; toast(texte, 'err') = erreur (reste plus longtemps). Même toast que le modèle (espace.js).
function toast(t, type) { espaceToast(t, type !== 'err'); }

// Sous-titre par défaut : la semaine du bot (reset dimanche 19h).
(function weekLabel() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const fin = new Date(d); fin.setDate(fin.getDate() + 6);
  const f = x => x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  window.__semaineTxt = 'Du ' + f(d) + ' au ' + f(fin) + ' · remise à zéro dimanche 19h';
  const el = document.getElementById('dash-week');
  if (el) el.textContent = window.__semaineTxt;
})();

// ── NAVIGATION ENTRE PANNEAUX ───────────────────────────────────────────────
// Accès « taxes uniquement » (comptes.acces = 'taxes' ou rôle Discord
// gérant des taxes, réunis dans est_gerant_taxes()) : le compte ne voit QUE
// le panneau Taxes. Côté données, l'Edge Function bot-suivi applique la même
// règle (seules les routes taxes sont relayées) — ceci n'est que l'affichage.
let modeGerantTaxes = false;
function activerModeGerantTaxes() {
  if (modeGerantTaxes) return;
  modeGerantTaxes = true;
  document.querySelectorAll('.rail__lien[data-panel], .onglets [data-panel]').forEach(el => { el.hidden = el.dataset.panel !== 'taxes'; });
  // un groupe du rail sans rubrique visible disparaît avec son titre
  document.querySelectorAll('.rail__groupe').forEach(g => { g.hidden = ![...g.querySelectorAll('.rail__lien')].some(a => !a.hidden); });
  const tv = document.getElementById('tv-btn'); if (tv) tv.hidden = true;
  if (!isApproved) return;
  ouvrirPanneau('taxes');
}

function showPanel(name, options) {
  if (modeGerantTaxes && name !== 'taxes' && name !== 'pending') name = 'taxes';
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('panel-' + name);
  if (target) target.classList.add('active');
  const nav = espaceActive(name);
  const titleEl = document.getElementById('dash-title');
  const sousEl = document.getElementById('dash-week');
  if (nav) {
    if (titleEl) titleEl.textContent = nav.dataset.title;
    if (sousEl) sousEl.textContent = nav.dataset.sub || window.__semaineTxt || '';
  }
  if (name !== 'pending') {
    try { localStorage.setItem('moni-panel', name); } catch (e) {}
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
  }
  if (typeof espaceRailFerme === 'function') espaceRailFerme();
  if (!(options && options.silencieux)) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (typeof redessinerGraphiques === 'function') requestAnimationFrame(redessinerGraphiques);
}

/** Ouvre un panneau ET déclenche son chargement (bot ou site). C'est le point d'entrée à utiliser partout. */
function ouvrirPanneau(name, options) {
  showPanel(name, options);
  if (!isApproved && name !== 'pending') return;
  if (BOT_PANELS.includes(name) && window.emBot) window.emBot.ouvrir(name);
  if (name === 'galerie' && typeof loadGalerieRecentes === 'function') loadGalerieRecentes();
  if (name === 'events' && typeof loadEvents === 'function') loadEvents();
}

/** Recharge ce qui est à l'écran (tirer-pour-actualiser, bouton Actualiser, mode TV). */
async function actualiserTout() {
  const taches = [];
  if (window.emBot) taches.push(window.emBot.actualiser());
  if (typeof loadEvents === 'function') taches.push(loadEvents());
  try { await Promise.allSettled(taches); } catch (e) {}
}

function nmVib() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }

// ── Tirer vers le bas pour actualiser (mobile, en haut de page) ────────────
(function tirerPourActualiser() {
  if (!('ontouchstart' in window)) return;
  const ptr = document.createElement('div');
  ptr.id = 'ptr';
  ptr.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>';
  document.body.appendChild(ptr);
  let y0 = null, tirage = 0, enCours = false;
  window.addEventListener('touchstart', e => {
    if (enCours || window.innerWidth > 900 || document.body.classList.contains('tv-mode')) return;
    if ((window.scrollY || 0) > 2) return;
    if (!document.body.classList.contains('is-in')) return;
    const rail = document.getElementById('rail');
    if (rail && rail.classList.contains('is-open')) return;
    y0 = e.touches[0].clientY; tirage = 0;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (y0 === null || enCours) return;
    tirage = e.touches[0].clientY - y0;
    if (tirage > 10) ptr.style.transform = 'translate(-50%, ' + Math.min(tirage * 0.45, 62) + 'px)';
  }, { passive: true });
  window.addEventListener('touchend', async () => {
    if (y0 === null) return;
    const assez = tirage > 75; y0 = null;
    if (!assez) { ptr.style.transform = 'translate(-50%, -56px)'; return; }
    enCours = true; nmVib();
    ptr.classList.add('actif'); ptr.style.transform = 'translate(-50%, 48px)';
    await actualiserTout();
    ptr.classList.remove('actif'); ptr.style.transform = 'translate(-50%, -56px)';
    enCours = false;
    toast('✓ Données actualisées');
  });
})();

// Rubriques du rail et onglets du téléphone : un clic ouvre le panneau (les rubriques réservées attendent la validation du compte)
document.addEventListener('click', e => {
  const a = e.target.closest('[data-panel]');
  if (!a || !a.closest('.rail, .onglets')) return;
  e.preventDefault();
  if (!isApproved && a.dataset.req) { toast('Compte en attente de validation.', 'err'); return; }
  nmVib();
  ouvrirPanneau(a.dataset.panel);
});

// ── AUTH ────────────────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('auth-btn').textContent = m === 'login' ? 'Se connecter' : 'Créer mon compte';
  document.getElementById('auth-sub').textContent = m === 'login'
    ? 'Réservé aux membres de la famille. Connecte-toi avec le compte Discord qui est sur le serveur : c’est lui qui te relie au bot Moni et à ton rôle.'
    : 'Crée ton compte pour rejoindre l’espace membre : un administrateur devra le valider.';
  document.getElementById('auth-switch').innerHTML = m === 'login'
    ? 'Pas encore de compte ? <button type="button" class="lien" onclick="setMode(\'signup\')">Créer un compte</button>'
    : 'Déjà un compte ? <button type="button" class="lien" onclick="setMode(\'login\')">Se connecter</button>';
  hideMsg('auth-msg');
}

async function doAuth() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) { showMsg('auth-msg', 'Email et mot de passe requis.', false); return; }
  hideMsg('auth-msg');
  if (mode === 'signup') {
    // emailRedirectTo : le lien de confirmation revient sur CE site (le
    // « Site URL » du projet Supabase est réservé à un autre site).
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) { showMsg('auth-msg', error.message, false); return; }
    if (!data.session) {
      showMsg('auth-msg', 'Compte créé ! Vérifie ta boîte mail pour confirmer, puis connecte-toi.', true);
      setMode('login');
      return;
    }
    onLogged(data.user);
  } else {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { showMsg('auth-msg', error.message, false); return; }
    onLogged(data.user);
  }
}

// ── Connexion par le bot : un seul écran Discord (Moni V3) pour le site et le bot ──
// L'adresse de départ vient de la passerelle ; si elle ne répond pas ou n'est
// pas configurée, on replie sur la connexion par e-mail.
let botLoginUrl = null;
(async function preparerConnexionBot() {
  const btn = document.getElementById('auth-bot'), hint = document.getElementById('auth-bot-hint');
  if (!btn) return;
  try {
    const r = await fetch(String(window.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/bot-suivi', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.SUPABASE_KEY || '' }, body: JSON.stringify({ action: 'config' }),
    });
    const d = await r.json();
    if (d && d.ok && d.configured && d.loginUrl) { botLoginUrl = d.loginUrl; btn.href = botLoginUrl; return; }
    throw new Error(d && d.configured === false ? 'non configurée' : 'réponse inattendue');
  } catch (e) {
    btn.classList.add('indispo');
    if (hint) hint.textContent = 'Connexion par le bot indisponible pour le moment (' + (e && e.message || e) + '). Utilise la connexion par e-mail ci-dessous, ou réessaie plus tard.';
    const sec = document.getElementById('auth-secours'); if (sec) sec.open = true;
  }
})();
function connexionParLeBot(ev) {
  if (ev) ev.preventDefault();
  hideMsg('auth-msg');
  if (!botLoginUrl) { showMsg('auth-msg', "La connexion par le bot n'est pas disponible : utilise la connexion par e-mail ci-dessous.", false); return false; }
  const lbl = document.getElementById('auth-bot-lbl'); if (lbl) lbl.textContent = 'Redirection vers Discord…';
  window.location.href = botLoginUrl;
  return false;
}

async function doLogout() {
  await sb.auth.signOut();
  currentUser = null;
  document.body.classList.remove('is-in');
  document.getElementById('member-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
}

async function motDePasseOublie() {
  const email = document.getElementById('email').value.trim();
  if (!email) { showMsg('auth-msg', "Écris d'abord ton email dans le champ ci-dessus, puis reclique sur « Mot de passe oublié ? ».", false); return; }
  hideMsg('auth-msg');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
  if (error) { showMsg('auth-msg', 'Erreur : ' + error.message, false); return; }
  showMsg('auth-msg', '📬 Email envoyé à ' + email + ' ! Clique le lien dedans pour choisir un nouveau mot de passe (regarde aussi les spams).', true);
}
function showResetForm() {
  document.body.classList.remove('is-in');
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('member-screen').style.display = 'none';
  document.getElementById('reset-screen').style.display = 'flex';
}
async function validerNouveauMdp() {
  const pwd = document.getElementById('new-password').value;
  if (!pwd || pwd.length < 8) { showMsg('reset-msg', '8 caractères minimum.', false); return; }
  const { error } = await sb.auth.updateUser({ password: pwd });
  if (error) { showMsg('reset-msg', error.message, false); return; }
  document.getElementById('reset-screen').style.display = 'none';
  document.getElementById('new-password').value = '';
  toast('Mot de passe changé !');
  const { data } = await sb.auth.getSession();
  if (data.session) onLogged(data.session.user);
  else document.getElementById('auth-screen').style.display = 'flex';
}

// ── Carte du membre en bas du rail : nom RP (à défaut pseudo Discord ou e-mail), rang, photo ──
function majRailMoi() {
  if (!currentUser) return;
  const meta = currentUser.user_metadata || {};
  const viaBot = /@bot\.famillemoni\.com$/i.test(currentUser.email || '');
  const nom = currentNom || meta.user_name || meta.full_name || (viaBot ? 'membre Discord' : currentUser.email);
  const m = (window.MONI_MEMBRES || []).find(x => x.nom === currentNom);
  espaceNav({
    nom,
    grade: !isApproved ? 'En attente' : (m ? m.rang : (modeGerantTaxes ? 'Gérant des taxes' : 'Sans rang')),
    avatar: currentPhotoUrl || meta.avatar_url || meta.picture || 'icon-192.png',
  });
}

// ── SÉQUENCE DE CONNEXION ───────────────────────────────────────────────────
async function onLogged(user) {
  currentUser = user;
  await chargerHierarchie();
  remplirNoms();
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('reset-screen').style.display = 'none';
  document.getElementById('member-screen').style.display = 'block';
  document.body.classList.add('is-in');
  majRailMoi();
  const gestion = document.getElementById('gestion'), navAdmin = document.getElementById('nav-admin');
  const admin = user.email === 'syne@live.fr';
  if (gestion) gestion.hidden = !admin;
  if (navAdmin) navAdmin.hidden = !admin;
  // Les droits viennent de la base, qui applique exactement les mêmes fonctions
  // que ses règles de sécurité : l'affichage ne peut pas diverger de la réalité.
  sb.rpc('peut_gerer_hierarchie').then(({ data, error }) => {
    if (error) { console.warn('[hierarchie] vérification impossible :', error.message); return; }
    const b = document.getElementById('nav-hierarchie');
    if (b) b.hidden = data !== true;
    if (data === true) hierRender();
  });
  sb.rpc('est_gerant_taxes').then(({ data, error }) => {
    if (error) { console.warn('[taxes] vérification gérant impossible :', error.message); return; }
    if (data === true) { activerModeGerantTaxes(); majRailMoi(); }
  });

  // Un seul aller-retour : on écrit et on relit la colonne dans la même requête.
  const { data: compte } = await sb.from('comptes')
    .upsert({ id: user.id, email: user.email })
    .select('approuve').maybeSingle();
  isApproved = !!(compte && compte.approuve);

  if (!isApproved) {
    showPanel('pending');
    document.getElementById('dash-num').textContent = 'Compte';
    document.getElementById('dash-title').textContent = 'En attente';
    document.getElementById('dash-week').textContent = 'Un administrateur doit valider ton compte.';
    if (window.emBot) window.emBot.etatCompteAttente();
    majRailMoi();
    return;
  }
  // « Ma semaine » d'abord ; si le membre avait quitté ailleurs (ou arrive avec #rubrique), on l'y remet.
  let panneau = 'moi';
  try { panneau = location.hash.slice(1) || localStorage.getItem('moni-panel') || 'moi'; } catch (e) {}
  const lienPanneau = document.querySelector('.rail__lien[data-panel="' + panneau + '"]');
  if (!lienPanneau || lienPanneau.hidden) panneau = 'moi';
  await loadProfil();
  majRailMoi();
  if (window.emBot) await window.emBot.demarrer();
  ouvrirPanneau(panneau, { silencieux: true });
  loadEvents();
}

// ── MODE TV (plein écran auto-défilant) ─────────────────────────────────────
let tvRot = null, tvRef = null, tvIdx = 0;
const TV_PANELS = ['famille', 'stocks', 'braquages'];
function startTV() {
  document.body.classList.add('tv-mode');
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  tvIdx = 0;
  ouvrirPanneau(TV_PANELS[0]);
  clearInterval(tvRot); clearInterval(tvRef);
  tvRot = setInterval(() => { tvIdx = (tvIdx + 1) % TV_PANELS.length; ouvrirPanneau(TV_PANELS[tvIdx]); }, 14000);
  tvRef = setInterval(() => actualiserTout(), 120000);
}
function stopTV() {
  if (!document.body.classList.contains('tv-mode')) return;
  document.body.classList.remove('tv-mode');
  clearInterval(tvRot); clearInterval(tvRef); tvRot = tvRef = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  ouvrirPanneau('famille');
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) stopTV(); });
(function tvInit() {
  const btn = document.getElementById('tv-btn');
  if (btn) btn.addEventListener('click', () => { if (isApproved) startTV(); else toast('Compte en attente de validation.', 'err'); });
  const out = document.getElementById('logout');
  if (out) out.addEventListener('click', doLogout);
})();

// ── DÉMARRAGE ───────────────────────────────────────────────────────────────
sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') showResetForm();
});
// Session existante au chargement — une fois TOUS les modules chargés
// (em-site.js définit chargerHierarchie/loadProfil, em-bot.js window.emBot) :
// les scripts de fin de page s'exécutent avant DOMContentLoaded.
async function demarrerEspaceMembre() {
  const { data } = await sb.auth.getSession();
  if (data.session) onLogged(data.session.user);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrerEspaceMembre);
else demarrerEspaceMembre();
