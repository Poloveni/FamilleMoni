// ─────────────────────────────────────────────────────────────────────────────
//  Suivi de la famille — rubrique de l'espace membre alimentée par l'API REST
//  du bot Discord (bot-moni-v3), en LECTURE SEULE.
//
//  Le navigateur ne parle jamais au bot directement : chaque lecture passe par
//  l'Edge Function Supabase `bot-suivi` (supabase/functions/bot-suivi), qui
//  détient le jeton du bot côté serveur, vérifie que le membre est approuvé
//  sur le site, et ne relaie que des routes GET connues. Ici, on ne fait
//  qu'afficher ce que le bot calcule : aucun chiffre n'est recalculé ou
//  inventé côté site. Quand le bot ne répond pas, on l'écrit — on n'affiche
//  pas des zéros à la place.
//
//  Dépend des globales de espace-membre.html : sb (client Supabase),
//  currentUser, escT(), toast(), fmtArgent(), window.SUPABASE_URL/KEY,
//  window.MONI_NOM_FIX. Chargé après le script principal.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var FN_URL = String(window.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/bot-suivi';

  // ── État ──────────────────────────────────────────────────────────────────
  var S = {
    initialise: false,
    statut: null,          // dernière réponse `status` de la passerelle
    me: null,              // { id, username, isAdmin, isTaxes } vu par le bot
    onglet: 'vue',
    week: '',              // '' = semaine en cours (depuis le dernier reset du bot), sinon 'AAAA-Www'
    config: undefined,     // /api/quotas/config (bot à jour) — null si le bot ne l'expose pas
    cache: {},             // clé → { data, at }
    derniereOk: null,      // Date de la dernière récupération réussie (tous onglets)
    noms: {},              // discordId → nom affiché
    nomsCharges: false,
    chargement: 0,
  };

  var ONGLETS = [
    { id: 'vue',       lbl: 'Vue d\'ensemble' },
    { id: 'stocks',    lbl: 'Stocks' },
    { id: 'quotas',    lbl: 'Quotas & paie' },
    { id: 'ventes',    lbl: 'Ventes' },
    { id: 'armurerie', lbl: 'Armurerie' },
    { id: 'taxes',     lbl: 'Taxes', taxes: true },
  ];

  var TAXE_TYPES = { sporex: 'Taxe Spore X', heroine: 'Taxe Héroïne', vente: 'Taxe Vente', fertilisant: 'Taxe Fertilisant', cannabis: 'Taxe Cannabis', mexicana: 'Taxe Mexicana', cocaine: 'Taxe Cocaïne' };
  var QUOTA_LBL = { vente: 'Ventes', actions: 'Actions', recolte: 'Récolte', labos: 'Labos' };
  var ARME_STATUT = { en_stock: ['En stock', 'ok'], pretee: ['Prêtée', 'warn'], perdue: ['Perdue', 'bad'] };

  // ── Petits utilitaires ────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) { return typeof escT === 'function' ? escT(s) : String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function fmtN(n) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 }); }
  function fmt$(n) { return typeof fmtArgent === 'function' ? fmtArgent(Math.round(Number(n || 0))) : '$' + fmtN(n); }
  function titre(s) { return String(s || '').toLowerCase().replace(/(^|[\s'’\-_])([a-zà-ÿ])/g, function (m, sep, c) { return (sep === '_' ? ' ' : sep) + c.toUpperCase(); }); }
  function fmtDate(ms) { var d = new Date(Number(ms)); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function fmtDateHeure(ms) { var d = new Date(Number(ms)); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function fmtHeure(d) { return d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'; }
  function fmtRel(ms) {
    var diff = Date.now() - Number(ms);
    var abs = Math.abs(diff), sgn = diff >= 0 ? 'il y a ' : 'dans ';
    if (abs < 60e3) return diff >= 0 ? 'à l\'instant' : 'dans moins d\'une minute';
    if (abs < 3600e3) return sgn + Math.round(abs / 60e3) + ' min';
    if (abs < 86400e3) return sgn + Math.round(abs / 3600e3) + ' h';
    return sgn + Math.round(abs / 86400e3) + ' j';
  }
  function joursRestants(ms) { return Math.ceil((Number(ms) - Date.now()) / 86400e3); }
  function pill(txt, cls) { return '<span class="pill' + (cls ? ' ' + cls : '') + '">' + esc(txt) + '</span>'; }
  function locked(html) { return '<div class="locked">' + html + '</div>'; }
  function idCourt(id) { return 'Membre …' + String(id || '').slice(-4); }
  function nomDe(id) { return S.noms[id] || (window.MONI_NOM_FIX || {})[id] || idCourt(id); }
  function estMoi(id) { return !!(S.me && S.me.id === id); }

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
    for (var i = 1; i <= n; i++) { var x = new Date(d.getTime() - i * 7 * 86400e3); out.push(isoWeek(x)); }
    return out;
  }

  // ── Passerelle ────────────────────────────────────────────────────────────
  function ErreurSuivi(code, message, statut) { this.code = code || 'unknown'; this.message = message || 'Erreur'; this.statut = statut || 0; }
  ErreurSuivi.prototype = Object.create(Error.prototype);

  async function appel(payload) {
    if (typeof sb === 'undefined') throw new ErreurSuivi('unauthorized', 'Client Supabase absent.');
    var session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (e) {}
    if (!session) throw new ErreurSuivi('unauthorized', 'Session du site expirée — reconnecte-toi à l\'espace membre.', 401);
    var r;
    try {
      r = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: window.SUPABASE_KEY || '' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      throw new ErreurSuivi('gateway', 'La passerelle du site ne répond pas (' + (e && e.message || e) + ').', 0);
    }
    var d = null;
    try { d = await r.json(); } catch (e) {}
    if (!d) throw new ErreurSuivi(r.status === 404 ? 'gateway_missing' : 'gateway', 'Réponse illisible de la passerelle (' + r.status + ').', r.status);
    if (!r.ok || d.ok === false) throw new ErreurSuivi(d.code || 'gateway', d.message || ('Erreur ' + r.status), r.status);
    return d;
  }

  /** GET relayé vers le bot, avec cache par (chemin + paramètres). */
  async function api(path, query, opts) {
    query = query || {};
    var cle = path + '?' + Object.keys(query).sort().map(function (k) { return k + '=' + query[k]; }).join('&');
    if (!(opts && opts.force) && S.cache[cle]) return S.cache[cle];
    var d = await appel({ action: 'api', path: path, query: query });
    var res = { data: d.data, at: new Date(d.fetchedAt || Date.now()) };
    S.cache[cle] = res;
    S.derniereOk = res.at;
    return res;
  }

  function semaineQuery() { return S.week ? { week: S.week } : {}; }

  // ── Noms des membres ──────────────────────────────────────────────────────
  async function chargerNoms() {
    if (S.nomsCharges) return;
    S.nomsCharges = true;
    var fix = window.MONI_NOM_FIX || {};
    // 1. La correspondance nom en jeu ↔ Discord que le site connaît déjà
    //    (table miroir bot_user_mapping, lisible par tout membre approuvé).
    try {
      var q = await sb.from('bot_user_mapping').select('discord_id, game_name');
      (q.data || []).forEach(function (m) { if (m.discord_id && !S.noms[m.discord_id]) S.noms[m.discord_id] = fix[m.discord_id] || titre(m.game_name); });
    } catch (e) {}
    // 2. Les comptes connus du bot (un admin reçoit tout le monde, un membre lui-même).
    try {
      var u = await api('/api/users');
      (u.data || []).forEach(function (x) { if (x.userId && !S.noms[x.userId]) S.noms[x.userId] = fix[x.userId] || titre(x.username); });
    } catch (e) {}
    Object.keys(fix).forEach(function (id) { S.noms[id] = fix[id]; });
  }

  // ── Rendu des états ───────────────────────────────────────────────────────
  function boutonConnexion(lbl) {
    var url = S.statut && S.statut.loginUrl;
    if (!url) return '';
    return '<a class="btn discord sv-btn" href="' + esc(url) + '" rel="noopener">' + esc(lbl || 'Connecter mon compte Discord au bot') + '</a>';
  }

  function rendreErreur(err) {
    var code = err && err.code, msg = esc(err && err.message || '');
    switch (code) {
      case 'not_configured':
        return locked('La liaison avec le bot n\'est <b>pas encore configurée</b> sur le site.<br><small>Un administrateur doit renseigner l\'adresse de l\'API du bot (voir <code>docs/SUIVI-FAMILLE.md</code>).</small>');
      case 'not_linked':
        return locked('Pour consulter les données du bot, <b>connecte une fois ton compte Discord</b> auprès du bot Moni.<br><small>Tu seras redirigé(e) vers Discord, puis ramené(e) ici. Le site ne garde aucun mot de passe : seul un jeton de lecture, conservé côté serveur, valable 7 jours.</small><div class="sv-cta">' + boutonConnexion() + '</div>');
      case 'reconnect':
        return locked('Ta connexion au bot a <b>expiré ou a été révoquée</b> (les jetons du bot durent 7 jours).<br><small>' + msg + '</small><div class="sv-cta">' + boutonConnexion('Me reconnecter au bot') + '</div>');
      case 'forbidden':
        return locked('<b>Accès refusé</b> par le bot.<br><small>' + msg + '</small>');
      case 'not_found':
        return locked('<b>Introuvable</b> côté bot.<br><small>' + msg + '</small>');
      case 'unavailable':
      case 'gateway':
        return locked('<b>Bot indisponible</b> pour le moment — aucune donnée n\'est affichée plutôt que des chiffres faux.<br><small>' + msg + '</small><div class="sv-cta"><button type="button" class="btn ghost sv-btn" onclick="suiviActualiser()">Réessayer</button></div>');
      case 'gateway_missing':
        return locked('La passerelle <code>bot-suivi</code> n\'est <b>pas déployée</b> sur Supabase.<br><small>Voir <code>docs/SUIVI-FAMILLE.md</code>, étape « Déployer la fonction ».</small>');
      case 'site_forbidden':
        return locked('<b>Accès non ouvert</b> pour ce compte du site.<br><small>' + msg + '</small>');
      case 'unauthorized':
        return locked('<b>Session du site expirée.</b> Recharge la page et reconnecte-toi.');
      case 'no_discord_identity':
        return locked('Ton compte du site n\'est <b>pas relié à Discord</b>.<br><small>Déconnecte-toi puis utilise « Se connecter avec Discord » : c\'est ce qui permet de prouver que les données du bot sont bien les tiennes.</small>');
      case 'mismatch':
      case 'wrong_guild':
        return locked('<b>Liaison refusée.</b><br><small>' + msg + '</small><div class="sv-cta">' + boutonConnexion('Recommencer la connexion') + '</div>');
      default:
        return locked('<b>Erreur</b> : ' + msg);
    }
  }

  /** Une section (bloc) qui affiche un état d'erreur au lieu de son contenu. */
  function blocErreur(titreTxt, err) {
    return '<div class="bloc"><div class="bloc-t">' + esc(titreTxt) + '</div>' + rendreErreur(err) + '</div>';
  }

  // ── Barre d'état ──────────────────────────────────────────────────────────
  function rendreBarre() {
    var el = $('suivi-bar');
    if (!el) return;
    var st = S.statut, me = S.me;
    var gauche = '';
    if (!st) gauche = pill('Vérification…');
    else if (!st.configured) gauche = pill('Non configuré', 'warn');
    else if (!st.linked) gauche = pill('Non connecté au bot', 'warn');
    else if (st.code === 'unavailable') gauche = pill('Bot injoignable', 'bad') + (me ? ' <span class="sv-qui">' + esc(me.username) + '</span>' : '');
    else if (st.code === 'forbidden') gauche = pill('Accès refusé', 'bad');
    else gauche = pill('Connecté au bot', 'ok') + (me ? ' <span class="sv-qui">' + esc(me.username) + (me.isAdmin ? ' · administrateur' : (me.isTaxes ? ' · rôle taxes' : '')) + '</span>' : '');

    var exp = st && st.expiresAt ? '<span class="sv-exp" title="Le jeton du bot dure 7 jours, puis il faut se reconnecter.">jeton jusqu\'au ' + esc(fmtDate(new Date(st.expiresAt).getTime())) + '</span>' : '';
    var maj = '<span class="sv-maj" id="suivi-maj">' + (S.derniereOk ? 'Dernière récupération réussie : ' + esc(fmtHeure(S.derniereOk)) : 'Aucune donnée récupérée pour l\'instant') + '</span>';

    var semaine = '';
    if (S.onglet === 'vue' || S.onglet === 'quotas' || S.onglet === 'ventes') {
      semaine = '<label class="sv-semaine"><span>Période</span><select id="suivi-week" onchange="suiviSemaine(this.value)">'
        + '<option value=""' + (S.week ? '' : ' selected') + '>Semaine en cours (depuis le reset du bot)</option>'
        + semainesPassees(8).map(function (w) { return '<option value="' + w + '"' + (S.week === w ? ' selected' : '') + '>Semaine ' + w.replace('-W', ' n°') + '</option>'; }).join('')
        + '</select></label>';
    }
    var boutons = '<button type="button" class="btn ghost sv-btn" onclick="suiviActualiser()" ' + (S.chargement ? 'disabled' : '') + '>' + (S.chargement ? 'Actualisation…' : 'Actualiser') + '</button>'
      + (st && st.linked ? '<button type="button" class="sv-lien" onclick="suiviDelier()" title="Efface le jeton du bot conservé côté serveur">Délier</button>' : '');

    el.innerHTML = '<div class="sv-bar-g">' + gauche + exp + '</div><div class="sv-bar-d">' + semaine + boutons + '</div><div class="sv-bar-b">' + maj + ' ' + pill('Lecture seule — gestion sur Discord') + '</div>';
  }

  function rendreOnglets() {
    var el = $('suivi-onglets');
    if (!el) return;
    el.innerHTML = ONGLETS.filter(function (o) { return !o.taxes || (S.me && S.me.isTaxes); }).map(function (o) {
      return '<button type="button" class="tx-filtre' + (S.onglet === o.id ? ' active' : '') + '" data-onglet="' + o.id + '" onclick="suiviOnglet(\'' + o.id + '\')">' + esc(o.lbl) + '</button>';
    }).join('');
  }

  function periodeTexte() {
    if (S.config && S.config.range) {
      var r = S.config.range;
      return (S.week ? 'Semaine ' + S.week.replace('-W', ' n°') + ' · ' : 'Semaine en cours · ') + 'du ' + fmtDateHeure(r.since) + ' au ' + fmtDateHeure(r.until);
    }
    return S.week ? 'Semaine ISO ' + S.week + ' (lundi 00h UTC → lundi suivant)' : 'Semaine en cours, depuis le dernier reset hebdomadaire du bot (dimanche 19h)';
  }
  function avertissementSemainePassee() {
    if (!S.week) return '';
    return '<p class="hint sv-note">Semaine passée : le bot recalcule la paie et les objectifs avec les <b>taux et objectifs actuels</b> (il n\'historise pas les anciens). Les ventes, elles, ne dépendent d\'aucun taux.</p>';
  }

  // ── Chargement de la config du bot (route ajoutée par le correctif) ───────
  async function chargerConfig() {
    try {
      var r = await api('/api/quotas/config', semaineQuery());
      // Sur un bot pas encore corrigé, cette adresse tombe sur /:userId et
      // renvoie soit 403, soit un quota vide : on ne la prend que si elle a
      // la forme attendue.
      S.config = (r.data && r.data.range && r.data.targets) ? r.data : null;
    } catch (e) { S.config = null; }
  }

  // ── Onglet : Vue d'ensemble ───────────────────────────────────────────────
  async function rendreVue(cible) {
    await chargerConfig();
    var me = S.me;
    var res = await Promise.allSettled([
      api('/api/quotas/pay/' + me.id, semaineQuery()),
      api('/api/ventes/' + me.id, semaineQuery()),
      api('/api/quotas/ranking', semaineQuery()),
      api('/api/ventes', semaineQuery()),
      api('/api/quotas/summary', semaineQuery()),
      api('/api/quotas/' + me.id, semaineQuery()),
    ]);
    var paie = res[0], mesVentes = res[1], rang = res[2], ventes = res[3], bilan = res[4], quota = res[5];
    var kpis = '';
    var cible0 = S.config && S.config.targets ? S.config.targets : null;

    kpis += kpi('Ma paie calculée', paie.status === 'fulfilled' ? fmt$(paie.value.data.salaire) : null, paie, S.config && S.config.salaryRates ? 'taux actuels du bot' : 'calculée par le bot');
    var mv = mesVentes.status === 'fulfilled' ? mesVentes.value.data.total : null;
    kpis += kpi('Mes ventes', mv != null ? fmtN(mv) : null, mesVentes, cible0 && cible0.vente ? 'objectif : ' + fmtN(cible0.vente) + ' · ' + Math.min(999, Math.round(100 * mv / cible0.vente)) + ' %' : 'unités vendues, confirmées');
    var rangTxt = null, rangFoot = 'classement par points du bot';
    if (rang.status === 'fulfilled') {
      var liste = rang.value.data || [];
      var idx = liste.findIndex(function (x) { return x.userId === me.id; });
      rangTxt = idx >= 0 ? (idx + 1) + '<small> / ' + liste.length + '</small>' : '—';
      rangFoot = idx >= 0 ? fmtN(liste[idx].points) + ' points' : (liste.length ? 'aucun point cette période' : 'personne n\'a de points');
    }
    kpis += kpi('Mon rang', rangTxt, rang, rangFoot, true);
    kpis += kpi('Ventes du groupe', ventes.status === 'fulfilled' ? fmtN(ventes.value.data.groupTotal) : null, ventes, ventes.status === 'fulfilled' ? (ventes.value.data.players || []).length + ' vendeur(s)' : '');

    var html = '<div class="kpis sv-kpis">' + kpis + '</div>';
    html += '<p class="hint sv-periode">' + esc(periodeTexte()) + '</p>' + avertissementSemainePassee();

    // Mon quota par catégorie
    html += '<div class="grid2 sv-grid">';
    html += '<div class="bloc"><div class="bloc-t">Mon quota <small>par catégorie</small></div>';
    if (quota.status === 'fulfilled') html += tableQuota(quota.value.data.byQuotaType, cible0);
    else html += rendreErreur(quota.reason);
    html += '</div>';

    // Bilan du groupe
    html += '<div class="bloc"><div class="bloc-t">Bilan du groupe <small>par activité</small></div>';
    if (bilan.status === 'fulfilled') {
      var rows = (bilan.value.data || []).slice().sort(function (a, b) { return b.total - a.total; });
      html += rows.length ? tableau(['Activité', 'Total'], rows.map(function (r) { return [esc(r.label && r.label !== r.action ? r.label : titre(r.action)), '<b>' + fmtN(r.total) + '</b>']; }), ['', 'num'])
        : locked('Aucune activité déclarée sur cette période.');
    } else html += rendreErreur(bilan.reason);
    html += '</div></div>';

    cible.innerHTML = html;
  }

  function kpi(label, valeur, res, foot, brut) {
    var v = valeur == null ? '<span class="sv-ind" title="' + esc(res && res.reason && res.reason.message || 'Indisponible') + '">indisponible</span>' : (brut ? valeur : esc(valeur));
    var f = valeur == null ? esc(res && res.reason ? libelleErreurCourt(res.reason) : '') : esc(foot || '');
    return '<div class="kpi"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-num">' + v + '</div><div class="kpi-foot">' + f + '</div></div>';
  }
  function libelleErreurCourt(err) {
    switch (err && err.code) {
      case 'forbidden': return 'accès refusé par le bot';
      case 'unavailable': case 'gateway': return 'bot injoignable';
      case 'reconnect': return 'reconnexion au bot requise';
      case 'not_linked': return 'compte non connecté au bot';
      default: return err && err.message ? String(err.message).slice(0, 60) : '';
    }
  }

  function tableQuota(byQuotaType, cibles) {
    var cats = Object.keys(byQuotaType || {});
    if (!cats.length) return locked('Aucune activité sur cette période.');
    var rows = cats.map(function (c) {
      var val = byQuotaType[c] || 0, obj = cibles && cibles[c];
      var prog = '';
      if (obj) {
        var p = Math.min(100, Math.round(100 * val / obj));
        prog = '<div class="vd-progress sv-prog' + (val >= obj ? ' ok' : '') + '"><span style="width:' + p + '%"></span></div><div class="vd-progress-txt">' + fmtN(val) + ' / ' + fmtN(obj) + ' · ' + p + ' %</div>';
      } else prog = '<span class="hint">' + (cibles ? 'pas d\'objectif configuré' : 'objectif non exposé par ce bot') + '</span>';
      return ['<b>' + esc(QUOTA_LBL[c] || titre(c)) + '</b>', fmtN(val), prog];
    });
    return tableau(['Catégorie', 'Fait', 'Objectif'], rows, ['', 'num', 'prog']);
  }

  // ── Onglet : Stocks ───────────────────────────────────────────────────────
  var F = { stockQ: '', coffre: '', histItem: '', histCoffre: '', histLimit: '50', armeStatut: '', armeQ: '', taxeType: '', taxeStatut: 'active', taxeQ: '' };

  async function rendreStocks(cible) {
    var res = await Promise.allSettled([api('/api/stocks'), api('/api/stocks/channels')]);
    var stocks = res[0], canaux = res[1];
    var listeCanaux = canaux.status === 'fulfilled' ? (canaux.value.data || []) : [];
    var html = '';

    // Stock général
    html += '<div class="bloc"><div class="bloc-t">Stock général <small>tous coffres confondus, coffres administrateurs inclus</small></div>';
    if (stocks.status === 'fulfilled') {
      html += outils('sv-stock-q', 'Chercher un item…', F.stockQ, 'suiviFiltre(\'stockQ\', this.value)') + '<div id="sv-stock-table">' + tableStocks(stocks.value.data || [], F.stockQ) + '</div>';
    } else html += rendreErreur(stocks.reason);
    html += '</div>';

    // Coffres accessibles
    html += '<div class="bloc"><div class="bloc-t">Coffres accessibles <small>' + (S.me && S.me.isAdmin ? 'coffres normaux et administrateurs' : 'les coffres administrateurs sont réservés aux administrateurs') + '</small></div>';
    if (canaux.status === 'fulfilled') {
      if (!listeCanaux.length) html += locked('Aucun coffre suivi n\'est configuré côté bot (<code>/config channel add-log-coffre</code>).');
      else {
        html += '<div class="sv-coffres">' + listeCanaux.map(function (c) {
          var lbl = c.label || ('Coffre ' + String(c.channelId).slice(-4));
          return '<button type="button" class="tx-filtre' + (F.coffre === c.channelId ? ' active' : '') + '" onclick="suiviFiltre(\'coffre\', \'' + esc(c.channelId) + '\')">' + (c.role === 'logs_coffres_admin' ? '🛡️ ' : '') + esc(lbl) + '</button>';
        }).join('') + '</div><div id="sv-coffre-detail">' + (F.coffre ? locked('Chargement…') : '<p class="hint">Choisis un coffre pour voir son contenu.</p>') + '</div>';
      }
    } else html += rendreErreur(canaux.reason);
    html += '</div>';

    // Historique
    var items = stocks.status === 'fulfilled' ? (stocks.value.data || []).map(function (s) { return s.item; }) : [];
    html += '<div class="bloc"><div class="bloc-t">Historique des mouvements <small>du plus récent au plus ancien</small></div>';
    html += '<div class="tx-outils sv-outils">'
      + '<label class="sv-sel"><span>Item</span><select onchange="suiviFiltre(\'histItem\', this.value)"><option value="">Tous</option>' + items.map(function (i) { return '<option value="' + esc(i) + '"' + (F.histItem === i ? ' selected' : '') + '>' + esc(titre(i)) + '</option>'; }).join('') + '</select></label>'
      + '<label class="sv-sel"><span>Coffre</span><select onchange="suiviFiltre(\'histCoffre\', this.value)"><option value="">Tous</option>' + listeCanaux.map(function (c) { return '<option value="' + esc(c.channelId) + '"' + (F.histCoffre === c.channelId ? ' selected' : '') + '>' + esc(c.label || String(c.channelId).slice(-4)) + '</option>'; }).join('') + '</select></label>'
      + '<label class="sv-sel"><span>Nombre</span><select onchange="suiviFiltre(\'histLimit\', this.value)">' + ['20', '50', '100', '200'].map(function (n) { return '<option value="' + n + '"' + (F.histLimit === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>'
      + '</div><div id="sv-hist">' + locked('Chargement…') + '</div></div>';

    cible.innerHTML = html;
    if (F.coffre) chargerCoffre(listeCanaux);
    chargerHistorique(listeCanaux);
  }

  function tableStocks(liste, q) {
    q = String(q || '').trim().toLowerCase();
    var rows = liste.filter(function (s) { return !q || String(s.item).toLowerCase().indexOf(q) >= 0; });
    if (!rows.length) return locked(liste.length ? 'Aucun item ne correspond.' : 'Aucun stock connu du bot.');
    var total = rows.reduce(function (a, s) { return a + (s.quantite || 0); }, 0);
    return tableau(['Item', 'Quantité'], rows.map(function (s) { return ['<b>' + esc(titre(s.item)) + '</b>', fmtN(s.quantite)]; }), ['', 'num'])
      + '<p class="hint sv-note">' + rows.length + ' item(s) · ' + fmtN(total) + ' unités au total (toutes natures confondues).</p>';
  }

  async function chargerCoffre(listeCanaux) {
    var el = $('sv-coffre-detail');
    if (!el || !F.coffre) return;
    var c = listeCanaux.find(function (x) { return x.channelId === F.coffre; });
    try {
      var r = await api('/api/stocks/' + F.coffre);
      var rows = r.data || [];
      el.innerHTML = '<p class="hint">' + esc(c && c.label || 'Coffre') + (c && c.role === 'logs_coffres_admin' ? ' ' + pill('coffre admin', 'warn') : '') + '</p>'
        + (rows.length ? tableau(['Item', 'Quantité'], rows.map(function (s) { return ['<b>' + esc(titre(s.item)) + '</b>', fmtN(s.quantite)]; }), ['', 'num']) : locked('Aucun mouvement enregistré pour ce coffre.'));
      majMaj();
    } catch (e) { el.innerHTML = rendreErreur(e); }
  }

  async function chargerHistorique(listeCanaux) {
    var el = $('sv-hist');
    if (!el) return;
    var q = { limit: F.histLimit };
    if (F.histItem) q.item = F.histItem;
    if (F.histCoffre) q.channelId = F.histCoffre;
    try {
      var r = await api('/api/stocks/history', q);
      var rows = r.data || [];
      var lblCoffre = function (id) { var c = listeCanaux.find(function (x) { return x.channelId === id; }); return c ? (c.role === 'logs_coffres_admin' ? '🛡️ ' : '') + (c.label || String(id).slice(-4)) : (id ? '…' + String(id).slice(-4) : '—'); };
      el.innerHTML = rows.length ? tableau(['Quand', 'Joueur', 'Action', 'Item', 'Qté', 'Avant → après', 'Coffre'], rows.map(function (h) {
        var retrait = /retrait|sortie|pris/i.test(h.action);
        return ['<span title="' + esc(fmtDateHeure(h.timestamp)) + '">' + esc(fmtRel(h.timestamp)) + '</span>', esc(h.joueur), pill(h.action, retrait ? 'bad' : 'ok'), '<b>' + esc(titre(h.item)) + '</b>', (retrait ? '−' : '+') + fmtN(h.quantite), '<span class="ref">' + fmtN(h.stockAvant) + ' → ' + fmtN(h.stockApres) + '</span>', esc(lblCoffre(h.channelId))];
      }), ['', '', '', '', 'num', 'num', '']) : locked('Aucun mouvement pour ces filtres.');
      majMaj();
    } catch (e) { el.innerHTML = rendreErreur(e); }
  }

  // ── Onglet : Quotas & paie ────────────────────────────────────────────────
  async function rendreQuotas(cible) {
    await chargerConfig();
    var me = S.me;
    var res = await Promise.allSettled([
      api('/api/quotas/' + me.id, semaineQuery()),
      api('/api/quotas/pay/' + me.id, semaineQuery()),
      api('/api/quotas/ranking', semaineQuery()),
      api('/api/quotas/pay', semaineQuery()),
      api('/api/quotas/summary', semaineQuery()),
    ]);
    var quota = res[0], paie = res[1], rang = res[2], paies = res[3], bilan = res[4];
    var cibles = S.config && S.config.targets ? S.config.targets : null;
    var acts = S.config && S.config.activities ? S.config.activities : {};
    var html = '<p class="hint sv-periode">' + esc(periodeTexte()) + '</p>' + avertissementSemainePassee();

    html += '<div class="grid2 sv-grid">';
    // Ma progression
    html += '<div class="bloc"><div class="bloc-t">Ma progression <small>objectifs hebdomadaires</small></div>';
    if (quota.status === 'fulfilled') {
      html += tableQuota(quota.value.data.byQuotaType, cibles);
      var map = quota.value.data.map || {};
      var det = Object.keys(map).filter(function (k) { return map[k] && map[k].count; });
      if (det.length) {
        html += '<details class="sv-details"><summary>Détail par activité</summary>' + tableau(['Activité', 'Fait'], det.map(function (k) { return [esc(acts[k] ? acts[k].label : titre(k)), fmtN(map[k].count)]; }), ['', 'num']) + '</details>';
      }
    } else html += rendreErreur(quota.reason);
    html += '</div>';

    // Ma paie
    html += '<div class="bloc"><div class="bloc-t">Ma paie <small>calculée par le bot</small></div>';
    if (paie.status === 'fulfilled') {
      var p = paie.value.data;
      html += '<div class="sv-paie">' + esc(fmt$(p.salaire)) + '</div>';
      var taux = S.config && S.config.salaryRates;
      if (taux) {
        var lignes = Object.keys(taux).map(function (c) { return [esc(QUOTA_LBL[c] || titre(c)), fmtN(p.byQuotaType && p.byQuotaType[c] || 0), fmt$(taux[c]) + ' / unité']; });
        html += tableau(['Catégorie', 'Fait', 'Taux actuel'], lignes, ['', 'num', 'num']);
        var it = S.config.itemSalaryRates || {};
        if (Object.keys(it).length) html += '<p class="hint sv-note">Taux spécifiques : ' + Object.keys(it).map(function (k) { return esc(k) + ' ' + esc(fmt$(it[k])); }).join(' · ') + '.</p>';
      } else html += '<p class="hint sv-note">Le détail des taux n\'est pas exposé par ce bot ; le montant vient du bot tel quel.</p>';
    } else html += rendreErreur(paie.reason);
    html += '</div></div>';

    // Classement
    html += '<div class="grid2 sv-grid">';
    html += '<div class="bloc"><div class="bloc-t">Classement du groupe <small>par points, décroissant</small></div>';
    if (rang.status === 'fulfilled') {
      var liste = rang.value.data || [];
      html += liste.length ? '<div class="table-wrap"><table class="vd-table sv-compact"><thead><tr><th class="rk">#</th><th>Membre</th><th class="num">Points</th></tr></thead><tbody>'
        + liste.map(function (r, i) { return '<tr' + (estMoi(r.userId) ? ' class="moi"' : '') + '><td class="rk">' + (i + 1) + '</td><td>' + esc(nomDe(r.userId)) + (estMoi(r.userId) ? ' <span class="cd-me">toi</span>' : '') + '</td><td class="num"><b>' + fmtN(r.points) + '</b></td></tr>'; }).join('')
        + '</tbody></table></div>' : locked('Personne n\'a encore de points sur cette période.');
    } else html += rendreErreur(rang.reason);
    html += '</div>';

    // Paie du groupe
    html += '<div class="bloc"><div class="bloc-t">Paie du groupe <small>tous les membres suivis, même à 0 $</small></div>';
    if (paies.status === 'fulfilled') {
      var lp = (paies.value.data || []).slice().sort(function (a, b) { return b.salaire - a.salaire; });
      html += lp.length ? '<div class="table-wrap"><table class="vd-table sv-compact"><thead><tr><th>Membre</th><th class="num">Paie</th></tr></thead><tbody>'
        + lp.map(function (r) { return '<tr' + (estMoi(r.userId) ? ' class="moi"' : '') + '><td>' + esc(nomDe(r.userId)) + '</td><td class="num paie">' + esc(fmt$(r.salaire)) + '</td></tr>'; }).join('')
        + '</tbody></table></div>' : locked('Aucun membre suivi sur cette période.');
    } else html += rendreErreur(paies.reason);
    html += '</div></div>';

    // Bilan
    html += '<div class="bloc"><div class="bloc-t">Bilan du groupe <small>total par activité</small></div>';
    if (bilan.status === 'fulfilled') {
      var b = (bilan.value.data || []).slice().sort(function (x, y) { return y.total - x.total; });
      html += b.length ? tableau(['Activité', 'Total'], b.map(function (r) { return [esc(r.label && r.label !== r.action ? r.label : titre(r.action)), '<b>' + fmtN(r.total) + '</b>']; }), ['', 'num']) : locked('Aucune activité déclarée.');
    } else html += rendreErreur(bilan.reason);
    html += '</div>';

    cible.innerHTML = html;
  }

  // ── Onglet : Ventes ───────────────────────────────────────────────────────
  async function rendreVentes(cible) {
    await chargerConfig();
    var me = S.me;
    var res = await Promise.allSettled([api('/api/ventes', semaineQuery()), api('/api/ventes/' + me.id, semaineQuery())]);
    var groupe = res[0], moi = res[1];
    var html = '<p class="hint sv-periode">' + esc(periodeTexte()) + '</p>';
    html += '<div class="grid2 sv-grid">';
    html += '<div class="bloc"><div class="bloc-t">Ventes du groupe <small>unités confirmées, par vendeur</small></div>';
    if (groupe.status === 'fulfilled') {
      var g = groupe.value.data, pl = g.players || [];
      html += '<div class="sv-paie">' + fmtN(g.groupTotal) + ' <small>unités</small></div>';
      html += pl.length ? '<div class="table-wrap"><table class="vd-table sv-compact"><thead><tr><th class="rk">#</th><th>Membre</th><th class="num">Vendu</th><th class="num">Part</th></tr></thead><tbody>'
        + pl.map(function (p, i) { return '<tr' + (estMoi(p.userId) ? ' class="moi"' : '') + '><td class="rk">' + (i + 1) + '</td><td>' + esc(nomDe(p.userId)) + '</td><td class="num"><b>' + fmtN(p.total) + '</b></td><td class="num ref">' + (g.groupTotal ? Math.round(100 * p.total / g.groupTotal) : 0) + ' %</td></tr>'; }).join('')
        + '</tbody></table></div>' : locked('Aucune vente confirmée sur cette période.');
    } else html += rendreErreur(groupe.reason);
    html += '</div>';
    html += '<div class="bloc"><div class="bloc-t">Mes ventes <small>par drogue</small></div>';
    if (moi.status === 'fulfilled') {
      var m = moi.value.data, det = m.detail || [];
      html += '<div class="sv-paie">' + fmtN(m.total) + ' <small>unités</small></div>';
      html += det.length ? tableau(['Drogue', 'Quantité'], det.slice().sort(function (a, b) { return b.quantite - a.quantite; }).map(function (d) { return ['<b>' + esc(d.item) + '</b>', fmtN(d.quantite)]; }), ['', 'num']) : locked('Tu n\'as pas de vente confirmée sur cette période.');
    } else html += rendreErreur(moi.reason);
    html += '</div></div>';
    cible.innerHTML = html;
  }

  // ── Onglet : Armurerie ────────────────────────────────────────────────────
  async function rendreArmurerie(cible) {
    var res = await Promise.allSettled([api('/api/armurerie/ammo'), api('/api/armurerie/ammo/history')]);
    var ammo = res[0], hist = res[1];
    var html = '';

    html += '<div class="bloc"><div class="bloc-t">Armes <small>' + (F.armeQ ? 'résultats de recherche, perdues comprises' : (F.armeStatut ? '' : 'toutes sauf perdues')) + '</small></div>';
    html += '<div class="tx-outils sv-outils">' + outilsInline('sv-arme-q', 'Nom ou référence…', F.armeQ, 'suiviFiltre(\'armeQ\', this.value)')
      + '<div class="tx-filtres" role="group" aria-label="Filtrer par statut">' + [['', 'Actives'], ['in_stock', 'En stock'], ['loaned', 'Prêtées'], ['lost', 'Perdues']].map(function (f) { return '<button type="button" class="tx-filtre' + (F.armeStatut === f[0] ? ' active' : '') + '" onclick="suiviFiltre(\'armeStatut\', \'' + f[0] + '\')">' + f[1] + '</button>'; }).join('') + '</div>'
      + '<span class="tx-compte" id="sv-armes-compte"></span></div><div id="sv-armes">' + locked('Chargement…') + '</div></div>';

    html += '<div class="grid2 sv-grid"><div class="bloc"><div class="bloc-t">Munitions <small>stock réel et compteurs de la semaine</small></div>';
    if (ammo.status === 'fulfilled') {
      var a = ammo.value.data;
      var typeLbl = a.fabricationType === 'pistolet' ? 'pistolet' : (a.fabricationType === 'smg' ? 'SMG' : null);
      html += '<div class="kpis sv-kpis">'
        + kpi('Munitions pistolet', fmtN(a.stock), null, 'en stock, toutes boîtes converties')
        + kpi('Munitions SMG', fmtN(a.stockSmg), null, 'en stock')
        + kpi('Fabriquées · semaine', fmtN(a.fabriqueesCetteSemaine), null, typeLbl ? 'calibre ' + typeLbl + ' · plafond ' + fmtN(a.fabricationQuotaHebdo) : 'aucune fabrication pour ce type de groupe')
        + kpi('Vendues · semaine', fmtN(a.vendusCetteSemaine), null, 'déclarations depuis le dernier reset')
        + '</div>';
    } else html += rendreErreur(ammo.reason);
    html += '</div>';
    html += '<div class="bloc"><div class="bloc-t">Ventes de munitions <small>depuis le dernier reset (dimanche 19h)</small></div>';
    if (hist.status === 'fulfilled') {
      var h = hist.value.data || [];
      html += h.length ? tableau(['Quand', 'Acheteur', 'Quantité', 'Prix'], h.map(function (v) { return ['<span title="' + esc(fmtDateHeure(v.timestamp)) + '">' + esc(fmtRel(v.timestamp)) + '</span>', esc(nomDe(v.acheteur_id)), fmtN(v.quantite), esc(fmt$(v.prix))]; }), ['', '', 'num', 'num']) : locked('Aucune vente de munitions déclarée cette semaine.');
    } else html += rendreErreur(hist.reason);
    html += '</div></div>';

    cible.innerHTML = html;
    chargerArmes();
  }

  async function chargerArmes() {
    var el = $('sv-armes'), cpt = $('sv-armes-compte');
    if (!el) return;
    try {
      var r, q = String(F.armeQ || '').trim();
      if (q.length >= 2) r = await api('/api/armurerie/search', { q: q });
      else r = await api('/api/armurerie', F.armeStatut ? { status: F.armeStatut } : {});
      var rows = r.data || [];
      if (q.length >= 2 && F.armeStatut) { var st = { in_stock: 'en_stock', loaned: 'pretee', lost: 'perdue' }[F.armeStatut]; rows = rows.filter(function (a) { return a.statut === st; }); }
      if (cpt) cpt.textContent = rows.length + ' arme(s)';
      el.innerHTML = rows.length ? tableau(['Arme', 'Référence', 'Type', 'Statut', 'Prêtée à'], rows.map(function (a) {
        var s = ARME_STATUT[a.statut] || [a.statut, ''];
        return ['<b>' + esc(a.nom) + '</b>', '<span class="ref">' + esc(a.reference) + '</span>', esc(a.type || '—'), pill(s[0], s[1]), esc(a.preteeA || '—')];
      })) : locked(q.length >= 2 ? 'Aucune arme ne correspond à « ' + esc(q) + ' ».' : 'Aucune arme dans cette catégorie.');
      majMaj();
    } catch (e) { el.innerHTML = rendreErreur(e); }
  }

  // ── Onglet : Taxes (rôle taxes ou admin) ──────────────────────────────────
  async function rendreTaxes(cible) {
    if (!(S.me && S.me.isTaxes)) { cible.innerHTML = locked('Les taxes sont réservées au <b>rôle taxes</b> ou aux administrateurs du serveur Discord.'); return; }
    var typesOpts = [['', 'Tous les types']].concat(Object.keys(TAXE_TYPES).map(function (k) { return [k, TAXE_TYPES[k]]; })).concat([['zone', 'Toutes les zones']]);
    var html = '<div class="bloc"><div class="bloc-t">Taxes & racket <small>infos générales ; téléphone et mot de passe à la demande</small></div>';
    html += '<div class="tx-outils sv-outils">' + outilsInline('sv-taxe-q', 'Chercher un groupe…', F.taxeQ, 'suiviFiltre(\'taxeQ\', this.value, true)')
      + '<label class="sv-sel"><span>Type</span><select onchange="suiviFiltre(\'taxeType\', this.value)">' + typesOpts.map(function (t) { return '<option value="' + t[0] + '"' + (F.taxeType === t[0] ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') + '</select></label>'
      + '<div class="tx-filtres" role="group" aria-label="Filtrer par état"><button type="button" class="tx-filtre' + (F.taxeStatut === 'active' ? ' active' : '') + '" onclick="suiviFiltre(\'taxeStatut\', \'active\')">En cours</button><button type="button" class="tx-filtre' + (F.taxeStatut === 'expired' ? ' active' : '') + '" onclick="suiviFiltre(\'taxeStatut\', \'expired\')">Expirées</button></div>'
      + '<span class="tx-compte" id="sv-taxes-compte"></span></div><div id="sv-taxes">' + locked('Chargement…') + '</div></div>';
    cible.innerHTML = html;
    chargerTaxes();
  }

  function libelleTypeTaxe(t) { return TAXE_TYPES[t] || ('Zone · ' + titre(t)); }

  async function chargerTaxes() {
    var el = $('sv-taxes'), cpt = $('sv-taxes-compte');
    if (!el) return;
    try {
      var q = { status: F.taxeStatut };
      if (F.taxeType) q.type = F.taxeType;
      var r = await api('/api/taxes', q);
      var needle = String(F.taxeQ || '').trim().toLowerCase();
      var rows = (r.data || []).filter(function (t) { return !needle || String(t.nom).toLowerCase().indexOf(needle) >= 0; });
      if (cpt) cpt.textContent = rows.length + ' taxe(s)';
      el.innerHTML = rows.length ? '<div class="table-wrap"><table class="vd-table taxes-table"><thead><tr><th>Groupe</th><th>Type</th><th>Échéance</th><th>Payée</th><th></th></tr></thead><tbody>'
        + rows.map(function (t) {
          var j = joursRestants(t.echeance);
          var cls = j < 0 ? 'tx-retard' : (j <= 2 ? 'tx-urgent' : '');
          return '<tr class="' + cls + '"><td><b>' + esc(t.nom) + '</b></td><td>' + esc(libelleTypeTaxe(t.type)) + '</td><td>' + esc(fmtDate(t.echeance)) + ' <span class="ref">' + (j < 0 ? 'expirée depuis ' + (-j) + ' j' : (j === 0 ? 'aujourd\'hui' : 'J−' + j)) + '</span></td><td>' + pill(t.paye ? 'payée' : 'à encaisser', t.paye ? 'ok' : 'warn') + '</td><td><button type="button" class="btn ghost sv-mini" onclick="suiviTaxeDetail(' + Number(t.id) + ', this)">Détail</button></td></tr><tr class="sv-detail-row" id="sv-taxe-' + Number(t.id) + '" hidden><td colspan="5"></td></tr>';
        }).join('') + '</tbody></table></div>' : locked('Aucune taxe pour ces filtres.');
      majMaj();
    } catch (e) { el.innerHTML = rendreErreur(e); }
  }

  window.suiviTaxeDetail = async function (id, btn) {
    var row = $('sv-taxe-' + id);
    if (!row) return;
    if (!row.hidden) { row.hidden = true; if (btn) btn.textContent = 'Détail'; return; }
    row.hidden = false; row.firstElementChild.innerHTML = '<span class="hint">Chargement…</span>';
    if (btn) btn.textContent = 'Masquer';
    try {
      var r = await api('/api/taxes/' + id);
      var t = r.data;
      row.firstElementChild.innerHTML = '<div class="sv-taxe-detail"><span><b>Téléphone</b> ' + esc(t.telephone || '—') + '</span><span><b>Mot de passe</b> <code>' + esc(t.motDePasse || '—') + '</code></span><span><b>Alerte envoyée</b> ' + (t.alerteSent ? 'oui' : 'non') + '</span><span class="hint">Modifications et renouvellement : sur Discord, panneau Taxes.</span></div>';
    } catch (e) { row.firstElementChild.innerHTML = rendreErreur(e); }
  };

  // ── Blocs génériques ──────────────────────────────────────────────────────
  function tableau(entetes, lignes, classes) {
    classes = classes || [];
    // Trois colonnes ou moins : le tableau tient dans la largeur d'un téléphone,
    // inutile de lui imposer la largeur minimale (et le défilement) des grands tableaux.
    var compact = entetes.length <= 3 ? ' sv-compact' : '';
    return '<div class="table-wrap"><table class="vd-table' + compact + '"><thead><tr>' + entetes.map(function (h, i) { return '<th class="' + (classes[i] || '') + '">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + lignes.map(function (l) { return '<tr>' + l.map(function (c, i) { return '<td class="' + (classes[i] || '') + '">' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function outils(id, placeholder, val, oninput) { return '<div class="tx-outils sv-outils">' + outilsInline(id, placeholder, val, oninput) + '</div>'; }
  function outilsInline(id, placeholder, val, oninput) {
    return '<label class="tx-recherche" for="' + id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input type="search" id="' + id + '" placeholder="' + esc(placeholder) + '" value="' + esc(val || '') + '" autocomplete="off" spellcheck="false" oninput="' + oninput + '" /></label>';
  }
  function majMaj() { var m = $('suivi-maj'); if (m && S.derniereOk) m.textContent = 'Dernière récupération réussie : ' + fmtHeure(S.derniereOk); }

  // ── Orchestration ─────────────────────────────────────────────────────────
  var debounce = {};
  window.suiviFiltre = function (cle, valeur, local) {
    F[cle] = valeur;
    if (cle === 'stockQ') { var t = $('sv-stock-table'); if (t && S.cache['/api/stocks?']) t.innerHTML = tableStocks(S.cache['/api/stocks?'].data || [], valeur); return; }
    if (cle === 'coffre') { rendreCourant(); return; }
    if (cle === 'histItem' || cle === 'histCoffre' || cle === 'histLimit') { var lc = S.cache['/api/stocks/channels?']; chargerHistorique(lc ? lc.data || [] : []); return; }
    if (cle === 'armeQ') { clearTimeout(debounce.arme); debounce.arme = setTimeout(chargerArmes, 300); return; }
    if (cle === 'armeStatut') { chargerArmes(); return; }
    if (cle === 'taxeQ') { clearTimeout(debounce.taxe); debounce.taxe = setTimeout(chargerTaxes, 200); return; }
    if (cle === 'taxeType' || cle === 'taxeStatut') { chargerTaxes(); return; }
  };

  window.suiviOnglet = function (id) {
    if (!ONGLETS.some(function (o) { return o.id === id; })) return;
    S.onglet = id;
    try { localStorage.setItem('moni-suivi-onglet', id); } catch (e) {}
    rendreOnglets(); rendreBarre(); rendreCourant();
  };

  window.suiviSemaine = function (w) {
    S.week = w || '';
    // Les données dépendant de la période sont oubliées ; le reste (stocks, armes…) reste en cache.
    Object.keys(S.cache).forEach(function (k) { if (/\/api\/(quotas|ventes)/.test(k)) delete S.cache[k]; });
    S.config = undefined;
    rendreCourant();
  };

  window.suiviActualiser = async function () {
    S.cache = {}; S.config = undefined; S.nomsCharges = false;
    await chargerStatut(true);
    rendreCourant();
  };

  window.suiviDelier = async function () {
    if (!confirm('Effacer la connexion au bot conservée côté serveur ? Tu pourras la refaire à tout moment.')) return;
    try { await appel({ action: 'unlink' }); S.cache = {}; S.me = null; if (typeof toast === 'function') toast('Connexion au bot effacée.'); }
    catch (e) { if (typeof toast === 'function') toast(e.message || 'Impossible', 'err'); }
    await chargerStatut(true);
    rendreCourant();
  };

  async function chargerStatut(force) {
    if (S.statut && !force) return S.statut;
    S.chargement++; rendreBarre();
    try {
      var d = await appel({ action: 'status' });
      S.statut = d;
      S.me = d.linked && d.me ? d.me : null;
      if (d.linked && !d.code) S.derniereOk = new Date();
    } catch (e) {
      S.statut = { configured: true, linked: false, code: e.code, message: e.message, erreur: e };
      S.me = null;
    } finally { S.chargement--; }
    rendreOnglets(); rendreBarre();
    return S.statut;
  }

  async function rendreCourant() {
    var cible = $('suivi-contenu');
    if (!cible) return;
    var st = S.statut;
    if (!st) { cible.innerHTML = locked('Vérification de la connexion au bot…'); return; }
    if (st.erreur) { cible.innerHTML = rendreErreur(st.erreur); return; }
    if (!st.configured) { cible.innerHTML = rendreErreur({ code: 'not_configured' }); return; }
    if (!st.linked) { cible.innerHTML = rendreErreur({ code: st.code === 'reconnect' ? 'reconnect' : 'not_linked', message: st.message }); return; }
    if (st.code === 'forbidden') { cible.innerHTML = rendreErreur({ code: 'forbidden', message: st.message }); return; }
    if (st.code === 'unavailable') { cible.innerHTML = rendreErreur({ code: 'unavailable', message: st.message }); return; }
    if (!S.me) { cible.innerHTML = rendreErreur({ code: 'unavailable', message: 'Identité non résolue.' }); return; }

    var jeton = ++rendreCourant.seq;
    S.chargement++; rendreBarre();
    cible.setAttribute('aria-busy', 'true');
    if (!cible.innerHTML || /class="locked"/.test(cible.innerHTML)) cible.innerHTML = locked('Chargement des données du bot…');
    try {
      await chargerNoms();
      var tmp = document.createElement('div');
      var fn = { vue: rendreVue, stocks: rendreStocks, quotas: rendreQuotas, ventes: rendreVentes, armurerie: rendreArmurerie, taxes: rendreTaxes }[S.onglet] || rendreVue;
      await fn(tmp);
      if (jeton !== rendreCourant.seq) return; // un autre rendu a pris le relais
      cible.innerHTML = tmp.innerHTML;
      // Les chargements différés (historique, armes…) ciblent des ids : on relance ceux du nouvel onglet.
      if (S.onglet === 'stocks') { var lc = S.cache['/api/stocks/channels?']; var l = lc ? lc.data || [] : []; if (F.coffre) chargerCoffre(l); chargerHistorique(l); }
      if (S.onglet === 'armurerie') chargerArmes();
      if (S.onglet === 'taxes') chargerTaxes();
    } catch (e) {
      if (jeton === rendreCourant.seq) cible.innerHTML = rendreErreur(e);
    } finally {
      S.chargement--; cible.removeAttribute('aria-busy'); rendreBarre();
    }
  }
  rendreCourant.seq = 0;

  /** Point d'entrée appelé par espace-membre.html (clic sur l'onglet, retour au panneau, tirer-pour-actualiser). */
  window.loadSuivi = async function (opts) {
    var panel = $('panel-suivi');
    if (!panel || typeof currentUser === 'undefined' || !currentUser) return;
    if (!S.initialise) {
      S.initialise = true;
      try { var o = localStorage.getItem('moni-suivi-onglet'); if (o && ONGLETS.some(function (x) { return x.id === o; })) S.onglet = o; } catch (e) {}
      rendreOnglets(); rendreBarre();
    }
    if (opts && opts.force) { S.cache = {}; S.config = undefined; }
    await chargerStatut(!!(opts && opts.force));
    if (S.onglet === 'taxes' && !(S.me && S.me.isTaxes)) S.onglet = 'vue';
    rendreOnglets();
    rendreCourant();
  };
})();
