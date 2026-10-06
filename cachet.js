/* DA « Le Cachet » : ce qui est propre à la vitrine de la Famille Moni (accueil.html).
   Monogramme 3D, parallaxe de l'emblème, retour en haut, musique d'ambiance, galerie et sa visionneuse, compteur de membres.
   Le menu, les apparitions au défilement (main.js) et l'organigramme (org.js) sont mutualisés. */
(function () {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- monogramme 3D du hero (logo3d.js ; sans WebGL, l'image reste affichée)
  if (window.monogramme3D) monogramme3D(document.getElementById('m3d'), { fallback: document.getElementById('m-img'), src: 'assets/logo-m-rond.webp', scale: 3.4, camZ: 7.2, swing: true });

  // ---- emblème : léger parallaxe + inclinaison à la souris
  if (!calme) {
    const ems = document.querySelectorAll('.emblem');
    addEventListener('pointermove', e => {
      if (scrollY > innerHeight) return;
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      ems.forEach(el => { el.style.setProperty('--tx', x.toFixed(3)); el.style.setProperty('--ty', y.toFixed(3)); });
    }, { passive: true });
  }

  // ---- retour en haut
  const haut = document.getElementById('back-to-top');
  let prevu = false;
  addEventListener('scroll', () => {
    if (prevu) return;
    prevu = true;
    requestAnimationFrame(() => { prevu = false; haut.classList.toggle('show', scrollY > 500); });
  }, { passive: true });
  haut.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  // ---- musique d'ambiance (coupée par défaut, préférence mémorisée)
  (function () {
    const audio = document.getElementById('bg-music'), btn = document.getElementById('music-toggle');
    if (!audio || !btn) return;
    audio.volume = 0.35;
    let muet = true;
    try { const pref = localStorage.getItem('moni-music-muted'); if (pref !== null) muet = pref === '1'; } catch (e) {}
    const rendu = () => { audio.muted = muet; btn.classList.toggle('muted', muet); btn.title = muet ? 'Activer la musique' : 'Couper la musique'; };
    const jouer = () => { const p = audio.play(); if (p) p.then(rendu).catch(() => {}); };
    rendu();
    // un navigateur ne lance le son qu'après un geste du visiteur
    const premierGeste = () => { if (!muet) jouer(); ['pointerdown', 'keydown'].forEach(ev => removeEventListener(ev, premierGeste)); };
    ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, premierGeste, { passive: true }));
    btn.addEventListener('click', e => {
      e.stopPropagation(); muet = !muet;
      try { localStorage.setItem('moni-music-muted', muet ? '1' : '0'); } catch (e2) {}
      if (!muet) jouer();
      rendu();
    });
  })();

  // ---- visionneuse
  const ouvrirVisionneuse = (function () {
    const lb = document.getElementById('lightbox'), img = document.getElementById('lb-img'), cap = document.getElementById('lb-caption');
    let items = [], idx = 0;
    const montrer = i => { idx = (i + items.length) % items.length; const it = items[idx]; img.src = it.src; img.alt = it.caption || ''; cap.textContent = it.caption || ''; };
    const fermer = () => { lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); };
    document.getElementById('lb-close').addEventListener('click', fermer);
    document.getElementById('lb-prev').addEventListener('click', () => montrer(idx - 1));
    document.getElementById('lb-next').addEventListener('click', () => montrer(idx + 1));
    lb.addEventListener('click', e => { if (e.target === lb) fermer(); });
    addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') fermer(); else if (e.key === 'ArrowLeft') montrer(idx - 1); else if (e.key === 'ArrowRight') montrer(idx + 1);
    });
    return (liste, i) => { items = liste; montrer(i || 0); lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false'); };
  })();

  // ---- galerie : le site n'accepte aucun envoi d'images, chaque cliché est un fichier du projet (assets/galerie/).
  // Pour en ajouter un : déposer le fichier dans le dossier, puis une ligne ici (large = deux colonnes).
  // membres-01 à 41 : les clichés que les membres avaient déposés sur l'ancien site, du plus récent au plus ancien.
  const LEGENDES = { 31: 'Oscar', 32: 'Kaelan', 33: 'Ezio', 34: 'La Donna', 35: 'James' };
  const GALERIE = [
    { src: 'famille-manoir.webp', caption: 'La famille au complet', large: true },
    { src: 'duo-nuit.webp', caption: 'Nuit à Roxwood' },
    { src: 'qg-nuit.webp', caption: 'Le QG — vue en jeu' },
    { src: 'famille-balcon.webp', caption: 'Le balcon' },
    { src: 'famille-escaliers.webp', caption: 'Les escaliers', large: true },
    { src: 'qg-carte.webp', caption: 'Le QG — position sur la carte' },
    ...Array.from({ length: 41 }, (_, i) => ({ src: `membres-${String(i + 1).padStart(2, '0')}.webp`, caption: LEGENDES[i + 1] || '' })),
  ].map(g => ({ ...g, src: 'assets/galerie/' + g.src }));
  const grille = document.getElementById('galerie-grid');
  grille.innerHTML = GALERIE.map((g, i) =>
    `<figure class="photo corners${g.large ? ' is-wide' : ''}" data-index="${i}" style="margin:0"><i class="c3"></i><i class="c4"></i>` +
    `<img src="${esc(g.src)}" alt="${esc(g.caption || 'Photo Famille Moni')}" loading="lazy" decoding="async">` +
    (g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : '') + '</figure>').join('');
  grille.addEventListener('click', e => { const f = e.target.closest('.photo[data-index]'); if (f) ouvrirVisionneuse(GALERIE, Number(f.dataset.index)); });

  // ---- La Famiglia : nombre de membres, compté sur les fiches que org.js vient de poser (postes à pourvoir exclus)
  const org = document.getElementById('org'), compte = document.getElementById('membres-count');
  if (org && compte) {
    const compter = () => { const n = org.querySelectorAll('.rank:not(.rank--open)').length; compte.textContent = n ? `${n} membre${n > 1 ? 's' : ''} · ` : ''; };
    new MutationObserver(compter).observe(org, { childList: true });
    compter();
  }
})();
