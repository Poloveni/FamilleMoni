/* ══════════════════════════════════════════════════════════════════════
   fond3d.js — le fond en profondeur de l'espace membre

   Une caméra regarde un espace en trois dimensions :
   · un sol en grille qui fuit vers l'horizon et défile lentement ;
   · des particules d'ivoire réparties en profondeur, qui dérivent vers
     la caméra (les plus proches sont plus grosses, plus floues, plus
     lumineuses) ;
   · deux halos très diffus qui respirent, comme dans l'ancien fond.

   Tout est projeté à la main sur un canvas 2D : pas de WebGL, pas de
   bibliothèque, et une charge légère sur téléphone. La caméra suit la
   souris avec un léger retard (parallaxe), et penche un peu au défilement.

   Utilisation :  fond3d('member-canvas', { particules: 260 });
   L'animation se fige sur « réduire les animations » et s'arrête quand
   l'onglet passe en arrière-plan.
   ══════════════════════════════════════════════════════════════════════ */
window.fond3d = function (id, opts) {
  const o = Object.assign({
    particules: 260,      // nombre de particules sur grand écran
    densite: 6500,        // px² par particule : plus grand = moins de particules
    vitesse: 1,           // 1 = tempo par défaut
    dpr: 1.5,             // plafond de résolution (les fonds n'ont pas besoin de Retina)
  }, opts || {});
  const c = document.getElementById(id);
  if (!c) return;
  const ctx = c.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tactile = window.matchMedia('(hover: none)').matches;

  // ── L'espace ─────────────────────────────────────────────────────────
  // Unités arbitraires : la caméra est à l'origine et regarde vers +z.
  const PROF = 60;            // profondeur visible
  const LARG = 34;            // demi-largeur du volume de particules
  const HAUT = 20;            // demi-hauteur
  const SOL = -9;             // altitude du sol
  const FOCALE = 0.9;         // ouverture : plus petit = grand angle
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, focale = 1;
  let parts = [];
  let t = 0;                  // temps, en secondes
  let cam = { x: 0, y: 0, rx: 0, ry: 0 };      // position et orientation lissées
  let cible = { x: 0, y: 0, rx: 0, ry: 0 };    // ce vers quoi la caméra tend
  let scrollT = 0;

  function creer(init) {
    const p = {
      x: (Math.random() * 2 - 1) * LARG,
      y: (Math.random() * 2 - 1) * HAUT,
      z: init ? Math.random() * PROF : PROF,
      r: 0.06 + Math.random() * 0.14,          // rayon dans l'espace
      v: 0.35 + Math.random() * 0.9,            // vitesse vers la caméra
      ph: Math.random() * Math.PI * 2,          // phase du scintillement
      ton: Math.random() < 0.82 ? 0 : (Math.random() < 0.5 ? 1 : 2),
    };
    return p;
  }
  const TONS = ['233,223,201', '214,214,219', '212,178,110'];   // ivoire, argent, or

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, o.dpr);
    W = window.innerWidth; H = window.innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    c.style.width = W + 'px'; c.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H * 0.46;
    focale = Math.max(W, H) * FOCALE;
    const n = Math.min(o.particules, Math.max(60, Math.round(W * H / o.densite)));
    parts = [];
    for (let i = 0; i < n; i++) parts.push(creer(true));
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Parallaxe : souris et défilement ─────────────────────────────────
  if (!tactile) {
    window.addEventListener('pointermove', e => {
      cible.ry = (e.clientX / W - 0.5) * 0.09;      // tourner la tête à gauche / droite
      cible.rx = (e.clientY / H - 0.5) * 0.06;      // … et de haut en bas
      cible.x = (e.clientX / W - 0.5) * 1.6;        // et se décaler un peu
      cible.y = -(e.clientY / H - 0.5) * 0.8;
    }, { passive: true });
  }
  window.addEventListener('scroll', () => { scrollT = window.scrollY || 0; }, { passive: true });

  // Tourne un point de l'espace selon l'orientation de la caméra
  // (autour de Y : gauche/droite, puis autour de X : haut/bas).
  function tourner(x, y, z) {
    const cy1 = Math.cos(cam.ry), sy1 = Math.sin(cam.ry);
    const x1 = x * cy1 - z * sy1, z1 = x * sy1 + z * cy1;
    const cx1 = Math.cos(cam.rx), sx1 = Math.sin(cam.rx);
    return { x: x1, y: y * cx1 - z1 * sx1, z: y * sx1 + z1 * cx1 };
  }
  const PLAN = 0.4;   // rien ne se dessine plus près que ça de la caméra
  function ecran(p) { const s = focale / p.z; return { sx: cx + p.x * s, sy: cy - p.y * s, s, z: p.z }; }
  // Projette un point ; null s'il est derrière la caméra.
  function projeter(x, y, z) {
    const p = tourner(x, y, z);
    return p.z <= PLAN ? null : ecran(p);
  }
  // Projette un segment en le coupant au plan de la caméra : une ligne qui
  // part de derrière nous garde sa partie visible au lieu de disparaître.
  function segment(x1, y1, z1, x2, y2, z2) {
    let a = tourner(x1, y1, z1), b = tourner(x2, y2, z2);
    if (a.z <= PLAN && b.z <= PLAN) return null;
    if (a.z <= PLAN || b.z <= PLAN) {
      const k = (PLAN + 0.01 - a.z) / (b.z - a.z);
      const c = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: PLAN + 0.01 };
      if (a.z <= PLAN) a = c; else b = c;
    }
    return [ecran(a), ecran(b)];
  }

  // ── Dessin ───────────────────────────────────────────────────────────
  function halos() {
    ctx.globalCompositeOperation = 'lighter';
    [['212,178,110', 0.07, 0, 0], ['205,33,42', 0.05, 2.4, 1.6]].forEach(b => {
      const px = W * (0.3 + 0.4 * Math.sin(t * 0.09 + b[2]));
      const py = H * (0.35 + 0.3 * Math.cos(t * 0.07 + b[3]));
      const g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(W, H) * 0.55);
      g.addColorStop(0, 'rgba(' + b[0] + ',' + b[1] + ')');
      g.addColorStop(1, 'rgba(' + b[0] + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function sol() {
    // Le sol : des lignes de profondeur qui convergent, et des lignes
    // transversales qui avancent vers la caméra (défilement du décor).
    const y = SOL - cam.y;
    const pas = 3.2, zDep = (t * 1.1 * o.vitesse) % pas;
    ctx.lineWidth = 1;
    const X = LARG * 1.6;
    for (let z = PROF; z > 0.6; z -= pas) {
      const zz = z - zDep;
      if (zz <= 0.6) continue;
      const s = segment(-X - cam.x, y, zz, X - cam.x, y, zz);
      if (!s) continue;
      // Les lignes naissent du noir à l'horizon (carré de la distance) et
      // s'éteignent juste avant de passer sous la caméra.
      const loin = 1 - zz / PROF;
      const alpha = 0.34 * loin * loin * Math.min(1, (zz - 0.6) / 2);
      ctx.strokeStyle = 'rgba(233,223,201,' + alpha.toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(s[0].sx, s[0].sy); ctx.lineTo(s[1].sx, s[1].sy); ctx.stroke();
    }
    // Les lignes de fuite, tracées par tronçons : chaque tronçon prend
    // l'intensité de sa distance, comme les lignes transversales.
    const TRONCONS = [[0.6, 4], [4, 10], [10, 20], [20, 36], [36, PROF]];
    for (let x = -X; x <= X; x += pas * 1.3) {
      TRONCONS.forEach(tr => {
        const s = segment(x - cam.x, y, tr[0], x - cam.x, y, tr[1]);
        if (!s) return;
        const zm = (tr[0] + tr[1]) / 2, loin = 1 - zm / PROF;
        const alpha = 0.30 * loin * loin;
        ctx.strokeStyle = 'rgba(233,223,201,' + alpha.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(s[0].sx, s[0].sy); ctx.lineTo(s[1].sx, s[1].sy); ctx.stroke();
      });
    }
  }

  function particules(dt) {
    ctx.globalCompositeOperation = 'lighter';
    // Les plus lointaines d'abord, pour que les proches passent devant.
    parts.sort((a, b) => b.z - a.z);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!reduced) { p.z -= p.v * dt * o.vitesse; p.ph += dt * 1.4; }
      if (p.z < 0.6) { parts[i] = creer(false); continue; }
      const pr = projeter(p.x - cam.x, p.y - cam.y, p.z);
      if (!pr) continue;
      const rayon = Math.min(14, Math.max(0.5, p.r * pr.s));   // plafonné : pas de « lune » devant l'objectif
      const prox = 1 - p.z / PROF;                                   // 0 loin … 1 proche
      const scint = 0.7 + 0.3 * Math.sin(p.ph);
      const alpha = (0.12 + 0.55 * prox) * scint * Math.min(1, (p.z - 0.6) / 3);   // s'efface juste devant la caméra
      const ton = TONS[p.ton];
      if (rayon > 2.2) {                                              // proche : halo doux, comme hors de mise au point
        const g = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, rayon * 2.2);
        g.addColorStop(0, 'rgba(' + ton + ',' + (alpha * 0.55).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + ton + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, rayon * 2.2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(' + ton + ',' + alpha.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, rayon, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function image(dt) {
    // La caméra rejoint sa cible en douceur ; le défilement la fait plonger un peu.
    const k = Math.min(1, dt * 2.2);
    cam.x += (cible.x - cam.x) * k;
    cam.y += (cible.y - cam.y) * k;
    cam.ry += (cible.ry - cam.ry) * k;
    cam.rx += (cible.rx + Math.min(0.05, scrollT / 6000) - cam.rx) * k;
    ctx.clearRect(0, 0, W, H);
    halos();
    sol();
    particules(dt);
  }

  if (reduced) { image(0); return; }   // une seule image, figée
  let derniere = performance.now();
  function boucle(now) {
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - derniere) / 1000);
    derniere = now; t += dt;
    image(dt);
    requestAnimationFrame(boucle);
  }
  requestAnimationFrame(boucle);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { derniere = performance.now(); requestAnimationFrame(boucle); }
  });
};
