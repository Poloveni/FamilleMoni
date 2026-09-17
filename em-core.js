// ─────────────────────────────────────────────────────────────────────────────
//  em-core.js — le socle de l'espace membre : connexion (Supabase, e-mail ou
//  Discord), validation du compte, menu latéral, navigation entre panneaux,
//  barre mobile, tirer-pour-actualiser, mode TV.
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
const BOT_PANELS = ['moi', 'famille', 'stocks', 'armurerie', 'braquages', 'taxes', 'bilan'];

// ── OUTILS ──────────────────────────────────────────────────────────────────
function escT(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function fmtArgent(n) { return '$' + Number(n || 0).toLocaleString('fr-FR'); }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function showMsg(id, text, ok) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'error'); }
}
function hideMsg(id) { const el = document.getElementById(id); if (el) el.className = 'msg'; }
// toast(texte) = succès ; toast(texte, 'err') = erreur (reste plus longtemps).
function toast(t, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = t; el.classList.toggle('err', type === 'err'); el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), type === 'err' ? 4200 : 2600);
}

// ── Menu latéral : sections repliables + mode réduit ───────────────────────
// Les sections fermées et le mode choisi sont mémorisés. Le mode réduit
// (icônes seules) s'active tout seul entre 861 et 1180 px, sauf si
// l'utilisateur a cliqué sur le bouton pour choisir lui-même.
(function initSidebar() {
  const nav = document.getElementById('sb-nav');
  if (!nav) return;
  let fermes = [];
  try { fermes = JSON.parse(localStorage.getItem('moni-sb-fermes') || '[]'); } catch (e) {}
  if (!Array.isArray(fermes)) fermes = [];
  nav.querySelectorAll('.sb-sect').forEach(sect => {
    const btn = sect.querySelector('.sb-group');
    const key = sect.dataset.sect;
    if (!btn || !key) return;
    const poser = ferme => { sect.classList.toggle('closed', ferme); btn.setAttribute('aria-expanded', ferme ? 'false' : 'true'); };
    poser(fermes.includes(key));
    btn.addEventListener('click', () => {
      const ferme = !sect.classList.contains('closed');
      poser(ferme);
      fermes = fermes.filter(k => k !== key); if (ferme) fermes.push(key);
      try { localStorage.setItem('moni-sb-fermes', JSON.stringify(fermes)); } catch (e) {}
    });
  });
  const mq = window.matchMedia('(min-width: 861px) and (max-width: 1180px)');
  const toggle = document.getElementById('sb-toggle');
  function appliquer() {
    let pref = null;
    try { pref = localStorage.getItem('moni-sb-mode'); } catch (e) {}
    const mini = pref === 'mini' || (pref !== 'large' && mq.matches);
    document.body.classList.toggle('sb-mini', mini);
    nav.querySelectorAll('.sb-item, .sb-out').forEach(el => {
      const l = el.querySelector('.lbl');
      if (l) { if (mini) el.title = l.textContent.trim(); else el.removeAttribute('title'); }
    });
    if (toggle) { const t = mini ? 'Déployer le menu' : 'Réduire le menu'; toggle.setAttribute('aria-label', t); toggle.title = t; }
  }
  appliquer();
  if (mq.addEventListener) mq.addEventListener('change', appliquer); else mq.addListener(appliquer);
  if (toggle) toggle.addEventListener('click', () => {
    const mini = document.body.classList.contains('sb-mini');
    try { localStorage.setItem('moni-sb-mode', mini ? 'large' : 'mini'); } catch (e) {}
    appliquer();
  });
})();

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
  document.querySelectorAll('.sb-item').forEach(el => {
    const garder = el.dataset.panel === 'taxes' ||
      (el.tagName === 'A' && (el.getAttribute('href') || '') === 'accueil.html');
    if (!garder) el.style.display = 'none';
  });
  document.querySelectorAll('.sb-group').forEach(g => { g.style.display = 'none'; });
  const sbTaxes = document.getElementById('sb-taxes');
  if (sbTaxes) sbTaxes.style.display = '';
  if (!isApproved) return;
  ouvrirPanneau('taxes');
}

