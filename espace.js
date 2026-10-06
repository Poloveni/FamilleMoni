/* Espace membre — coque et utilitaires partagés.
   Repris du espace.js du modèle Roxwood Network, adapté à ce site : pas de serveur (GitHub Pages + Supabase),
   l'espace membre tient en UNE page dont les rubriques sont des panneaux (#moi, #famille…). La coque (rail
   numéroté, barre et onglets du téléphone, palette Ctrl+K, modales, toast) est identique ; seule la navigation
   ouvre un panneau au lieu de changer de page. Le panel admin (admin.html) réutilise la même coque avec sa
   propre liste de rubriques (espaceShell(nav)). */
// nom du site, lu dans la page : <meta name="application-name">
const SITE_NAME = document.querySelector('meta[name="application-name"]')?.content || '';
const SITE_NAME_HTML = SITE_NAME.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const espaceEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Boîte de confirmation dans le style du site (remplace window.confirm)
window.espaceConfirm = function (message, { title = 'Confirmer', ok = 'Confirmer', cancel = 'Annuler', danger = false } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <p class="eyebrow">${SITE_NAME_HTML}</p>
        <h3 class="modal__title" id="modalTitle"></h3>
        <p class="modal__text"></p>
        <div class="modal__actions">
          <button class="btn btn--ghost" type="button" data-cancel></button>
          <button class="btn ${danger ? 'btn--ghost btn--danger' : 'btn--accent'}" type="button" data-ok></button>
        </div>
      </div>`;
    wrap.querySelector('.modal__title').textContent = title;
    wrap.querySelector('.modal__text').textContent = message;
    wrap.querySelector('[data-cancel]').textContent = cancel;
    wrap.querySelector('[data-ok]').textContent = ok;
    const close = v => { wrap.classList.remove('is-open'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
    wrap.querySelector('[data-cancel]').onclick = () => close(false);
    wrap.querySelector('[data-ok]').onclick = () => close(true);
    wrap.onclick = e => { if (e.target === wrap) close(false); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => { wrap.classList.add('is-open'); wrap.querySelector('[data-ok]').focus(); });
  });
};

// Transition entre pages (espace.css) : par défaut « vers-espace » (volet, arrivée depuis la vitrine) ;
// venant d'une autre page de la partie gestion (espace membre ↔ admin), « interne » : le rail reste en place.
// C'est la page quittée, qui connaît sa destination, qui laisse la consigne.
const ESPACE_PAGES = /(espace-membre|admin|suivi-connexion)\.html$/;
addEventListener('pageswap', e => {
  try {
    const vers = e.viewTransition && new URL(e.activation.entry.url);
    if (vers && vers.origin === location.origin && ESPACE_PAGES.test(vers.pathname)) sessionStorage.setItem('vt-interne', '1');
  } catch {}
});
addEventListener('pagereveal', e => {
  let interne = false;
  try { interne = sessionStorage.getItem('vt-interne') === '1'; sessionStorage.removeItem('vt-interne'); } catch {}
  if (interne && e.viewTransition) { e.viewTransition.types.clear(); e.viewTransition.types.add('interne'); }
});

// ================= Coque : rail de navigation, onglets mobiles, palette de recherche =================
// La navigation est décrite une seule fois ici. La page appelle espaceShell() à l'endroit où la coque doit
// apparaître (script en ligne, avant ses propres scripts : #logout, #rail-avatar, #gestion existent donc quand
// ils s'exécutent). Le numéro de chaque rubrique (01, 02…) sert de « numéro de pose », repris dans l'en-tête.
//   panel : le panneau ouvert (#panel-<panel>) — req : réservé aux comptes validés — court : libellé de l'onglet
//   du téléphone (les rubriques de tous les jours ; le reste est dans « Plus ») — id / hidden : rubriques
//   affichées selon les droits (em-core.js).
const ESPACE_NAV = [
  { groupe: 'Moi', liens: [
    { panel: 'moi', label: 'Ma semaine', court: 'Semaine', req: true, sub: 'Tes ventes, ta paie, ton rang — calculés par le bot.' },
    { panel: 'bilan', label: 'Mon bilan', req: true, sub: 'Ta carte du mois, à télécharger et poster sur Discord.' },
    { panel: 'profil', label: 'Mon profil', req: true, sub: 'Ton personnage, ta photo, ta fiche sur le site public.' },
  ] },
  { groupe: 'La famille', liens: [
    { panel: 'famille', label: 'La famille', court: 'Famille', req: true, sub: 'Ventes, classement, paie et bilan du groupe — en direct du bot.' },
    { panel: 'stocks', label: 'Stocks', court: 'Stocks', req: true, sub: 'Ce que la famille possède : stock général, coffres, mouvements.' },
    { panel: 'armurerie', label: 'Armurerie', req: true, sub: 'Les armes de la famille, qui les tient, et les munitions.' },
    { panel: 'braquages', label: 'Braquages', req: true, sub: 'Les créneaux de braquage du groupe et les cooldowns en cours.' },
    { panel: 'garage', label: 'Garage', req: true, sub: 'Les véhicules sortis, et la fourrière.' },
    { panel: 'taxes', label: 'Taxes', req: true, sub: 'Les taxes et le racket des groupes, avec leurs échéances.' },
  ] },
  { groupe: 'Vie de famille', liens: [
    { panel: 'events', label: 'Planning', court: 'Planning', req: true, sub: 'Les rendez-vous de la famille — dis si tu viens.' },
    { panel: 'galerie', label: 'Galerie', sub: 'Tes screens partent dans la galerie du site public.' },
    { panel: 'hierarchie', label: 'Hiérarchie', req: true, id: 'nav-hierarchie', hidden: true, sub: 'Les membres et leurs rangs, tels qu’ils apparaissent sur le site public.' },
  ] },
  { groupe: 'Gestion', id: 'gestion', hidden: true, liens: [
    { href: 'admin.html', label: 'Administration', id: 'nav-admin' },
  ] },
];
// avatar d'une personne : sa photo si elle est connue, sinon rien
window.espaceAvatar = (src, taille = 32) => src ? `<img class="avatar" src="${espaceEsc(src)}" alt="" width="${taille}" height="${taille}" loading="lazy">` : '';
window.espaceShell = function (nav = ESPACE_NAV, { logo = 'logo-m-rond.webp', site = 'accueil.html', sortie = true } = {}) {
  let n = 0;
  const lien = (l, g) => {
    const num = String(++n).padStart(2, '0');
    const attrs = l.panel
      ? ` href="#${l.panel}" data-panel="${l.panel}" data-num="${num}" data-groupe="${espaceEsc(g.groupe)}" data-title="${espaceEsc(l.label)}" data-sub="${espaceEsc(l.sub || '')}"${l.req ? ' data-req="1"' : ''}`
      : ` href="${l.href}"${l.blank ? ' target="_blank" rel="noopener"' : ''}`;
    return `<a class="rail__lien"${attrs}${l.id ? ` id="${l.id}"` : ''}${l.hidden ? ' hidden' : ''}><b>${num}</b><span>${espaceEsc(l.label)}</span>${l.badge ? `<i class="nav__badge" id="${l.badge}" hidden></i>` : ''}</a>`;
  };
  const groupes = nav.map(g => `<div class="rail__groupe"${g.id ? ` id="${g.id}"` : ''}${g.hidden ? ' hidden' : ''}><p>${espaceEsc(g.groupe)}</p>${g.liens.map(l => lien(l, g)).join('')}</div>`).join('');
  // onglets du bas (téléphone) : les rubriques de tous les jours, le reste dans « Plus »
  const onglets = nav.flatMap(g => g.liens).filter(l => l.court).map(l =>
    `<a href="#${l.panel}" data-panel="${l.panel}"${l.req ? ' data-req="1"' : ''}><span>${espaceEsc(l.court)}</span></a>`).join('');
  document.currentScript.insertAdjacentHTML('beforebegin', `
    <header class="barre" aria-label="${SITE_NAME_HTML}">
      <a class="barre__marque" href="${site}"><img src="${logo}" alt="" width="28" height="28"><span>${SITE_NAME_HTML}</span></a>
      <button class="barre__cherche" type="button" data-palette aria-label="Rechercher">⌕</button>
    </header>
    <aside class="rail" id="rail" aria-label="Espace membre">
      <a class="rail__marque" href="${site}"><img src="${logo}" alt="" width="32" height="32"><span>${SITE_NAME_HTML}</span></a>
      <button class="rail__cherche" type="button" data-palette><span>Rechercher</span><kbd>Ctrl K</kbd></button>
      <nav class="rail__nav">${groupes}</nav>
      <div class="rail__moi">
        <img id="rail-avatar" src="icon-192.png" alt="" width="36" height="36">
        <div><b id="who-email">—</b><small id="rail-grade"></small></div>
      </div>
      <div class="rail__bas"><a href="${site}">Le site</a>${sortie ? '<button type="button" id="tv-btn">Mode TV</button>' : ''}<button class="espace-logout" id="logout" type="button">Déconnexion</button></div>
    </aside>
    <nav class="onglets" aria-label="Navigation rapide">${onglets}<button type="button" id="ongletPlus" aria-expanded="false" aria-controls="rail"><span>Plus</span></button></nav>`);
  // « Plus » (téléphone) : le rail s'ouvre en panneau
  const rail = document.getElementById('rail'), plus = document.getElementById('ongletPlus');
  const ouvre = v => { rail.classList.toggle('is-open', v); document.body.classList.toggle('nav-lock', v); plus.setAttribute('aria-expanded', v); };
  window.espaceRailFerme = () => ouvre(false);
  plus.addEventListener('click', () => ouvre(!rail.classList.contains('is-open')));
  // fermé par un lien, ou par un toucher hors du panneau (le voile assombri est dessiné sur le body)
  document.addEventListener('click', e => {
    if (!rail.classList.contains('is-open')) return;
    if (e.target.closest('.rail__lien, .rail__bas a, .rail__bas button') || (!rail.contains(e.target) && !plus.contains(e.target))) ouvre(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') ouvre(false); });
  document.querySelectorAll('[data-palette]').forEach(b => b.addEventListener('click', () => espacePalette()));
};

// Rubrique active : rail, onglets et en-tête de la page (numéro de pose, titre, sous-titre)
window.espaceActive = function (panel) {
  let actif = null;
  document.querySelectorAll('.rail__lien[data-panel], .onglets [data-panel]').forEach(a => {
    const on = a.dataset.panel === panel;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    if (on && a.classList.contains('rail__lien')) actif = a;
  });
  const num = document.querySelector('.espace-page > .section__head .numeral');
  if (num && actif) num.textContent = `${actif.dataset.num} — ${actif.dataset.groupe}`;
  return actif;
};

// Carte du membre connecté, en bas du rail
window.espaceNav = function ({ nom, grade, avatar } = {}) {
  const av = document.getElementById('rail-avatar'); if (av && avatar) av.src = avatar;
  const n = document.getElementById('who-email'); if (n && nom != null) n.textContent = nom || '—';
  const g = document.getElementById('rail-grade'); if (g && grade != null) g.textContent = grade;
};

// ---- Palette de recherche (Ctrl+K, ⌘K ou /) : rubriques, membres, actions ; navigation au clavier
window.espacePalette = function () {
  if (document.querySelector('.palette')) return;
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visible = el => !el.closest('[hidden]');
  const pages = [...document.querySelectorAll('.rail__lien')].filter(visible)
    .map(a => ({ type: 'Rubriques', label: a.querySelector('span').textContent, hint: a.closest('.rail__groupe').querySelector('p').textContent, num: a.querySelector('b').textContent, panel: a.dataset.panel, href: a.getAttribute('href') }));
  const actions = [
    { type: 'Actions', label: 'Retour au site', hint: 'La page d’accueil', href: document.querySelector('.rail__bas a')?.getAttribute('href') || 'accueil.html' },
    ...(typeof actualiserTout === 'function' ? [{ type: 'Actions', label: 'Actualiser', hint: 'Recharger les données du bot', run: () => actualiserTout() }] : []),
    ...(document.getElementById('tv-btn') ? [{ type: 'Actions', label: 'Mode TV', hint: 'Plein écran, panneaux qui défilent', run: () => document.getElementById('tv-btn').click() }] : []),
    { type: 'Actions', label: 'Se déconnecter', hint: 'Fermer la session', run: () => document.getElementById('logout')?.click() },
  ];
  // membres : la hiérarchie du site (nom RP, rang), vers la fiche publique
  const slug = n => norm(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const membres = (window.MONI_MEMBRES || []).map(m => ({ type: 'Membres', label: m.nom, hint: m.rang || 'Sans rang', num: '→', href: `membre/${slug(m.nom)}.html` }));
  let choix = 0, liste = [];
  const wrap = document.createElement('div');
  wrap.className = 'palette';
  wrap.innerHTML = `<div class="palette__box" role="dialog" aria-modal="true" aria-label="Recherche">
      <label class="palette__champ"><span aria-hidden="true">⌕</span><input type="search" placeholder="Aller à une rubrique, chercher un membre…" autocomplete="off" aria-controls="paletteListe"></label>
      <ul class="palette__liste" id="paletteListe" role="listbox"></ul>
      <p class="palette__aide"><kbd>↑</kbd><kbd>↓</kbd> choisir <kbd>Entrée</kbd> ouvrir <kbd>Échap</kbd> fermer</p>
    </div>`;
  const input = wrap.querySelector('input'), ul = wrap.querySelector('ul');
  function rendu() {
    const q = norm(input.value.trim());
    const tout = [...pages, ...membres, ...actions];
    liste = !q ? [...pages, ...actions] : tout.filter(x => norm(`${x.label} ${x.hint || ''}`).includes(q))
      .sort((a, b) => norm(b.label).startsWith(q) - norm(a.label).startsWith(q)).slice(0, 12);
    choix = Math.min(choix, Math.max(0, liste.length - 1));
    let type = '';
    ul.innerHTML = liste.map((x, i) => `${x.type !== type ? `<li class="palette__type" role="presentation">${type = x.type}</li>` : ''}
      <li role="option" data-i="${i}" ${i === choix ? 'aria-selected="true"' : ''}><b>${x.num || '→'}</b><span>${espaceEsc(x.label)}</span><small>${espaceEsc(x.hint || '')}</small></li>`).join('')
      || '<li class="palette__vide">Aucun résultat</li>';
    ul.querySelector('[aria-selected]')?.scrollIntoView({ block: 'nearest' });
  }
  const ferme = () => { wrap.remove(); document.removeEventListener('keydown', touche, true); };
  const va = x => {
    if (!x) return; ferme();
    if (x.run) x.run();
    else if (x.panel && typeof ouvrirPanneau === 'function') ouvrirPanneau(x.panel);
    else location.href = x.href;
  };
  function touche(e) {
    if (e.key === 'Escape') { e.preventDefault(); ferme(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); choix = (choix + (e.key === 'ArrowDown' ? 1 : -1) + liste.length) % Math.max(1, liste.length); rendu(); }
    else if (e.key === 'Enter') { e.preventDefault(); va(liste[choix]); }
  }
  input.addEventListener('input', () => { choix = 0; rendu(); });
  ul.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) va(liste[li.dataset.i]); });
  ul.addEventListener('mousemove', e => { const li = e.target.closest('[data-i]'); if (li && +li.dataset.i !== choix) { choix = +li.dataset.i; rendu(); } });
  wrap.addEventListener('click', e => { if (e.target === wrap) ferme(); });
  document.addEventListener('keydown', touche, true);
  document.body.appendChild(wrap);
  rendu(); input.focus();
};
document.addEventListener('keydown', e => {
  const saisie = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !saisie)) {
    if (!document.getElementById('rail') || !document.body.classList.contains('is-in')) return;
    e.preventDefault(); espacePalette();
  }
});

// Formulaire dans une modale (même style que espaceConfirm). Résout avec les
// valeurs saisies, ou null si annulé. fields : [{ name, label, type, options, value, placeholder, required, hint }]
// half : true = demi-largeur (deux champs côte à côte) ; rows : hauteur d'une zone de texte
// type : text (défaut) | textarea | checkbox (value booléen, text = libellé de la case)
//        | radio (options [{ value, label, hint }]) | color
// del : libellé d'un bouton de suppression ; s'il est cliqué, résout avec { _delete: true }
window.espaceForm = function (fields, { title = 'Saisie', text = '', ok = 'Valider', cancel = 'Annuler', danger = false, del = '' } = {}) {
  return new Promise(resolve => {
    const esc = espaceEsc;
    const wrap = document.createElement('div');
    wrap.className = 'modal modal--form';
    wrap.innerHTML = `
      <form class="modal__box" role="dialog" aria-modal="true" novalidate>
        <p class="eyebrow">${SITE_NAME_HTML}</p>
        <h3 class="modal__title"></h3>
        <p class="modal__text" ${text ? '' : 'hidden'}></p>
        <div class="modal__fields"></div>
        <p class="modal__error" hidden></p>
        <div class="modal__actions">
          ${del ? '<button class="btn btn--ghost btn--danger modal__del" type="button" data-del></button>' : ''}
          <button class="btn btn--ghost" type="button" data-cancel></button>
          <button class="btn ${danger ? 'btn--ghost btn--danger' : 'btn--accent'}" type="submit" data-ok></button>
        </div>
      </form>`;
    wrap.querySelector('.modal__title').textContent = title;
    wrap.querySelector('.modal__text').textContent = text;
    wrap.querySelector('[data-cancel]').textContent = cancel;
    wrap.querySelector('[data-ok]').textContent = ok;
    if (del) wrap.querySelector('[data-del]').textContent = del;
    const box = wrap.querySelector('.modal__fields');
    box.innerHTML = fields.map(f => {
      let ctrl;
      if (f.type === 'textarea') ctrl = `<textarea class="admin-input" name="${esc(f.name)}" rows="${f.rows || 3}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
      else if (f.type === 'checkbox') ctrl = `<label class="check"><input type="checkbox" name="${esc(f.name)}" ${f.value ? 'checked' : ''}><span>${esc(f.text)}</span></label>`;
      else if (f.type === 'radio') ctrl = `<div class="choices">${f.options.map(o => `<label class="choice"><input type="radio" name="${esc(f.name)}" value="${esc(o.value)}" ${o.value === f.value ? 'checked' : ''}><span><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span></label>`).join('')}</div>`;
      else if (f.type === 'color') ctrl = `<input class="modal__color" type="color" name="${esc(f.name)}" value="${esc(f.value || '#e0503f')}">`;
      else ctrl = `<input class="admin-input" type="text" name="${esc(f.name)}" value="${esc(f.value ?? '')}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
      const id = `cf-${esc(f.name)}`;
      ctrl = ctrl.replace(/^<(input|textarea) /, `<$1 id="${id}" `);
      const title = !f.label ? '' : ['checkbox', 'radio', 'color'].includes(f.type)
        ? `<span class="modal__label">${esc(f.label)}${f.required ? ' *' : ''}</span>`
        : `<label class="modal__label" for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>`;
      return `<div class="modal__field${f.half ? ' modal__field--half' : ''}">${title}${ctrl}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
    }).join('');
    const err = wrap.querySelector('.modal__error');
    const close = v => { wrap.classList.remove('is-open'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    wrap.querySelector('[data-cancel]').onclick = () => close(null);
    if (del) wrap.querySelector('[data-del]').onclick = () => close({ _delete: true });
    wrap.onclick = e => { if (e.target === wrap) close(null); };
    wrap.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const out = {};
      for (const f of fields) {
        if (f.type === 'checkbox') out[f.name] = box.querySelector(`[name="${f.name}"]`).checked;
        else if (f.type === 'radio') out[f.name] = box.querySelector(`[name="${f.name}"]:checked`)?.value ?? '';
        else out[f.name] = box.querySelector(`[name="${f.name}"]`).value.trim();
        if (f.required && !out[f.name]) { err.textContent = `« ${f.label} » est obligatoire.`; err.hidden = false; return; }
      }
      close(out);
    };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => { wrap.classList.add('is-open'); const first = box.querySelector('input,select,textarea'); if (first) first.focus(); });
  });
};

