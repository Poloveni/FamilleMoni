// ─────────────────────────────────────────────────────────────────────────────
//  em-bot.js — tout ce que l'espace membre affiche à partir du bot Discord
//  (bot-moni-v3), en LECTURE SEULE : Ma semaine, La famille, Stocks,
//  Armurerie, Braquages & cooldowns, Taxes, et la carte du mois.
//
//  Le navigateur ne parle jamais au bot : chaque lecture passe par l'Edge
//  Function Supabase `bot-suivi`, qui détient le jeton du bot côté serveur,
//  vérifie que le membre est approuvé sur le site et ne relaie que des routes
//  GET connues. Ici, on affiche ce que le bot calcule — jamais de chiffre
//  recalculé ou inventé ; quand le bot ne répond pas, on l'écrit.
//
//  Dépend d'em-core.js (sb, currentUser, currentNom, escT, toast, fmtArgent,
//  showPanel) et d'em-charts.js (drawBarChart, drawDonut, drawLineChart,
//  countUp). Expose window.emBot = { demarrer, ouvrir, actualiser, … }.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var FN_URL = String(window.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/bot-suivi';

  // ── État ──────────────────────────────────────────────────────────────────
  var S = {
    statut: null,          // dernière réponse `status` de la passerelle
    me: null,              // { id, username, isAdmin, isTaxes } vu par le bot
    week: '',              // '' = semaine en cours (depuis le reset du bot), sinon 'AAAA-Www'
    config: undefined,     // /api/quotas/config (objectifs, taux, plage) — null si le bot ne l'expose pas
    cache: {},
    derniereOk: null,
    noms: {},
    nomsCharges: false,
    chargement: 0,
    panneau: null,         // panneau bot actuellement affiché
    tickers: [],
  };

  var TAXE_TYPES = { sporex: 'Taxe Spore X', heroine: 'Taxe Héroïne', vente: 'Taxe Vente', fertilisant: 'Taxe Fertilisant', cannabis: 'Taxe Cannabis', mexicana: 'Taxe Mexicana', cocaine: 'Taxe Cocaïne' };
  var QUOTA_LBL = { vente: 'Ventes', actions: 'Actions', recolte: 'Récolte', labos: 'Labos' };
  var ARME_STATUT = { en_stock: ['En stock', 'ok'], pretee: ['Prêtée', 'warn'], perdue: ['Perdue', 'bad'] };

  // ── Petits utilitaires ────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) { return escT(s); }
  function fmtN(n) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 }); }
  function fmt$(n) { return fmtArgent(Math.round(Number(n || 0))); }
  function titre(s) { return String(s || '').toLowerCase().replace(/(^|[\s'’\-_])([a-zà-ÿ])/g, function (m, sep, c) { return (sep === '_' ? ' ' : sep) + c.toUpperCase(); }); }
  function fmtDate(ms) { var d = new Date(Number(ms)); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function fmtDateHeure(ms) { var d = new Date(Number(ms)); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function fmtHeure(d) { return d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'; }
  function fmtRel(ms) {
    var diff = Date.now() - Number(ms), abs = Math.abs(diff), sgn = diff >= 0 ? 'il y a ' : 'dans ';
    if (abs < 60e3) return diff >= 0 ? 'à l\'instant' : 'dans moins d\'une minute';
    if (abs < 3600e3) return sgn + Math.round(abs / 60e3) + ' min';
    if (abs < 86400e3) return sgn + Math.round(abs / 3600e3) + ' h';
    return sgn + Math.round(abs / 86400e3) + ' j';
  }
  function fmtDuree(ms) {
    if (ms <= 0) return 'terminé';
    var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h >= 24) return Math.floor(h / 24) + ' j ' + (h % 24) + ' h';
    if (h) return h + ' h ' + (m < 10 ? '0' : '') + m + ' min';
    if (m) return m + ' min ' + (sec < 10 ? '0' : '') + sec + ' s';
    return sec + ' s';
  }
  function joursRestants(ms) { return Math.ceil((Number(ms) - Date.now()) / 86400e3); }
  function pill(txt, cls) { return '<span class="pill' + (cls ? ' ' + cls : '') + '">' + esc(txt) + '</span>'; }
  function locked(html) { return '<div class="locked">' + html + '</div>'; }
  function nomDe(id) { return S.noms[id] || (window.MONI_NOM_FIX || {})[id] || ('Membre …' + String(id || '').slice(-4)); }
  /** Nom d'un membre, cliquable vers sa fiche quand le bot l'autorisera (soi-même ou admin — sinon il répondrait 403). */
  function nomLien(id) {
    var n = esc(nomDe(id));
    if (!S.me || !(S.me.isAdmin || estMoi(id))) return n;
    return '<button type="button" class="sv-nom" onclick="emBot.membre(\'' + esc(id) + '\')" title="Voir la fiche">' + n + '</button>';
  }
  function estMoi(id) { return !!(S.me && S.me.id === id); }
  function monNom() { return currentNom || (S.me ? nomDe(S.me.id) : ''); }

  /** Semaine ISO d'une date (lundi UTC), format AAAA-Www — même définition que src/api/week.ts du bot. */
  function isoWeek(date) {
    var d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var y = d.getUTCFullYear();
    var jan1 = new Date(Date.UTC(y, 0, 1));
    var w = Math.ceil(((d - jan1) / 86400e3 + 1) / 7);
    return y + '-W' + (w < 10 ? '0' : '') + w;
  }
  function semainesPassees(n) {
    var out = [], d = new Date();
    for (var i = 1; i <= n; i++) out.push(isoWeek(new Date(d.getTime() - i * 7 * 86400e3)));
    return out;
  }
  /** Lundi (UTC) d'une semaine ISO. */
  function lundiDe(week) {
    var m = /^(\d{4})-W(\d{2})$/.exec(week); if (!m) return null;
    var jan4 = new Date(Date.UTC(+m[1], 0, 4)), day = jan4.getUTCDay() || 7;
    var w1 = new Date(jan4); w1.setUTCDate(jan4.getUTCDate() - (day - 1));
    var d = new Date(w1); d.setUTCDate(w1.getUTCDate() + (+m[2] - 1) * 7);
    return d;
  }

  // ── Passerelle ────────────────────────────────────────────────────────────
  function ErreurBot(code, message, statut) { this.code = code || 'unknown'; this.message = message || 'Erreur'; this.statut = statut || 0; }
  ErreurBot.prototype = Object.create(Error.prototype);

  async function appel(payload) {
    var session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (e) {}
    if (!session) throw new ErreurBot('unauthorized', 'Session du site expirée — reconnecte-toi à l\'espace membre.', 401);
    var r;
    try {
      r = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: window.SUPABASE_KEY || '' },
        body: JSON.stringify(payload),
      });
    } catch (e) { throw new ErreurBot('gateway', 'La passerelle du site ne répond pas (' + (e && e.message || e) + ').', 0); }
    var d = null;
    try { d = await r.json(); } catch (e) {}
    if (!d) throw new ErreurBot(r.status === 404 ? 'gateway_missing' : 'gateway', 'Réponse illisible de la passerelle (' + r.status + ').', r.status);
    if (!r.ok || d.ok === false) throw new ErreurBot(d.code || 'gateway', d.message || ('Erreur ' + r.status), r.status);
    return d;
  }

  /** GET relayé vers le bot, avec cache par (chemin + paramètres). */
  async function api(path, query) {
    query = query || {};
    var cle = path + '?' + Object.keys(query).sort().map(function (k) { return k + '=' + query[k]; }).join('&');
    if (S.cache[cle]) return S.cache[cle];
    var p = appel({ action: 'api', path: path, query: query }).then(function (d) {
      absorberNoms(d.data);
      var res = { data: d.data, at: new Date(d.fetchedAt || Date.now()) };
      S.cache[cle] = res; S.derniereOk = res.at; majChip();
      return res;
    }, function (e) { delete S.cache[cle]; throw e; });
    S.cache[cle] = p;   // les appels simultanés partagent la même promesse
    return p;
  }
  function wk() { return S.week ? { week: S.week } : {}; }

  // ── Noms, config ──────────────────────────────────────────────────────────
  /** Les routes de groupe du bot (classement, paie, ventes…) portent le nom de chaque joueur sur la ligne : on le retient au passage. */
  function absorberNoms(data) {
    var fix = window.MONI_NOM_FIX || {};
    var lignes = Array.isArray(data) ? data : (data && Array.isArray(data.players) ? data.players : []);
    lignes.forEach(function (l) {
      if (!l || typeof l !== 'object' || !l.name) return;
      if (l.userId) S.noms[l.userId] = fix[l.userId] || titre(l.name);
    });
  }
  async function chargerNoms() {
    if (S.nomsCharges) return;
    S.nomsCharges = true;
    var fix = window.MONI_NOM_FIX || {};
    try {
      var u = await api('/api/users');
      (u.data || []).forEach(function (x) { if (x.userId) S.noms[x.userId] = fix[x.userId] || titre(x.gameName || x.username); });
    } catch (e) {}
    Object.keys(fix).forEach(function (id) { S.noms[id] = fix[id]; });
  }
  async function chargerConfig() {
    if (S.config !== undefined) return;
    try {
      var r = await api('/api/quotas/config', wk());
      // Sur un bot pas encore corrigé, cette adresse tombe sur /:userId : on ne
      // la prend que si elle a la forme attendue.
      S.config = (r.data && r.data.range && r.data.targets) ? r.data : null;
    } catch (e) { S.config = null; }
  }
  /** Vrai si les lignes de stock portent la configuration des items (bot à jour du correctif n°2) — `vente` y est alors un booléen ou null, jamais absent. */
  function stocksConfigures(liste) { return liste.length > 0 && Object.prototype.hasOwnProperty.call(liste[0], 'vente'); }
  function nomItem(s) { return s && s.name ? s.name : titre(s ? s.item : ''); }

  // ── Pastille d'état dans l'en-tête ────────────────────────────────────────
  function majChip() {
    var el = $('bot-chip');
    if (!el) return;
    var st = S.statut, tete = '<span class="chip-pre">Bot </span><b>Moni</b> · ';
    var quand = S.derniereOk ? 'données de ' + fmtHeure(S.derniereOk) : '';
    if (!st) { el.dataset.state = 'wait'; el.innerHTML = tete + '<span class="chip-when">vérification…</span>'; el.title = ''; return; }
    if (st.erreur) { el.dataset.state = 'off'; el.innerHTML = tete + '<span class="chip-when">passerelle indisponible</span>'; el.title = st.erreur.message || ''; return; }
    if (!st.configured) { el.dataset.state = 'off'; el.innerHTML = tete + '<span class="chip-when">non configuré</span>'; el.title = 'BOT_API_URL manquant côté Supabase'; return; }
    if (!st.linked) { el.dataset.state = 'stale'; el.innerHTML = tete + '<span class="chip-when">compte non connecté</span>'; el.title = 'Connecte ton compte Discord au bot depuis n\'importe quel panneau.'; return; }
    if (st.code === 'unavailable') { el.dataset.state = 'off'; el.innerHTML = tete + '<span class="chip-when">injoignable</span>'; el.title = st.message || ''; return; }
    if (st.code === 'forbidden') { el.dataset.state = 'off'; el.innerHTML = tete + '<span class="chip-when">accès refusé</span>'; el.title = st.message || ''; return; }
    el.dataset.state = 'ok';
    el.innerHTML = tete + '<span class="chip-when">' + esc(S.me ? S.me.username : 'connecté') + (quand ? ' · ' + quand : '') + '</span>';
    el.title = 'Connecté au bot' + (S.me && S.me.isAdmin ? ' (administrateur)' : (S.me && S.me.isTaxes ? ' (rôle taxes)' : '')) + (st.expiresAt ? ' — jeton valable jusqu\'au ' + fmtDate(new Date(st.expiresAt).getTime()) : '');
  }

  // ── États (non connecté, expiré, indisponible…) ──────────────────────────
  function boutonConnexion(lbl) {
    var url = S.statut && S.statut.loginUrl;
    return url ? '<a class="btn discord sv-btn" href="' + esc(url) + '" rel="noopener">' + esc(lbl || 'Connecter mon compte Discord au bot') + '</a>' : '';
  }
  function rendreErreur(err) {
    var code = err && err.code, msg = esc(err && err.message || '');
    switch (code) {
      case 'not_configured': return locked('La liaison avec le bot n\'est <b>pas encore configurée</b> sur le site.<br><small>Un administrateur doit renseigner l\'adresse de l\'API du bot (voir <code>docs/SUIVI-FAMILLE.md</code>).</small>');
      case 'not_linked': return locked('Pour voir les données du bot, <b>connecte une fois ton compte Discord</b> auprès du bot Moni.<br><small>Tu seras redirigé(e) vers Discord, puis ramené(e) ici. Le site ne garde aucun mot de passe : seul un jeton de lecture, conservé côté serveur, valable 7 jours.</small><div class="sv-cta">' + boutonConnexion() + '</div>');
      case 'reconnect': return locked('Ta connexion au bot a <b>expiré ou a été révoquée</b> (les jetons du bot durent 7 jours).<br><small>' + msg + '</small><div class="sv-cta">' + boutonConnexion('Me reconnecter au bot') + '</div>');
      case 'forbidden': return locked('<b>Accès refusé</b> par le bot.<br><small>' + msg + '</small>');
      case 'not_found': return locked('<b>Introuvable</b> côté bot.<br><small>' + msg + '</small>');
      case 'unavailable': case 'gateway': return locked('<b>Bot indisponible</b> pour le moment — aucune donnée n\'est affichée plutôt que des chiffres faux.<br><small>' + msg + '</small><div class="sv-cta"><button type="button" class="btn ghost sv-btn" onclick="actualiserTout()">Réessayer</button></div>');
      case 'gateway_missing': return locked('La passerelle <code>bot-suivi</code> n\'est <b>pas déployée</b> sur Supabase.<br><small>Voir <code>docs/SUIVI-FAMILLE.md</code>.</small>');
      case 'site_forbidden': return locked('<b>Accès non ouvert</b> pour ce compte du site.<br><small>' + msg + '</small>');
      case 'unauthorized': return locked('<b>Session du site expirée.</b> Recharge la page et reconnecte-toi.');
      case 'no_discord_identity': return locked('Ton compte du site n\'est <b>pas relié à Discord</b>.<br><small>Déconnecte-toi puis utilise « Se connecter avec Discord » : c\'est ce qui prouve que les données du bot sont bien les tiennes.</small>');
      case 'discord_pris': return locked('<b>Ce compte Discord est déjà rattaché à un autre compte du site.</b><br><small>' + msg + '</small>');
      case 'mismatch': case 'wrong_guild': return locked('<b>Liaison refusée.</b><br><small>' + msg + '</small><div class="sv-cta">' + boutonConnexion('Recommencer la connexion') + '</div>');
      default: return locked('<b>Erreur</b> : ' + msg);
    }
  }
  function libelleCourt(err) {
    switch (err && err.code) {
      case 'forbidden': return 'accès refusé par le bot';
      case 'unavailable': case 'gateway': return 'bot injoignable';
      case 'reconnect': return 'reconnexion au bot requise';
      case 'not_found': return 'pas encore exposé par ce bot';
      case 'bad_request': return 'refusé par le bot';
      default: return err && err.message ? String(err.message).slice(0, 60) : '';
    }
  }
  /** Bloc d'erreur inline (une section du panneau, pas tout le panneau). */
  function blocErr(err) { return locked('<b>' + esc(libelleCourt(err) || 'indisponible') + '</b>' + (err && err.message ? '<br><small>' + esc(err.message) + '</small>' : '')); }

  // ── Blocs génériques ──────────────────────────────────────────────────────
  function tableau(entetes, lignes, classes, forcerCompact) {
    classes = classes || [];
    var compact = (forcerCompact || entetes.length <= 3) ? ' sv-compact' : '';
    return '<div class="table-wrap"><table class="vd-table' + compact + '"><thead><tr>' + entetes.map(function (h, i) { return '<th class="' + (classes[i] || '') + '">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + lignes.map(function (l) { return '<tr' + (l.cls ? ' class="' + l.cls + '"' : '') + '>' + (l.cells || l).map(function (c, i) { return '<td class="' + (classes[i] || '') + '">' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function kpi(label, valeur, foot, res, brut) {
    var v = valeur == null ? '<span class="sv-ind" title="' + esc(res && res.reason && res.reason.message || 'Indisponible') + '">indisponible</span>' : (brut ? valeur : esc(valeur));
    var f = valeur == null ? esc(res && res.reason ? libelleCourt(res.reason) : '') : esc(foot || '');
    return '<div class="kpi"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-num">' + v + '</div><div class="kpi-foot">' + f + '</div></div>';
  }
  function recherche(id, placeholder, val, oninput) {
    return '<label class="tx-recherche" for="' + id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input type="search" id="' + id + '" placeholder="' + esc(placeholder) + '" value="' + esc(val || '') + '" autocomplete="off" spellcheck="false" oninput="' + oninput + '" /></label>';
  }
  function barreSemaine() {
    return '<div class="sv-semaine-bar"><label class="sv-semaine"><span>Période</span><select onchange="emBot.semaine(this.value)">'
      + '<option value=""' + (S.week ? '' : ' selected') + '>Semaine en cours (depuis le reset du bot)</option>'
      + semainesPassees(8).map(function (w) { return '<option value="' + w + '"' + (S.week === w ? ' selected' : '') + '>Semaine ' + w.replace('-W', ' n°') + '</option>'; }).join('')
      + '</select></label><span class="sv-maj">' + esc(periodeTexte()) + '</span></div>' + avertissementSemainePassee();
  }
  function periodeTexte() {
    if (S.config && S.config.range) {
      var r = S.config.range;
      return 'du ' + fmtDateHeure(r.since) + ' au ' + fmtDateHeure(r.until);
    }
    return S.week ? 'semaine ISO ' + S.week : 'depuis le dernier reset hebdomadaire du bot (dimanche 19h)';
  }
  function avertissementSemainePassee() {
    if (!S.week) return '';
    return '<p class="hint sv-note">Semaine passée : le bot recalcule la paie et les objectifs avec les <b>taux et objectifs actuels</b> (il n\'historise pas les anciens). Les ventes, elles, ne dépendent d\'aucun taux.</p>';
  }
  function tableQuota(byQuotaType, cibles) {
    var cats = Object.keys(byQuotaType || {});
    if (!cats.length) return locked('Aucune activité sur cette période.');
    return tableau(['Catégorie', 'Fait', 'Objectif'], cats.map(function (c) {
      var val = byQuotaType[c] || 0, obj = cibles && cibles[c], prog;
      if (obj) {
        var p = Math.min(100, Math.round(100 * val / obj));
        prog = '<div class="vd-progress sv-prog' + (val >= obj ? ' ok' : '') + '"><span style="width:' + p + '%"></span></div><div class="vd-progress-txt">' + fmtN(val) + ' / ' + fmtN(obj) + ' · ' + p + ' %</div>';
      } else prog = '<span class="hint">' + (cibles ? 'pas d\'objectif configuré' : 'objectif non exposé par ce bot') + '</span>';
      return ['<b>' + esc(QUOTA_LBL[c] || titre(c)) + '</b>', fmtN(val), prog];
    }), ['', 'num', 'prog']);
  }
  function stopTickers() { S.tickers.forEach(clearInterval); S.tickers = []; }
  function ticker(fn) { fn(); S.tickers.push(setInterval(fn, 1000)); }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MA SEMAINE
  // ═══════════════════════════════════════════════════════════════════════════
  async function rendreMoi(cible) {
    await chargerConfig();
    var me = S.me, cibles = S.config && S.config.targets ? S.config.targets : null, acts = S.config && S.config.activities ? S.config.activities : {};
    var r = await Promise.allSettled([
      api('/api/quotas/' + me.id, wk()),
      api('/api/quotas/pay/' + me.id, wk()),
      api('/api/ventes/' + me.id, wk()),
      api('/api/quotas/ranking', wk()),
      api('/api/cooldowns'),
      api('/api/ventes', wk()),
    ]);
    var quota = r[0], paie = r[1], ventes = r[2], rang = r[3], cd = r[4], groupe = r[5];
    var html = barreSemaine();

    // Héros : mes ventes face à l'objectif
    var mv = ventes.status === 'fulfilled' ? ventes.value.data.total : null;
    var obj = cibles && cibles.vente;
    html += '<div class="moi-hero">';
    if (mv == null) html += '<div class="moi-hero-num sv-ind">indisponible</div><div class="moi-hero-note">' + esc(libelleCourt(ventes.reason)) + '</div>';
    else {
      var pct = obj ? Math.min(100, Math.round(100 * mv / obj)) : null;
      html += '<div class="moi-hero-lbl">Mes ventes' + (S.week ? ' · semaine ' + esc(S.week.replace('-W', ' n°')) : ' · cette semaine') + '</div>'
        + '<div class="moi-hero-num">' + fmtN(mv) + (obj ? '<small> / ' + fmtN(obj) + '</small>' : '') + '</div>'
        + (obj ? '<div class="goal-bar sv-prog' + (mv >= obj ? ' ok' : '') + '"><span style="width:' + pct + '%"></span></div>' : '')
        + '<div class="moi-hero-note">' + (obj ? (mv >= obj ? 'Objectif atteint. Chaque vente de plus compte pour le classement.' : 'Encore ' + fmtN(obj - mv) + ' pour atteindre l\'objectif.') : 'Objectif non exposé par ce bot.') + '</div>';
    }
    html += '</div>';

    // KPIs
    var rangTxt = null, rangFoot = 'classement par points du bot';
    if (rang.status === 'fulfilled') {
      var liste = rang.value.data || [], idx = liste.findIndex(function (x) { return x.userId === me.id; });
      rangTxt = idx >= 0 ? (idx + 1) + '<small> / ' + liste.length + '</small>' : '—';
      rangFoot = idx >= 0 ? fmtN(liste[idx].points) + ' points' : (liste.length ? 'aucun point sur cette période' : 'personne n\'a de points');
    }
    html += '<div class="kpis sv-kpis">'
      + kpi('Ma paie', paie.status === 'fulfilled' ? fmt$(paie.value.data.salaire) : null, S.config && S.config.salaryRates ? 'taux actuels du bot' : 'calculée par le bot', paie)
      + kpi('Mon rang', rangTxt, rangFoot, rang, true)
      + kpi('Part du groupe', (mv != null && groupe.status === 'fulfilled') ? (groupe.value.data.groupTotal ? Math.round(100 * mv / groupe.value.data.groupTotal) + ' %' : '0 %') : null, groupe.status === 'fulfilled' ? 'sur ' + fmtN(groupe.value.data.groupTotal) + ' unités vendues' : '', groupe)
      + kpi('Cooldowns actifs', cd.status === 'fulfilled' ? String((cd.value.data.cooldowns || []).length) : null, cd.status === 'fulfilled' && cd.value.data.cooldowns.length ? 'détail dans Braquages & cooldowns' : 'rien en attente', cd)
      + '</div>';

    html += '<div class="grid2 sv-grid">';
    html += '<div class="bloc"><div class="bloc-t">Mon quota <small>par catégorie</small></div>';
    if (quota.status === 'fulfilled') {
      html += tableQuota(quota.value.data.byQuotaType, cibles);
      var map = quota.value.data.map || {}, det = Object.keys(map).filter(function (k) { return map[k] && map[k].count; });
      if (det.length) html += '<details class="sv-details"><summary>Détail par activité</summary>' + tableau(['Activité', 'Fait'], det.map(function (k) { return [esc(acts[k] ? acts[k].label : titre(k)), fmtN(map[k].count)]; }), ['', 'num']) + '</details>';
    } else html += blocErr(quota.reason);
    html += '</div>';

    html += '<div class="bloc"><div class="bloc-t">Mes ventes <small>par drogue</small></div>';
    if (ventes.status === 'fulfilled') {
      var d = (ventes.value.data.detail || []).slice().sort(function (a, b) { return b.quantite - a.quantite; });
      html += d.length ? tableau(['Drogue', 'Quantité'], d.map(function (x) { return ['<b>' + esc(x.item) + '</b>', fmtN(x.quantite)]; }), ['', 'num']) : locked('Pas de vente confirmée sur cette période.');
      if (paie.status === 'fulfilled' && S.config && S.config.salaryRates) {
        var taux = S.config.salaryRates, p = paie.value.data;
        html += '<details class="sv-details"><summary>Comment ma paie est calculée</summary>' + tableau(['Catégorie', 'Fait', 'Taux actuel'], Object.keys(taux).map(function (c) { return [esc(QUOTA_LBL[c] || titre(c)), fmtN(p.byQuotaType && p.byQuotaType[c] || 0), fmt$(taux[c]) + ' / unité']; }), ['', 'num', 'num'])
          + (Object.keys(S.config.itemSalaryRates || {}).length ? '<p class="hint sv-note">Taux spécifiques : ' + Object.keys(S.config.itemSalaryRates).map(function (k) { return esc(k) + ' ' + esc(fmt$(S.config.itemSalaryRates[k])); }).join(' · ') + '.</p>' : '') + '</details>';
      }
    } else html += blocErr(ventes.reason);
    html += '</div></div>';
    cible.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LA FAMILLE
  // ═══════════════════════════════════════════════════════════════════════════
  async function rendreFamille(cible) {
    await chargerConfig();
    var cibles = S.config && S.config.targets ? S.config.targets : null;
    var r = await Promise.allSettled([
      api('/api/ventes', wk()), api('/api/quotas', wk()), api('/api/quotas/ranking', wk()), api('/api/quotas/pay', wk()), api('/api/quotas/summary', wk()), api('/api/stocks'),
    ]);
    var ventes = r[0], quotas = r[1], rang = r[2], paies = r[3], bilan = r[4], stocks = r[5];
    var html = barreSemaine() + '<div id="fam-membre"></div>';

    var nbActifs = quotas.status === 'fulfilled' ? (quotas.value.data || []).length : null;
    var nbOk = (quotas.status === 'fulfilled' && cibles && cibles.vente) ? (quotas.value.data || []).filter(function (q) { return (q.byQuotaType && q.byQuotaType.vente || 0) >= cibles.vente; }).length : null;
    var paieTotale = paies.status === 'fulfilled' ? (paies.value.data || []).reduce(function (t, p) { return t + (p.salaire || 0); }, 0) : null;
    var st = {}; if (stocks.status === 'fulfilled') (stocks.value.data || []).forEach(function (s) { st[s.item] = s.quantite; });
    html += '<div class="kpis sv-kpis">'
      + kpi('Ventes du groupe', ventes.status === 'fulfilled' ? fmtN(ventes.value.data.groupTotal) : null, ventes.status === 'fulfilled' ? (ventes.value.data.players || []).length + ' vendeur(s)' : '', ventes)
      + kpi('Quotas atteints', nbOk != null ? nbOk + '<small> / ' + nbActifs + '</small>' : (nbActifs != null ? nbActifs + '<small> actifs</small>' : null), cibles && cibles.vente ? 'objectif : ' + fmtN(cibles.vente) + ' ventes' : 'objectif non exposé par ce bot', quotas, true)
      + kpi('Paie du groupe', paieTotale != null ? fmt$(paieTotale) : null, 'somme des paies calculées par le bot', paies)
      + kpi('Argent sale au coffre', stocks.status === 'fulfilled' ? fmt$(st['argent sale'] || 0) : null, 'tous coffres confondus', stocks)
      + '</div>';

    // Barres : ventes par membre
    html += '<div class="bloc"><div class="bloc-t">Ventes par membre <small>unités confirmées</small></div><div id="fam-chart">' + (ventes.status === 'fulfilled' ? '' : blocErr(ventes.reason)) + '</div></div>';

    html += '<div class="grid2 sv-grid">';
    html += '<div class="bloc"><div class="bloc-t">Classement <small>par points, décroissant</small></div>';
    if (rang.status === 'fulfilled') {
      var l = rang.value.data || [];
      html += l.length ? tableau(['#', 'Membre', 'Points'], l.map(function (x, i) { return { cls: estMoi(x.userId) ? 'moi' : '', cells: [String(i + 1), nomLien(x.userId) + (estMoi(x.userId) ? ' <span class="cd-me">toi</span>' : ''), '<b>' + fmtN(x.points) + '</b>'] }; }), ['rk', '', 'num']) : locked('Personne n\'a encore de points sur cette période.');
    } else html += blocErr(rang.reason);
    html += '</div>';
    html += '<div class="bloc"><div class="bloc-t">Paie du groupe <small>tous les membres suivis</small></div>';
    if (paies.status === 'fulfilled') {
      var lp = (paies.value.data || []).slice().sort(function (a, b) { return b.salaire - a.salaire; });
      html += lp.length ? tableau(['Membre', 'Paie'], lp.map(function (x) { return { cls: estMoi(x.userId) ? 'moi' : '', cells: [nomLien(x.userId), '<span class="paie">' + esc(fmt$(x.salaire)) + '</span>'] }; }), ['', 'num']) : locked('Aucun membre suivi sur cette période.');
    } else html += blocErr(paies.reason);
    html += '</div></div>';

    html += '<div class="grid2 sv-grid">';
    html += '<div class="bloc"><div class="bloc-t">Ventes par membre <small>et part du total</small></div>';
    if (ventes.status === 'fulfilled') {
      var g = ventes.value.data, pl = g.players || [];
      html += pl.length ? tableau(['#', 'Membre', 'Vendu', 'Part'], pl.map(function (p, i) { return { cls: estMoi(p.userId) ? 'moi' : '', cells: [String(i + 1), nomLien(p.userId), '<b>' + fmtN(p.total) + '</b>', '<span class="ref">' + (g.groupTotal ? Math.round(100 * p.total / g.groupTotal) : 0) + ' %</span>'] }; }), ['rk', '', 'num', 'num']) : locked('Aucune vente confirmée sur cette période.');
    } else html += blocErr(ventes.reason);
    html += '</div>';
    html += '<div class="bloc"><div class="bloc-t">Bilan du groupe <small>par activité</small></div>';
    if (bilan.status === 'fulfilled') {
      var b = (bilan.value.data || []).slice().sort(function (x, y) { return y.total - x.total; });
      html += b.length ? tableau(['Activité', 'Total'], b.map(function (x) { return [esc(x.label && x.label !== x.action ? x.label : titre(x.action)), '<b>' + fmtN(x.total) + '</b>']; }), ['', 'num']) : locked('Aucune activité déclarée.');
    } else html += blocErr(bilan.reason);
    html += '</div></div>';

    cible.innerHTML = html;
    return function apres(reel) {
      if (F.membre) chargerFicheMembre(F.membre);
      if (ventes.status !== 'fulfilled') return;
      var pls = (ventes.value.data.players || []).slice(0, 12);
      var el = reel.querySelector('#fam-chart');
      if (!pls.length) el.innerHTML = locked('Aucune vente sur cette période.');
      else drawBarChart(el, pls.map(function (p) { var n = nomDe(p.userId); return { label: n.split(/\s+/)[0], full: n, value: Math.round(p.total) }; }), cibles && cibles.vente ? cibles.vente : 0);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FICHE D'UN MEMBRE (le bot ne la sert qu'à l'intéressé ou à un admin)
  // ═══════════════════════════════════════════════════════════════════════════
  var F = { membre: '', stockQ: '', coffre: '', histItem: '', histCoffre: '', histLimit: '50', armeStatut: '', armeQ: '', taxeType: '', taxeStatut: 'active', taxeQ: '' };

  async function chargerFicheMembre(id) {
    var el = $('fam-membre'); if (!el) return;
    var tete = '<div class="bloc-t">' + esc(nomDe(id)) + ' <small>fiche de la période</small><button type="button" class="sv-lien" onclick="emBot.membre(\'\')">Fermer</button></div>';
    el.innerHTML = '<div class="bloc sv-fiche">' + tete + locked('Chargement…') + '</div>';
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await chargerConfig();
    var cibles = S.config && S.config.targets ? S.config.targets : null, acts = S.config && S.config.activities ? S.config.activities : {};
    var r = await Promise.allSettled([api('/api/quotas/' + id, wk()), api('/api/quotas/pay/' + id, wk()), api('/api/ventes/' + id, wk()), api('/api/cooldowns/' + id), api('/api/quotas/ranking', wk())]);
    if (F.membre !== id || !$('fam-membre')) return;
    var quota = r[0], paie = r[1], ventes = r[2], cd = r[3], rang = r[4];
    var rangTxt = '—';
    if (rang.status === 'fulfilled') { var l = rang.value.data || [], k = l.findIndex(function (x) { return x.userId === id; }); rangTxt = k >= 0 ? (k + 1) + ' / ' + l.length + ' · ' + fmtN(l[k].points) + ' pts' : 'aucun point'; }
    var html = '<div class="bloc sv-fiche">' + tete;
    html += '<div class="kpis sv-kpis">'
      + kpi('Ventes', ventes.status === 'fulfilled' ? fmtN(ventes.value.data.total) : null, cibles && cibles.vente ? 'objectif ' + fmtN(cibles.vente) : 'unités confirmées', ventes)
      + kpi('Paie', paie.status === 'fulfilled' ? fmt$(paie.value.data.salaire) : null, 'calculée par le bot', paie)
      + kpi('Rang', rangTxt, 'classement par points', rang)
      + kpi('Cooldowns', cd.status === 'fulfilled' ? String((cd.value.data.cooldowns || []).length) : null, 'en cours', cd)
      + '</div><div class="grid2 sv-grid">';
    html += '<div><div class="bloc-t" style="margin-bottom:10px;">Quota <small>par catégorie</small></div>';
    if (quota.status === 'fulfilled') {
      html += tableQuota(quota.value.data.byQuotaType, cibles);
      var map = quota.value.data.map || {}, det = Object.keys(map).filter(function (x) { return map[x] && map[x].count; });
      if (det.length) html += '<details class="sv-details"><summary>Détail par activité</summary>' + tableau(['Activité', 'Fait'], det.map(function (x) { return [esc(acts[x] ? acts[x].label : titre(x)), fmtN(map[x].count)]; }), ['', 'num']) + '</details>';
    } else html += blocErr(quota.reason);
    html += '</div><div><div class="bloc-t" style="margin-bottom:10px;">Ventes <small>par drogue</small></div>';
    if (ventes.status === 'fulfilled') {
      var d = (ventes.value.data.detail || []).slice().sort(function (a, b) { return b.quantite - a.quantite; });
      html += d.length ? tableau(['Drogue', 'Quantité'], d.map(function (x) { return ['<b>' + esc(x.item) + '</b>', fmtN(x.quantite)]; }), ['', 'num']) : locked('Pas de vente confirmée sur cette période.');
    } else html += blocErr(ventes.reason);
    if (cd.status === 'fulfilled') {
      var cds = cd.value.data.cooldowns || [];
      html += '<div class="bloc-t" style="margin:16px 0 10px;">Cooldowns</div>' + (cds.length ? '<div class="cd-liste">' + cds.map(function (c) { return '<div class="cd-row"><span class="cd-quoi">' + esc(c.label) + '</span><span class="cd-reste" data-fin="' + Number(c.expiresAt) + '">…</span><span class="ref">' + esc(fmtDateHeure(c.expiresAt)) + '</span></div>'; }).join('') + '</div>' : locked('Aucun cooldown en cours.'));
    }
    html += '</div></div></div>';
    el.innerHTML = html;
    ticker(function () { el.querySelectorAll('.cd-reste').forEach(function (x) { var fin = Number(x.dataset.fin); x.textContent = fin > Date.now() ? 'dans ' + fmtDuree(fin - Date.now()) : 'terminé'; }); });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STOCKS
  // ═══════════════════════════════════════════════════════════════════════════

  async function rendreStocks(cible) {
    var r = await Promise.allSettled([api('/api/stocks'), api('/api/stocks/channels'), api('/api/stocks/history', { item: 'argent sale', limit: '200' })]);
    var stocks = r[0], canaux = r[1], histArgent = r[2];
    var liste = stocks.status === 'fulfilled' ? (stocks.value.data || []) : [];
    var canauxL = canaux.status === 'fulfilled' ? (canaux.value.data || []) : [];
    var st = {}; liste.forEach(function (s) { st[s.item] = s.quantite; });
    var configure = stocksConfigures(liste);
    var drogues = liste.filter(function (s) { return s.vente === true && s.quantite > 0; }).sort(function (a, b) { return b.quantite - a.quantite; });
    var totalDrogue = drogues.reduce(function (t, s) { return t + s.quantite; }, 0);
    var html = '';

    html += '<div class="kpis sv-kpis">'
      + kpi('Argent sale', stocks.status === 'fulfilled' ? fmt$(st['argent sale'] || 0) : null, 'à blanchir', stocks)
      + kpi('Argent propre', stocks.status === 'fulfilled' ? fmt$(st['argent'] || 0) : null, 'au coffre', stocks)
      + kpi('Drogue à vendre', stocks.status === 'fulfilled' ? (configure ? fmtN(totalDrogue) : '—') : null, configure ? drogues.length + ' produit(s) vendables aux PNJ' : 'configuration des items non exposée par ce bot', stocks)
      + kpi('Items suivis', stocks.status === 'fulfilled' ? String(liste.length) : null, 'tous coffres confondus', stocks)
      + '</div>';

    html += '<div class="grid2 sv-grid">';
    html += '<div class="bloc"><div class="bloc-t">Drogue à vendre <small>répartition du stock</small></div><div id="stk-donut">' + (stocks.status === 'fulfilled' ? '' : blocErr(stocks.reason)) + '</div></div>';
    html += '<div class="bloc"><div class="bloc-t">Argent sale <small>évolution du coffre</small></div><div id="stk-courbe">' + (histArgent.status === 'fulfilled' ? '' : blocErr(histArgent.reason)) + '</div></div>';
    html += '</div>';

    html += '<div class="bloc"><div class="bloc-t">Stock général <small>tous coffres confondus, coffres administrateurs inclus</small></div>';
    if (stocks.status === 'fulfilled') html += '<div class="tx-outils sv-outils">' + recherche('stk-q', 'Chercher un item…', F.stockQ, 'emBot.filtre(\'stockQ\', this.value)') + '</div><div id="stk-table">' + tableStocks(liste, F.stockQ) + '</div>';
    else html += blocErr(stocks.reason);
    html += '</div>';

    html += '<div class="bloc"><div class="bloc-t">Coffres <small>' + (S.me && S.me.isAdmin ? 'coffres normaux et administrateurs' : 'les coffres administrateurs sont réservés aux administrateurs') + '</small></div>';
    if (canaux.status === 'fulfilled') {
      html += canauxL.length ? '<div class="sv-coffres">' + canauxL.map(function (c) { return '<button type="button" class="tx-filtre' + (F.coffre === c.channelId ? ' active' : '') + '" onclick="emBot.filtre(\'coffre\', \'' + esc(c.channelId) + '\')">' + (c.role === 'logs_coffres_admin' ? '🛡️ ' : '') + esc(c.label || ('Coffre ' + String(c.channelId).slice(-4))) + '</button>'; }).join('') + '</div><div id="stk-coffre">' + (F.coffre ? locked('Chargement…') : '<p class="hint">Choisis un coffre pour voir son contenu.</p>') + '</div>'
        : locked('Aucun coffre suivi n\'est configuré côté bot.');
    } else html += blocErr(canaux.reason);
    html += '</div>';

    html += '<div class="bloc"><div class="bloc-t">Historique des mouvements <small>du plus récent au plus ancien</small></div><div class="tx-outils sv-outils">'
      + '<label class="sv-sel"><span>Item</span><select onchange="emBot.filtre(\'histItem\', this.value)"><option value="">Tous</option>' + liste.map(function (i) { return '<option value="' + esc(i.item) + '"' + (F.histItem === i.item ? ' selected' : '') + '>' + esc(titre(i.item)) + '</option>'; }).join('') + '</select></label>'
      + '<label class="sv-sel"><span>Coffre</span><select onchange="emBot.filtre(\'histCoffre\', this.value)"><option value="">Tous</option>' + canauxL.map(function (c) { return '<option value="' + esc(c.channelId) + '"' + (F.histCoffre === c.channelId ? ' selected' : '') + '>' + esc(c.label || String(c.channelId).slice(-4)) + '</option>'; }).join('') + '</select></label>'
      + '<label class="sv-sel"><span>Nombre</span><select onchange="emBot.filtre(\'histLimit\', this.value)">' + ['20', '50', '100', '200'].map(function (n) { return '<option value="' + n + '"' + (F.histLimit === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>'
      + '</div><div id="stk-hist">' + locked('Chargement…') + '</div></div>';

    cible.innerHTML = html;
    return function apres(reel) {
    if (stocks.status === 'fulfilled') {
      var dEl = reel.querySelector('#stk-donut');
      if (!configure) dEl.innerHTML = locked('Ce bot n\'expose pas encore la configuration des items : impossible de distinguer la drogue du matériel. <small>(correctif n°2 du bot)</small>');
      else if (!drogues.length) dEl.innerHTML = locked('Aucune drogue vendable en stock actuellement.');
      else {
        var parts = drogues.map(function (s) { return { nom: titre(s.item), val: s.quantite }; });
        if (parts.length > 7) parts = parts.slice(0, 6).concat([{ nom: 'Autres (' + (parts.length - 6) + ' produits)', val: parts.slice(6).reduce(function (t, d) { return t + d.val; }, 0), detail: parts.slice(6) }]);
        drawDonut(dEl, parts);
      }
    }
    if (histArgent.status === 'fulfilled') {
      var pts = (histArgent.value.data || []).map(function (h) { return { t: h.timestamp, y: h.stockApres || 0 }; }).sort(function (a, b) { return a.t - b.t; });
      var cEl = reel.querySelector('#stk-courbe');
      if (pts.length < 2) cEl.innerHTML = locked('Pas encore assez de mouvements pour tracer la courbe.');
      else drawLineChart(cEl, pts);
    }
    if (F.coffre) chargerCoffre(canauxL);
    chargerHistorique(canauxL);
    };
  }
  function tableStocks(liste, q) {
    q = String(q || '').trim().toLowerCase();
    var rows = liste.filter(function (s) { return !q || String(s.item).toLowerCase().indexOf(q) >= 0; });
    if (!rows.length) return locked(liste.length ? 'Aucun item ne correspond.' : 'Aucun stock connu du bot.');
    return tableau(['Item', 'Groupe', 'Quantité'], rows.map(function (s) {
      var grp = s.group || (s.vente ? 'Vente PNJ' : (s.laboLie ? 'Labo' : '—'));
      return ['<b>' + esc(nomItem(s)) + '</b>' + (s.vente ? ' ' + pill('vendable', 'ok') : ''), '<span class="ref">' + esc(grp) + '</span>', fmtN(s.quantite)];
    }), ['', '', 'num']) + '<p class="hint sv-note">' + rows.length + ' item(s).</p>';
  }
  async function chargerCoffre(canauxL) {
    var el = $('stk-coffre'); if (!el || !F.coffre) return;
    var c = canauxL.find(function (x) { return x.channelId === F.coffre; });
    try {
      var r = await api('/api/stocks/' + F.coffre), rows = r.data || [];
      el.innerHTML = '<p class="hint">' + esc(c && c.label || 'Coffre') + (c && c.role === 'logs_coffres_admin' ? ' ' + pill('coffre admin', 'warn') : '') + '</p>'
        + (rows.length ? tableau(['Item', 'Quantité'], rows.map(function (s) { return ['<b>' + esc(nomItem(s)) + '</b>', fmtN(s.quantite)]; }), ['', 'num']) : locked('Aucun mouvement enregistré pour ce coffre.'));
    } catch (e) { el.innerHTML = blocErr(e); }
  }
  async function chargerHistorique(canauxL) {
    var el = $('stk-hist'); if (!el) return;
    var q = { limit: F.histLimit }; if (F.histItem) q.item = F.histItem; if (F.histCoffre) q.channelId = F.histCoffre;
    try {
      var r = await api('/api/stocks/history', q), rows = r.data || [];
      var lbl = function (id) { var c = canauxL.find(function (x) { return x.channelId === id; }); return c ? (c.role === 'logs_coffres_admin' ? '🛡️ ' : '') + (c.label || String(id).slice(-4)) : (id ? '…' + String(id).slice(-4) : '—'); };
      el.innerHTML = rows.length ? tableau(['Quand', 'Joueur', 'Action', 'Item', 'Qté', 'Avant → après', 'Coffre'], rows.map(function (h) {
        var retrait = /retrait|sortie|pris/i.test(h.action);
        return ['<span title="' + esc(fmtDateHeure(h.timestamp)) + '">' + esc(fmtRel(h.timestamp)) + '</span>', esc(h.joueur), pill(h.action, retrait ? 'bad' : 'ok'), '<b>' + esc(titre(h.item)) + '</b>', (retrait ? '−' : '+') + fmtN(h.quantite), '<span class="ref">' + fmtN(h.stockAvant) + ' → ' + fmtN(h.stockApres) + '</span>', esc(lbl(h.channelId))];
      }), ['', '', '', '', 'num', 'num', '']) : locked('Aucun mouvement pour ces filtres.');
    } catch (e) { el.innerHTML = blocErr(e); }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ARMURERIE
  // ═══════════════════════════════════════════════════════════════════════════
  async function rendreArmurerie(cible) {
    var r = await Promise.allSettled([api('/api/armurerie/ammo'), api('/api/armurerie/ammo/history')]);
    var ammo = r[0], hist = r[1], html = '';
    if (ammo.status === 'fulfilled') {
      var a = ammo.value.data, typeLbl = a.fabricationType === 'pistolet' ? 'pistolet' : (a.fabricationType === 'smg' ? 'SMG' : null);
      html += '<div class="kpis sv-kpis">'
        + kpi('Munitions pistolet', fmtN(a.stock), 'en stock, boîtes converties')
        + kpi('Munitions SMG', fmtN(a.stockSmg), 'en stock')
        + kpi('Fabriquées · semaine', fmtN(a.fabriqueesCetteSemaine), typeLbl ? 'calibre ' + typeLbl + ' · plafond ' + fmtN(a.fabricationQuotaHebdo) : 'aucune fabrication pour ce type de groupe')
        + kpi('Vendues · semaine', fmtN(a.vendusCetteSemaine), 'déclarations depuis le dernier reset')
        + '</div>';
    } else html += '<div class="bloc"><div class="bloc-t">Munitions</div>' + blocErr(ammo.reason) + '</div>';

    html += '<div class="bloc"><div class="bloc-t">Armes <small id="arm-sub">' + (F.armeQ ? 'résultats de recherche, perdues comprises' : (F.armeStatut ? '' : 'toutes sauf perdues')) + '</small></div>'
      + '<div class="tx-outils sv-outils">' + recherche('arm-q', 'Nom ou référence…', F.armeQ, 'emBot.filtre(\'armeQ\', this.value)')
      + '<div class="tx-filtres" role="group" aria-label="Filtrer par statut">' + [['', 'Actives'], ['in_stock', 'En stock'], ['loaned', 'Prêtées'], ['lost', 'Perdues']].map(function (f) { return '<button type="button" class="tx-filtre' + (F.armeStatut === f[0] ? ' active' : '') + '" onclick="emBot.filtre(\'armeStatut\', \'' + f[0] + '\')">' + f[1] + '</button>'; }).join('') + '</div>'
      + '<span class="tx-compte" id="arm-compte"></span></div><div id="arm-liste">' + locked('Chargement…') + '</div></div>';

    html += '<div class="bloc"><div class="bloc-t">Ventes de munitions <small>depuis le dernier reset (dimanche 19h)</small></div>';
    if (hist.status === 'fulfilled') {
      var h = hist.value.data || [];
      // `acheteur_id` est l'ID unique EN JEU de l'acheteur, saisi par le vendeur sur Discord —
      // pas un compte Discord : on l'affiche tel quel, sans chercher de nom.
      html += h.length ? tableau(['Quand', 'ID acheteur', 'Quantité', 'Prix'], h.map(function (v) { return ['<span title="' + esc(fmtDateHeure(v.timestamp)) + '">' + esc(fmtRel(v.timestamp)) + '</span>', '<code class="sv-id">' + esc(v.acheteur_id) + '</code>', fmtN(v.quantite), esc(fmt$(v.prix))]; }), ['', '', 'num', 'num'], true) : locked('Aucune vente de munitions déclarée cette semaine.');
    } else html += blocErr(hist.reason);
    html += '</div>';
    cible.innerHTML = html;
    chargerArmes();
  }
  async function chargerArmes() {
    var el = $('arm-liste'), cpt = $('arm-compte'); if (!el) return;
    try {
      var q = String(F.armeQ || '').trim(), r;
      if (q.length >= 2) r = await api('/api/armurerie/search', { q: q });
      else r = await api('/api/armurerie', F.armeStatut ? { status: F.armeStatut } : {});
      var rows = r.data || [];
      if (q.length >= 2 && F.armeStatut) { var stt = { in_stock: 'en_stock', loaned: 'pretee', lost: 'perdue' }[F.armeStatut]; rows = rows.filter(function (a) { return a.statut === stt; }); }
      if (cpt) cpt.textContent = rows.length + ' arme(s)';
      el.innerHTML = rows.length ? tableau(['Arme', 'Référence', 'Type', 'Statut', 'Prêtée à'], rows.map(function (a) { var s = ARME_STATUT[a.statut] || [a.statut, '']; return ['<b>' + esc(a.nom) + '</b>', '<span class="ref">' + esc(a.reference) + '</span>', esc(a.type || '—'), pill(s[0], s[1]), esc(a.preteeA || '—')]; }))
        : locked(q.length >= 2 ? 'Aucune arme ne correspond à « ' + esc(q) + ' ».' : 'Aucune arme dans cette catégorie.');
    } catch (e) { el.innerHTML = blocErr(e); }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BRAQUAGES, COOLDOWNS, LABOS
  // ═══════════════════════════════════════════════════════════════════════════
  async function rendreBraquages(cible) {
    var r = await Promise.allSettled([api('/api/braquages'), api('/api/cooldowns')]);
    var br = r[0], cd = r[1], html = '';
    var pasExpose = function (res) { return res.status === 'rejected' && (res.reason.code === 'bad_request' || res.reason.code === 'not_found'); };

    html += '<div class="bloc"><div class="bloc-t">Braquages <small>créneaux de la semaine glissante (7 jours)</small></div>';
    if (br.status === 'fulfilled') {
      var l = (br.value.data && br.value.data.braquages) || [];
      html += l.length ? '<div class="braq-grid">' + l.map(function (b) {
        var pct = b.limit ? Math.round(100 * b.available / b.limit) : 0, plein = b.available <= 0;
        return '<div class="braq-carte' + (plein ? ' plein' : '') + '"><div class="braq-nom">' + esc(b.label) + '</div><div class="braq-num">' + b.available + '<small> / ' + b.limit + '</small></div>'
          + '<div class="vd-progress sv-prog' + (plein ? '' : ' ok') + '"><span style="width:' + pct + '%"></span></div>'
          + '<div class="braq-note">' + (plein ? (b.nextFreeAt ? 'prochain créneau ' + esc(fmtRel(b.nextFreeAt)) : 'complet') : b.available + ' créneau(x) disponible(s)') + '</div></div>';
      }).join('') + '</div>' : locked('Aucun braquage plafonné pour le type de groupe actuel.');
    } else html += pasExpose(br) ? locked('Ce bot n\'expose pas encore les plafonds de braquage. <small>(correctif n°2 du bot)</small>') : blocErr(br.reason);
    html += '</div>';

    html += '<div class="bloc"><div class="bloc-t">Mes cooldowns <small>décompte en direct</small></div>';
    if (cd.status === 'fulfilled') {
      var cds = (cd.value.data && cd.value.data.cooldowns) || [];
      html += cds.length ? '<div class="cd-liste">' + cds.map(function (c) { return '<div class="cd-row"><span class="cd-quoi">' + esc(c.label) + '</span><span class="cd-reste" data-fin="' + Number(c.expiresAt) + '">…</span><span class="ref">' + esc(fmtDateHeure(c.expiresAt)) + '</span></div>'; }).join('') + '</div>' : locked('Aucun cooldown en cours : tout est disponible.');
    } else html += pasExpose(cd) ? locked('Ce bot n\'expose pas encore les cooldowns. <small>(correctif n°2 du bot)</small>') : blocErr(cd.reason);
    html += '</div>';
    cible.innerHTML = html;
    ticker(function () { cible.querySelectorAll('.cd-reste').forEach(function (el) { var fin = Number(el.dataset.fin); el.textContent = fin > Date.now() ? 'dans ' + fmtDuree(fin - Date.now()) : 'terminé'; el.classList.toggle('fini', fin <= Date.now()); }); });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TAXES
  // ═══════════════════════════════════════════════════════════════════════════
  async function rendreTaxes(cible) {
    if (!(S.me && S.me.isTaxes)) { cible.innerHTML = locked('Les taxes sont réservées au <b>rôle taxes</b> ou aux administrateurs du serveur Discord.'); return; }
    var typesOpts = [['', 'Tous les types']].concat(Object.keys(TAXE_TYPES).map(function (k) { return [k, TAXE_TYPES[k]]; })).concat([['zone', 'Toutes les zones']]);
    cible.innerHTML = '<div class="bloc"><div class="bloc-t">Taxes & racket <small>infos générales ; téléphone et mot de passe à la demande</small></div>'
      + '<div class="tx-outils sv-outils">' + recherche('tx-q', 'Chercher un groupe…', F.taxeQ, 'emBot.filtre(\'taxeQ\', this.value)')
      + '<label class="sv-sel"><span>Type</span><select onchange="emBot.filtre(\'taxeType\', this.value)">' + typesOpts.map(function (t) { return '<option value="' + t[0] + '"' + (F.taxeType === t[0] ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') + '</select></label>'
      + '<div class="tx-filtres" role="group" aria-label="Filtrer par état"><button type="button" class="tx-filtre' + (F.taxeStatut === 'active' ? ' active' : '') + '" onclick="emBot.filtre(\'taxeStatut\', \'active\')">En cours</button><button type="button" class="tx-filtre' + (F.taxeStatut === 'expired' ? ' active' : '') + '" onclick="emBot.filtre(\'taxeStatut\', \'expired\')">Expirées</button></div>'
      + '<span class="tx-compte" id="tx-compte"></span></div><div id="tx-liste">' + locked('Chargement…') + '</div></div>';
    chargerTaxes();
  }
  function libelleTypeTaxe(t) { return TAXE_TYPES[t] || ('Zone · ' + titre(t)); }
  async function chargerTaxes() {
    var el = $('tx-liste'), cpt = $('tx-compte'); if (!el) return;
    try {
      var q = { status: F.taxeStatut }; if (F.taxeType) q.type = F.taxeType;
      var r = await api('/api/taxes', q), needle = String(F.taxeQ || '').trim().toLowerCase();
      var rows = (r.data || []).filter(function (t) { return !needle || String(t.nom).toLowerCase().indexOf(needle) >= 0; });
      if (cpt) cpt.textContent = rows.length + ' taxe(s)';
      el.innerHTML = rows.length ? '<div class="table-wrap"><table class="vd-table taxes-table"><thead><tr><th>Groupe</th><th>Type</th><th>Échéance</th><th>Payée</th><th></th></tr></thead><tbody>'
        + rows.map(function (t) {
          var j = joursRestants(t.echeance), cls = j < 0 ? 'tx-retard' : (j <= 2 ? 'tx-urgent' : '');
          return '<tr class="' + cls + '"><td><b>' + esc(t.nom) + '</b></td><td>' + esc(libelleTypeTaxe(t.type)) + '</td><td>' + esc(fmtDate(t.echeance)) + ' <span class="ref">' + (j < 0 ? 'expirée depuis ' + (-j) + ' j' : (j === 0 ? 'aujourd\'hui' : 'J−' + j)) + '</span></td><td>' + pill(t.paye ? 'payée' : 'à encaisser', t.paye ? 'ok' : 'warn') + '</td><td><button type="button" class="btn ghost sv-mini" onclick="emBot.taxeDetail(' + Number(t.id) + ', this)">Détail</button></td></tr><tr class="sv-detail-row" id="tx-' + Number(t.id) + '" hidden><td colspan="5"></td></tr>';
        }).join('') + '</tbody></table></div>' : locked('Aucune taxe pour ces filtres.');
    } catch (e) { el.innerHTML = blocErr(e); }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CARTE DU MOIS — reconstruite depuis les semaines de l'API
  // ═══════════════════════════════════════════════════════════════════════════
  var B = { mois: '' };
  function moisDispo() {
    var out = [], d = new Date();
    for (var i = 0; i < 3; i++) { var x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(x.getFullYear() + '-' + (x.getMonth() + 1 < 10 ? '0' : '') + (x.getMonth() + 1)); }
    return out;
  }
  function semainesDuMois(mo) {
    // Les semaines ISO dont le lundi tombe dans le mois — même découpage que
    // l'ancien archivage (une semaine appartient au mois où elle commence).
    var y = +mo.slice(0, 4), m = +mo.slice(5, 7) - 1, out = [], d = new Date(Date.UTC(y, m, 1));
    while (d.getUTCMonth() === m) { if ((d.getUTCDay() || 7) === 1) out.push(isoWeek(d)); d.setUTCDate(d.getUTCDate() + 1); }
    return out.filter(function (w) { return lundiDe(w) <= new Date(); });
  }
  function lblMois(mo) { return new Date(mo + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); }

  // Le squelette est rendu tout de suite ; les semaines se chargent ensuite
  // dans le document (chargerBilan), une fois le panneau réellement affiché.
  async function rendreBilan(cible) {
    var mois = moisDispo(); if (!B.mois) B.mois = mois[0];
    cible.innerHTML = '<div class="bilan-tete"><label for="bil-mois" class="bilan-lbl">Mois</label><select class="field" id="bil-mois" onchange="emBot.mois(this.value)">' + mois.map(function (mo) { return '<option value="' + mo + '"' + (mo === B.mois ? ' selected' : '') + '>' + esc(lblMois(mo)) + '</option>'; }).join('') + '</select>'
      + '<button class="btn" id="bil-dl" type="button" style="display:none;">Télécharger l\'image</button></div>'
      + '<div class="bilan-grid"><div class="bloc bilan-carte"><div class="bloc-t">Ma carte du mois <small>à poster sur Discord</small></div><canvas id="bilan-canvas" width="1200" height="675" style="display:none;"></canvas><div id="bilan-etat">' + locked('Lecture des semaines du mois…') + '</div></div>'
      + '<div class="bloc"><div class="bloc-t">Le mois, semaine par semaine <small>d\'après le bot</small></div><div id="bilan-semaines">' + locked('Chargement…') + '</div></div></div>';

  }
  async function chargerBilan() {
    var semaines = semainesDuMois(B.mois), me = S.me;
    var res = await Promise.allSettled(semaines.map(function (w) { return Promise.all([api('/api/ventes', { week: w }), api('/api/quotas', { week: w }), api('/api/quotas/pay', { week: w })]); }));
    var etat = $('bilan-etat'), zone = $('bilan-semaines'); if (!etat) return;
    var parUser = {}, lignes = [], ratees = 0;
    res.forEach(function (r, i) {
      if (r.status !== 'fulfilled') { ratees++; lignes.push({ w: semaines[i], err: r.reason }); return; }
      var ventes = r.value[0].data, quotas = r.value[1].data || [], paies = r.value[2].data || [];
      (ventes.players || []).forEach(function (p) { var u = parUser[p.userId] = parUser[p.userId] || { ventes: 0, recolte: 0, activites: 0, paie: 0 }; u.ventes += p.total; });
      quotas.forEach(function (q) { var u = parUser[q.userId] = parUser[q.userId] || { ventes: 0, recolte: 0, activites: 0, paie: 0 }; u.recolte += (q.byQuotaType && q.byQuotaType.recolte) || 0; u.activites += (q.byQuotaType && q.byQuotaType.actions) || 0; });
      paies.forEach(function (p) { var u = parUser[p.userId] = parUser[p.userId] || { ventes: 0, recolte: 0, activites: 0, paie: 0 }; u.paie += p.salaire || 0; });
      var moiW = (ventes.players || []).find(function (p) { return p.userId === me.id; });
      var paieW = paies.find(function (p) { return p.userId === me.id; });
      lignes.push({ w: semaines[i], groupe: ventes.groupTotal, moi: moiW ? moiW.total : 0, paie: paieW ? paieW.salaire : 0 });
    });
    zone.innerHTML = tableau(['Semaine', 'Mes ventes', 'Ma paie', 'Groupe'], lignes.map(function (l) { return l.err ? [esc(l.w), '<span class="sv-ind">' + esc(libelleCourt(l.err)) + '</span>', '', ''] : [esc(l.w.replace('-W', ' n°')) + '<br><span class="ref">dès le ' + esc(fmtDate(lundiDe(l.w))) + '</span>', '<b>' + fmtN(l.moi) + '</b>', esc(fmt$(l.paie)), fmtN(l.groupe)]; }), ['', 'num', 'num', 'num'])
      + '<p class="hint sv-note">Paie recalculée par le bot avec les taux actuels' + (ratees ? ' · ' + ratees + ' semaine(s) indisponible(s)' : '') + '.</p>';
    if (!semaines.length || ratees === semaines.length) { etat.innerHTML = locked(semaines.length ? 'Le bot n\'a pas répondu pour ce mois.' : 'Aucune semaine commencée dans ce mois.'); return; }
    var moi = parUser[me.id] || { ventes: 0, recolte: 0, activites: 0, paie: 0 };
    var classement = Object.keys(parUser).sort(function (a, b) { return parUser[b].ventes - parUser[a].ventes; });
    var rang = classement.indexOf(me.id) + 1;
    etat.innerHTML = '<div class="hint" style="margin-top:10px;">Télécharge l\'image et poste-la sur Discord — elle est à ta gloire.</div>';
    dessinerCarte(B.mois, moi, rang || classement.length + 1, classement.length);
  }

  function dessinerCarte(mo, moi, rang, n) {
    var cv = $('bilan-canvas'), btn = $('bil-dl'); if (!cv) return;
    cv.style.display = ''; if (btn) btn.style.display = '';
    var ctx = cv.getContext('2d'), nom = monNom() || '?';
    var membre = (window.MONI_MEMBRES || []).find(function (m) { return m.nom === nom; });
    var medaille = rang === 1 ? '🥇' : rang === 2 ? '🥈' : rang === 3 ? '🥉' : '';
    var CAPS = '"Cinzel", Georgia, serif', SERIF = '"Playfair Display", Georgia, serif', BODY = '"Crimson Pro", Georgia, serif';
    var IVOIRE = '#e9dfc9', ENCRE = '#efe6d3', ENCRE2 = '#a89c88', ARGENT = '#d6d6db';
    var espace = function (txt, x, y, pas) { var cx = x; for (var i = 0; i < txt.length; i++) { ctx.fillText(txt[i], cx, y); cx += ctx.measureText(txt[i]).width + pas; } };
    var dessiner = function (logo) {
      ctx.fillStyle = '#0a0a0b'; ctx.fillRect(0, 0, 1200, 675);
      var grad = ctx.createRadialGradient(1050, 120, 40, 1050, 120, 700);
      grad.addColorStop(0, 'rgba(233,223,201,0.08)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 675);
      ctx.strokeStyle = IVOIRE; ctx.lineWidth = 2; ctx.strokeRect(24, 24, 1152, 627);
      ctx.strokeStyle = 'rgba(233,223,201,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(36, 36, 1128, 603);
      if (logo) { ctx.globalAlpha = 0.9; ctx.drawImage(logo, 950, 60, 180, 180); ctx.globalAlpha = 1; }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = IVOIRE; ctx.font = '600 18px ' + CAPS; espace('FAMILLE MONI', 70, 96, 7);
      ctx.fillStyle = ENCRE2; ctx.font = 'italic 400 26px ' + BODY; ctx.fillText('Bilan de ' + lblMois(mo), 70, 134);
      ctx.fillStyle = ENCRE; ctx.font = '900 60px ' + SERIF; ctx.fillText(nom, 70, 212);
      if (membre) { ctx.fillStyle = ARGENT; ctx.font = '600 16px ' + CAPS; espace(String(membre.rang).toUpperCase(), 72, 250, 5); }
      var stats = [['VENTES', fmtN(Math.round(moi.ventes))], ['RÉCOLTE', fmtN(Math.round(moi.recolte))], ['ACTIVITÉS', fmtN(Math.round(moi.activites))], ['PAIE', fmt$(moi.paie)]];
      stats.forEach(function (st, i) {
        var x = 70 + i * 270;
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x, 320, 240, 140);
        ctx.strokeStyle = 'rgba(233,223,201,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(x, 320, 240, 140);
        ctx.fillStyle = ENCRE2; ctx.font = '600 13px ' + CAPS; espace(st[0], x + 22, 356, 3);
        ctx.fillStyle = i === 3 ? IVOIRE : ENCRE; ctx.font = '900 44px ' + SERIF; ctx.fillText(st[1], x + 22, 422);
      });
      ctx.fillStyle = ENCRE; ctx.font = '700 30px ' + SERIF;
      ctx.fillText((medaille ? medaille + '  ' : '') + '#' + rang + ' sur ' + n + ' au classement des ventes du mois', 70, 540);
      ctx.fillStyle = '#6f6f76'; ctx.font = '600 12px ' + CAPS; espace('FAMILLEMONI.COM — ROXWOOD, FLASHBACK FA · CALCULÉ PAR LE BOT MONI', 70, 610, 3);
    };
    var img = new Image(); img.onload = function () { dessiner(img); }; img.onerror = function () { dessiner(null); }; img.src = 'icon-192.png?v=2';
    if (btn) btn.onclick = function () {
      cv.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'bilan-' + mo + '-' + nom.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); });
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════════════════
  var RENDUS = { moi: rendreMoi, famille: rendreFamille, stocks: rendreStocks, armurerie: rendreArmurerie, braquages: rendreBraquages, taxes: rendreTaxes, bilan: rendreBilan };
  var debounce = {};

  async function chargerStatut(force) {
    if (S.statut && !force) return S.statut;
    try {
      var d = await appel({ action: 'status' });
      S.statut = d; S.me = d.linked && d.me ? d.me : null;
      if (d.linked && !d.code) S.derniereOk = S.derniereOk || new Date();
    } catch (e) { S.statut = { configured: true, linked: false, code: e.code, message: e.message, erreur: e }; S.me = null; }
    var sbTaxes = $('sb-taxes'); if (sbTaxes && !modeGerantTaxes) sbTaxes.style.display = (S.me && S.me.isTaxes) ? '' : 'none';
    majChip();
    return S.statut;
  }

  function etatGlobal() {
    var st = S.statut;
    if (!st) return null;
    if (st.erreur) return st.erreur;
    if (!st.configured) return { code: 'not_configured' };
    if (!st.linked) return { code: st.code === 'reconnect' ? 'reconnect' : 'not_linked', message: st.message };
    if (st.code === 'forbidden' || st.code === 'unavailable') return { code: st.code, message: st.message };
    if (!S.me) return { code: 'unavailable', message: 'Identité non résolue.' };
    return null;
  }

  async function rendre(panneau) {
    var cible = $('p-' + panneau); if (!cible) return;
    var jeton = ++rendre.seq;
    stopTickers();
    var err = etatGlobal();
    if (err) { cible.innerHTML = rendreErreur(err); return; }
    S.chargement++;
    cible.setAttribute('aria-busy', 'true');
    if (!cible.innerHTML || /class="locked"/.test(cible.innerHTML)) cible.innerHTML = locked('Chargement des données du bot…');
    try {
      await chargerNoms();
      // Le HTML est construit hors écran (pas de clignotement), puis inséré ;
      // ce qui a besoin du document (graphiques canvas, chargements différés)
      // s'exécute ensuite via la fonction `apres` renvoyée par le rendu.
      var tmp = document.createElement('div');
      var apres = await (RENDUS[panneau] || rendreMoi)(tmp);
      if (jeton !== rendre.seq) return;
      cible.innerHTML = tmp.innerHTML;
      if (typeof apres === 'function') apres(cible);
      if (panneau === 'armurerie') chargerArmes();
      if (panneau === 'taxes' && S.me && S.me.isTaxes) chargerTaxes();
      if (panneau === 'bilan') chargerBilan();
      if (panneau === 'braquages') ticker(function () { cible.querySelectorAll('.cd-reste').forEach(function (el) { var fin = Number(el.dataset.fin); el.textContent = fin > Date.now() ? 'dans ' + fmtDuree(fin - Date.now()) : 'terminé'; }); });
    } catch (e) {
      if (jeton === rendre.seq) cible.innerHTML = rendreErreur(e);
    } finally { S.chargement--; cible.removeAttribute('aria-busy'); }
  }
  rendre.seq = 0;

  window.emBot = {
    /** Appelé une fois à la connexion : vérifie la liaison et prépare les noms. */
    demarrer: async function () { await chargerStatut(true); },
    /** Un panneau bot vient d'être ouvert. */
    ouvrir: function (panneau) { S.panneau = panneau; rendre(panneau); },
    /** Recharge tout ce qui est en cache et redessine le panneau courant. */
    actualiser: async function () {
      S.cache = {}; S.config = undefined; S.nomsCharges = false;
      await chargerStatut(true);
      if (S.panneau) await rendre(S.panneau);
    },
    semaine: function (w) {
      S.week = w || '';
      Object.keys(S.cache).forEach(function (k) { if (/\/api\/(quotas|ventes)/.test(k)) delete S.cache[k]; });
      S.config = undefined;
      if (S.panneau) rendre(S.panneau);
    },
    mois: function (mo) { B.mois = mo; if (S.panneau === 'bilan') rendre('bilan'); },
    /** Ouvre la fiche d'un membre dans La famille (soi-même → Ma semaine ; vide → ferme). */
    membre: function (id) {
      if (id && estMoi(id)) { ouvrirPanneau('moi'); return; }
      F.membre = id || '';
      var el = $('fam-membre');
      if (!F.membre) { stopTickers(); if (el) el.innerHTML = ''; return; }
      if (S.panneau !== 'famille') { ouvrirPanneau('famille'); return; }   // la fiche se charge après le rendu
      chargerFicheMembre(F.membre);
    },
    filtre: function (cle, valeur) {
      F[cle] = valeur;
      if (cle === 'stockQ') { var t = $('stk-table'), c = S.cache['/api/stocks?']; if (t && c && c.data) t.innerHTML = tableStocks(c.data, valeur); return; }
      if (cle === 'coffre') { var lc = S.cache['/api/stocks/channels?']; chargerCoffre(lc && lc.data ? lc.data : []); document.querySelectorAll('.sv-coffres .tx-filtre').forEach(function (b) { b.classList.toggle('active', b.getAttribute('onclick').indexOf("'" + valeur + "'") >= 0); }); return; }
      if (cle === 'histItem' || cle === 'histCoffre' || cle === 'histLimit') { var lh = S.cache['/api/stocks/channels?']; chargerHistorique(lh && lh.data ? lh.data : []); return; }
      if (cle === 'armeQ') { clearTimeout(debounce.arme); debounce.arme = setTimeout(chargerArmes, 300); return; }
      if (cle === 'armeStatut') { document.querySelectorAll('#p-armurerie .tx-filtres .tx-filtre').forEach(function (b) { b.classList.toggle('active', b.getAttribute('onclick').indexOf("'" + valeur + "'") >= 0); }); chargerArmes(); return; }
      if (cle === 'taxeQ') { clearTimeout(debounce.taxe); debounce.taxe = setTimeout(chargerTaxes, 200); return; }
      if (cle === 'taxeType') { chargerTaxes(); return; }
      if (cle === 'taxeStatut') { document.querySelectorAll('#p-taxes .tx-filtres .tx-filtre').forEach(function (b) { b.classList.toggle('active', b.getAttribute('onclick').indexOf("'" + valeur + "'") >= 0); }); chargerTaxes(); return; }
    },
    taxeDetail: async function (id, btn) {
      var row = $('tx-' + id); if (!row) return;
      if (!row.hidden) { row.hidden = true; if (btn) btn.textContent = 'Détail'; return; }
      row.hidden = false; row.firstElementChild.innerHTML = '<span class="hint">Chargement…</span>'; if (btn) btn.textContent = 'Masquer';
      try {
        var r = await api('/api/taxes/' + id), t = r.data;
        row.firstElementChild.innerHTML = '<div class="sv-taxe-detail"><span><b>Téléphone</b> ' + esc(t.telephone || '—') + '</span><span><b>Mot de passe</b> <code>' + esc(t.motDePasse || '—') + '</code></span><span><b>Alerte envoyée</b> ' + (t.alerteSent ? 'oui' : 'non') + '</span><span class="hint">Modifications et renouvellement : sur Discord, panneau Taxes.</span></div>';
      } catch (e) { row.firstElementChild.innerHTML = blocErr(e); }
    },
    delier: async function () {
      if (!confirm('Effacer la connexion au bot conservée côté serveur ? Tu pourras la refaire à tout moment.')) return;
      try { await appel({ action: 'unlink' }); S.cache = {}; S.me = null; toast('Connexion au bot effacée.'); } catch (e) { toast(e.message || 'Impossible', 'err'); }
      await chargerStatut(true); if (S.panneau) rendre(S.panneau);
    },
    etatCompteAttente: function () { var el = $('bot-chip'); if (el) { el.dataset.state = 'off'; el.textContent = 'Validation par un administrateur requise'; el.title = ''; } },
  };
})();