function showPanel(name) {
  if (modeGerantTaxes && name !== 'taxes' && name !== 'pending') name = 'taxes';
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('panel-' + name);
  if (target) target.classList.add('active');
  document.querySelectorAll('.sb-item[data-panel]').forEach(i => i.classList.toggle('active', i.dataset.panel === name));
  const nav = document.querySelector('.sb-item[data-panel="' + name + '"]');
  const sect = nav && nav.closest('.sb-sect');
  if (sect && sect.classList.contains('closed')) { const g = sect.querySelector('.sb-group'); if (g) g.click(); }
  const titleEl = document.getElementById('dash-title');
  if (nav && nav.dataset.title && titleEl) titleEl.innerHTML = nav.dataset.title.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const sousEl = document.getElementById('dash-week');
  if (sousEl) sousEl.textContent = (nav && nav.dataset.sub) || window.__semaineTxt || '';
  if (name !== 'pending') { try { localStorage.setItem('moni-panel', name); } catch (e) {} }
  majNavMobile();
  if (typeof redessinerGraphiques === 'function') requestAnimationFrame(redessinerGraphiques);
}

/** Ouvre un panneau ET déclenche son chargement (bot ou site). C'est le point d'entrée à utiliser partout. */
function ouvrirPanneau(name) {
  showPanel(name);
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
    if (enCours || window.innerWidth > 860 || document.body.classList.contains('tv-mode')) return;
    if ((window.scrollY || 0) > 2) return;
    const ecran = document.getElementById('member-screen');
    if (!ecran || ecran.style.display === 'none') return;
    if (document.getElementById('nav-plus') && !document.getElementById('nav-plus').hidden) return;
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

// ── Navigation mobile « application » ───────────────────────────────────────
const NM_PRINCIPAUX = ['moi', 'famille', 'stocks', 'braquages'];
const NM_LBLS = { moi: 'Ma semaine', famille: 'Famille', stocks: 'Stocks', armurerie: 'Armes', braquages: 'Braquages', taxes: 'Taxes', bilan: 'Bilan', profil: 'Profil', events: 'Planning', galerie: 'Galerie', hierarchie: 'Rangs' };
const NM_ICO_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
function nmVisibles() {
  return [...document.querySelectorAll('.sb-nav .sb-item[data-panel]')].filter(b => b.style.display !== 'none');
}
function majNavMobile() {
  const bar = document.getElementById('nav-mobile');
  if (!bar) return;
  const visibles = nmVisibles();
  const principaux = NM_PRINCIPAUX.map(p => visibles.find(b => b.dataset.panel === p)).filter(Boolean);
  (visibles.filter(b => !principaux.includes(b)).slice(0, 4 - principaux.length)).forEach(b => principaux.push(b));
  bar.innerHTML = principaux.map(b =>
    '<button type="button" class="nm-item' + (b.classList.contains('active') ? ' active' : '') + '" data-cible="' + b.dataset.panel + '">' +
      (b.querySelector('.ico') ? b.querySelector('.ico').innerHTML : '') +
      '<span>' + escT(NM_LBLS[b.dataset.panel] || (b.querySelector('.lbl') ? b.querySelector('.lbl').textContent : b.dataset.panel)) + '</span></button>'
  ).join('') +
  '<button type="button" class="nm-item" id="nm-plus">' + NM_ICO_PLUS + '<span>Plus</span></button>';
  bar.querySelectorAll('.nm-item[data-cible]').forEach(x => x.addEventListener('click', () => {
    nmVib();
    const src = document.querySelector('.sb-nav .sb-item[data-panel="' + x.dataset.cible + '"]');
    if (src) src.click();
  }));
  document.getElementById('nm-plus').addEventListener('click', () => { nmVib(); ouvrirNavPlus(); });
}
function fermerNavPlus() {
  const sh = document.getElementById('nav-plus');
  if (sh) { sh.classList.remove('ouvert'); sh.hidden = true; }
}
function ouvrirNavPlus() {
  const sh = document.getElementById('nav-plus');
  if (!sh) return;
  const panneaux = nmVisibles();
  const liens = [...document.querySelectorAll('.sb-nav a.sb-item')].filter(a => a.style.display !== 'none');
  const tuile = (ico, lbl, cls) =>
    '<button type="button" class="np-item' + (cls || '') + '">' + ico + '<span>' + escT(lbl) + '</span></button>';
  sh.innerHTML = '<div class="np-fond"></div><div class="np-feuille"><div class="np-poignee"></div>' +
    '<div class="np-titre">Menu</div><div class="np-grille" id="np-panneaux">' +
    panneaux.map(b => tuile(b.querySelector('.ico') ? b.querySelector('.ico').innerHTML : '',
      b.querySelector('.lbl') ? b.querySelector('.lbl').textContent : b.dataset.panel,
      b.classList.contains('active') ? ' active' : '')).join('') + '</div>' +
    '<div class="np-titre">Raccourcis</div><div class="np-grille" id="np-liens">' +
    liens.map(a => tuile(a.querySelector('.ico') ? a.querySelector('.ico').innerHTML : '',
      a.querySelector('.lbl') ? a.querySelector('.lbl').textContent : '')).join('') +
    tuile('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M12 3.5v8"/><path d="M17.7 6.6a8 8 0 11-11.4 0"/></svg>', 'Déconnexion') +
    '</div></div>';
  sh.querySelector('.np-fond').addEventListener('click', fermerNavPlus);
  [...sh.querySelectorAll('#np-panneaux .np-item')].forEach((t, i) => t.addEventListener('click', () => { fermerNavPlus(); panneaux[i].click(); }));
  const lt = [...sh.querySelectorAll('#np-liens .np-item')];
  lt.forEach((t, i) => t.addEventListener('click', () => {
    fermerNavPlus();
    if (i < liens.length) { window.location.href = liens[i].getAttribute('href'); }
    else { doLogout(); }
  }));
  const feuille = sh.querySelector('.np-feuille');
  let fy = null;
  feuille.addEventListener('touchstart', e => { if (feuille.scrollTop > 0) return; fy = e.touches[0].clientY; }, { passive: true });
  feuille.addEventListener('touchmove', e => {
    if (fy === null) return;
    const d = e.touches[0].clientY - fy;
    if (d > 0) feuille.style.transform = 'translateY(' + d + 'px)';
  }, { passive: true });
  feuille.addEventListener('touchend', e => {
    if (fy === null) return;
    const d = e.changedTouches[0].clientY - fy; fy = null;
    feuille.style.transform = '';
    if (d > 90) fermerNavPlus();
  });
  sh.hidden = false; sh.classList.add('ouvert');
}

document.querySelectorAll('.sb-item[data-panel]').forEach(item => {
  item.addEventListener('click', () => {
    if (!isApproved && item.classList.contains('req-approve')) { toast('Compte en attente de validation.'); return; }
    ouvrirPanneau(item.dataset.panel);
  });
});

// ── AUTH ────────────────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('auth-btn').textContent = m === 'login' ? 'Se connecter' : 'Créer mon compte';
  document.getElementById('auth-sub').textContent = m === 'login'
    ? 'Connecte-toi pour accéder au dashboard de la famille.'
    : 'Crée ton compte pour rejoindre l’espace membre.';
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
  document.getElementById('member-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
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

// ── SÉQUENCE DE CONNEXION ───────────────────────────────────────────────────
async function onLogged(user) {
  currentUser = user;
  await chargerHierarchie();
  remplirNoms();
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('reset-screen').style.display = 'none';
  document.getElementById('member-screen').style.display = 'block';
  const viaBot = /@bot\.famillemoni\.com$/i.test(user.email || '');
  document.getElementById('who-email').textContent = viaBot ? ((user.user_metadata && user.user_metadata.user_name) || 'membre Discord') : user.email;
  const sbAdmin = document.getElementById('sb-admin');
  if (sbAdmin) sbAdmin.style.display = user.email === 'syne@live.fr' ? 'flex' : 'none';
  // Les droits viennent de la base, qui applique exactement les mêmes fonctions
  // que ses règles de sécurité : l'affichage ne peut pas diverger de la réalité.
  sb.rpc('peut_gerer_hierarchie').then(({ data, error }) => {
    if (error) { console.warn('[hierarchie] vérification impossible :', error.message); return; }
    const b = document.getElementById('sb-hierarchie');
    if (b) b.style.display = data === true ? '' : 'none';
    if (data === true) hierRender();
  });
  sb.rpc('est_gerant_taxes').then(({ data, error }) => {
    if (error) { console.warn('[taxes] vérification gérant impossible :', error.message); return; }
    if (data === true) activerModeGerantTaxes();
  });

  // Un seul aller-retour : on écrit et on relit la colonne dans la même requête.
  const { data: compte } = await sb.from('comptes')
    .upsert({ id: user.id, email: user.email })
    .select('approuve').maybeSingle();
  isApproved = !!(compte && compte.approuve);

  if (!isApproved) {
    showPanel('pending');
    document.getElementById('dash-title').innerHTML = 'Compte en <em>attente</em>';
    if (window.emBot) window.emBot.etatCompteAttente();
    return;
  }
  // « Ma semaine » d'abord ; si le membre avait quitté ailleurs, on l'y remet.
  let panneau = 'moi';
  try { panneau = localStorage.getItem('moni-panel') || 'moi'; } catch (e) {}
  const btnPanneau = document.querySelector('.sb-item[data-panel="' + panneau + '"]');
  if (!btnPanneau || btnPanneau.style.display === 'none') panneau = 'moi';
  await loadProfil();
  if (window.emBot) await window.emBot.demarrer();
  ouvrirPanneau(panneau);
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
  if (btn) btn.addEventListener('click', () => { if (isApproved) startTV(); else toast('Compte en attente de validation.'); });
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