// Fenêtre de consultation (lecture seule), même style que espaceConfirm. rows : [{ label, value }] ;
// chaque valeur renseignée a un bouton pour la copier.
window.espaceInfo = function (title, rows) {
  const esc = espaceEsc;
  const wrap = document.createElement('div');
  wrap.className = 'modal modal--form';
  wrap.innerHTML = `
    <div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="infoTitle">
      <p class="eyebrow">${SITE_NAME_HTML}</p>
      <h3 class="modal__title" id="infoTitle">${esc(title)}</h3>
      <dl class="info">${rows.map((r, i) => `<div class="info__row"><dt>${esc(r.label)}</dt>
        <dd>${r.value ? `<span class="mono">${esc(r.value)}</span><button class="btn btn--ghost btn--sm" type="button" data-copy="${i}">Copier</button>` : '<span class="muted">—</span>'}</dd></div>`).join('')}</dl>
      <div class="modal__actions"><button class="btn btn--accent" type="button" data-close>Fermer</button></div>
    </div>`;
  const close = () => { wrap.classList.remove('is-open'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.onclick = async e => {
    if (e.target === wrap || e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-copy]'); if (!b) return;
    try { await navigator.clipboard.writeText(rows[b.dataset.copy].value); b.textContent = 'Copié ✓'; setTimeout(() => b.textContent = 'Copier', 1500); }
    catch { espaceToast('Copie impossible : sélectionne le texte à la main.', false); }
  };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => { wrap.classList.add('is-open'); wrap.querySelector('[data-close]').focus(); });
};

// Durée lisible d'un coup d'œil : « 2 j 4 h », « 3 h 20 », « 12 min » (arrondie à la minute supérieure, jamais négative)
window.espaceDuree = function (ms) {
  const min = Math.max(1, Math.ceil(ms / 6e4)), h = Math.floor(min / 60), j = Math.floor(h / 24);
  return j >= 1 ? `${j} j${h % 24 ? ` ${h % 24} h` : ''}` : h >= 1 ? `${h} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`;
};

// Petit message furtif en bas de page (succès ou erreur)
window.espaceToast = function (message, ok = true) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = message; t.classList.toggle('toast--error', !ok); t.classList.add('is-on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('is-on'), ok ? 3200 : 5200);
};
