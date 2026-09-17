// ─────────────────────────────────────────────────────────────────────────────
//  em-charts.js — les trois moteurs canvas de l'espace membre (barres, anneau,
//  courbe) et le compteur animé. Repris tels quels de l'ancienne page ; ne
//  dépendent que de escT()/fmtArgent() (em-core.js). Chargé après em-core.js.
// ─────────────────────────────────────────────────────────────────────────────
const DONUT_COLORS = ['#d4b26e', '#8b2f2f', '#2a7a45', '#6f7f96', '#e9dfc9', '#6b4a7a', '#b06a3b'];
const CH = {   // couleurs et polices partagées par les trois moteurs canvas
  caps: '600 9px Cinzel, Georgia, serif', num: '700 11px "Playfair Display", Georgia, serif',
  lbl: '500 10.5px "Crimson Pro", Georgia, serif',
  ink: 'rgba(239,230,211,0.92)', ink2: 'rgba(168,156,136,0.95)', dim: 'rgba(151,138,118,0.9)',
  accent: 'rgba(233,223,201,0.55)', green: '#45d97f',
};

// ══ MOTEUR GRAPHIQUE CANVAS ══
// Animations forcées pour tout le monde (choix du proprio), quel que soit le réglage système.
// Respecte le réglage système « réduire les animations » (accessibilité).
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Chaque graphique mémorise comment se redessiner, par conteneur : on les
// rejoue au redimensionnement ET à l'ouverture d'un panneau, car un canvas
// dessiné dans un panneau masqué (largeur 0) retombe à 280 px.
const lastCharts = {};
function memoChart(fn, args) { const c = args[0]; if (c) lastCharts[c.id || 'chart-' + Math.random()] = { fn, args }; }
function redessinerGraphiques() {
  Object.keys(lastCharts).forEach(k => {
    const c = lastCharts[k], el = c.args[0];
    if (!el || !el.isConnected) { delete lastCharts[k]; return; }
    if (el.offsetParent === null) return;               // panneau masqué : on attend
    if (Math.abs(el.clientWidth - 2 - (el.dataset.chartW || 0)) < 4) return;   // déjà à la bonne taille
    c.fn.apply(null, c.args);
  });
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// Compteur animé (les chiffres "défilent" jusqu'à leur valeur)
function countUp(el, target, fmt, ms) {
  if (!el) return;
  fmt = fmt || (v => Math.round(v).toLocaleString('fr-FR'));
  if (REDUCED) { el.innerHTML = fmt(target); return; }
  const t0 = performance.now(); ms = ms || 950;
  (function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    el.innerHTML = fmt(target * easeOut(p));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

function makeCanvas(container, h) {
  container.innerHTML = '';
  const w = Math.max(280, container.clientWidth - 2);
  container.dataset.chartW = w;
  const dpr = window.devicePixelRatio || 1;
  const cv = document.createElement('canvas');
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  container.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  return { cv, ctx, w, h };
}
function roundTopRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.max(0.01, h));
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

// Graphique en barres lumineuses + ligne de quota
function drawBarChart(container, data, quota) {
  memoChart(drawBarChart, [container, data, quota]);
  const { cv, ctx, w, h } = makeCanvas(container, 250);
  const padB = 26, padT = 22;
  const zone = h - padB - padT;
  const maxV = Math.max(quota, ...data.map(d => d.value), 1);
  const n = data.length;
  const gap = Math.min(14, Math.max(5, w / n * 0.25));
  const bw = Math.min(38, (w - 12 - gap * (n - 1)) / n);
  const x0 = (w - (bw * n + gap * (n - 1))) / 2;
  let hoverIdx = -1;
  function render(p) {
    ctx.clearRect(0, 0, w, h);
    const qy = padT + zone * (1 - quota / maxV);
    ctx.save();
    ctx.strokeStyle = CH.accent; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, qy); ctx.lineTo(w, qy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = CH.accent; ctx.font = CH.caps; ctx.textAlign = 'right';
    ctx.fillText('QUOTA ' + quota, w - 4, qy - 5);
    ctx.restore();
    // Largeur de l'espace disponible par étiquette : au-delà on tronque,
    // sinon les noms se marchaient dessus dès douze membres.
    const slot = bw + gap;
    const maxCar = Math.max(4, Math.floor(slot / 6.2));
    const coupe = s => s.length > maxCar ? s.slice(0, maxCar - 1) + '…' : s;
    data.forEach((d, i) => {
      const x = x0 + i * (bw + gap);
      const bh = Math.max(2, zone * (d.value / maxV) * p);
      const y = padT + zone - bh;
      const done = d.value >= quota;
      const grad = ctx.createLinearGradient(0, y, 0, y + bh);
      // Quota atteint : vert forêt. Premier : ivoire. Les autres : ardoise.
      if (done) { grad.addColorStop(0, '#45d97f'); grad.addColorStop(1, '#1a5230'); }
      else if (i === 0) { grad.addColorStop(0, '#f1ead9'); grad.addColorStop(1, '#8a7d69'); }
      else { grad.addColorStop(0, '#8d8d96'); grad.addColorStop(1, '#3a3a40'); }
      ctx.save();
      ctx.shadowColor = done ? 'rgba(69,217,127,0.35)' : 'rgba(233,223,201,0.18)';
      ctx.shadowBlur = hoverIdx === i ? 18 : 6;
      ctx.fillStyle = grad;
      roundTopRect(ctx, x, y, bw, bh, 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundTopRect(ctx, x, y, bw, Math.min(3, bh), 2); ctx.fill();
      ctx.fillStyle = hoverIdx === i ? '#fff' : CH.ink;
      ctx.font = CH.num; ctx.textAlign = 'center';
      ctx.fillText(Math.round(d.value * p), x + bw / 2, y - 6);
      ctx.fillStyle = hoverIdx === i ? CH.ink : CH.dim;
      ctx.font = CH.caps;
      // Étiquette : les noms à deux mots (homonymes) s'écrivent sur deux lignes.
      const mots = d.label.split(/\s+/);
      const cx = x + bw / 2;
      if (mots.length >= 2) {
        ctx.fillText(coupe(mots[0]).toUpperCase(), cx, h - 17);
        ctx.fillText(coupe(mots.slice(1).join(' ')).toUpperCase(), cx, h - 7);
      } else {
        ctx.fillText(coupe(mots[0] || '').toUpperCase(), cx, h - 10);
      }
    });
  }
  if (REDUCED) render(1);
  else {
    const t0 = performance.now();
    (function anim(now) {
      const p = Math.min(1, (now - t0) / 900);
      render(easeOut(p));
      if (p < 1) requestAnimationFrame(anim);
    })(t0);
  }
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const idx = Math.floor((mx - x0) / (bw + gap));
    const inBar = idx >= 0 && idx < n && (mx - x0) - idx * (bw + gap) <= bw;
    const ni = inBar ? idx : -1;
    if (ni !== hoverIdx) {
      hoverIdx = ni; render(1);
      cv.title = ni >= 0 ? data[ni].full + ' — ' + data[ni].value + ' ventes' : '';
    }
  });
  cv.addEventListener('mouseleave', () => { if (hoverIdx !== -1) { hoverIdx = -1; render(1); } });
}

// Donut animé avec halo + total au centre
function drawDonut(container, parts) {
  memoChart(drawDonut, [container, parts]);
  container.innerHTML = '';
  container.dataset.chartW = container.clientWidth - 2;
  const wrap = document.createElement('div'); wrap.className = 'donut-wrap';
  const cvBox = document.createElement('div');
  const leg = document.createElement('div'); leg.className = 'legend';
  wrap.appendChild(cvBox); wrap.appendChild(leg);
  container.appendChild(wrap);
  const size = 210;
  const dpr = window.devicePixelRatio || 1;
  const cv = document.createElement('canvas');
  cv.width = size * dpr; cv.height = size * dpr;
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  cvBox.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const total = parts.reduce((t, p) => t + p.val, 0);
  // Une part regroupée (« Autres ») porte son détail : la ligne devient
  // dépliable et liste chaque produit, sans toucher à l'anneau.
  leg.innerHTML = parts.map((p, i) => {
    const ligne = '<span class="dot" style="background:' + DONUT_COLORS[i % DONUT_COLORS.length] + '"></span>' +
      escT(p.nom) + '<b>' + p.val.toLocaleString('fr-FR') + '</b>';
    if (!p.detail || !p.detail.length) return '<div class="leg">' + ligne + '</div>';
    return '<details class="leg-autres"><summary class="leg">' + ligne + '</summary>' +
      p.detail.map(d => '<div class="leg sous">' + escT(d.nom) + '<b>' + d.val.toLocaleString('fr-FR') + '</b></div>').join('') +
      '</details>';
  }).join('');
  const cx = size / 2, cy = size / 2, R = size / 2 - 16, LW = 26;
  function render(p) {
    ctx.clearRect(0, 0, size, size);
    const sweepEnd = -Math.PI / 2 + Math.PI * 2 * p;
    let acc = -Math.PI / 2;
    parts.forEach((s, i) => {
      const seg = Math.PI * 2 * (s.val / total);
      const start = acc, end = Math.min(acc + seg, sweepEnd);
      acc += seg;
      if (end <= start) return;
      ctx.save();
      ctx.strokeStyle = DONUT_COLORS[i % DONUT_COLORS.length];
      ctx.lineWidth = LW;
      ctx.beginPath();
      ctx.arc(cx, cy, R, start + 0.015, end - 0.015);
      ctx.stroke();
      ctx.restore();
    });
    ctx.fillStyle = CH.ink;
    ctx.font = '900 28px "Playfair Display", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(total * p).toLocaleString('fr-FR'), cx, cy - 8);
    ctx.fillStyle = CH.dim; ctx.font = CH.caps;
    ctx.fillText('UNITÉS EN STOCK', cx, cy + 16);
  }
  if (REDUCED) render(1);
  else {
    const t0 = performance.now();
    (function anim(now) {
      const p = Math.min(1, (now - t0) / 1000);
      render(easeOut(p));
      if (p < 1) requestAnimationFrame(anim);
    })(t0);
  }
}

// Courbe animée (aire + ligne lumineuse) — évolution de l'argent sale
function drawLineChart(container, pts) {
  memoChart(drawLineChart, [container, pts]);
  const { cv, ctx, w, h } = makeCanvas(container, 240);
  const padL = 8, padR = 10, padT = 26, padB = 14;
  const xs = pts.map(p => p.t), ys = pts.map(p => p.y);
  const tMin = Math.min.apply(null, xs), tMax = Math.max.apply(null, xs);
  const yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
  const spanT = Math.max(1, tMax - tMin), spanY = Math.max(1, yMax - yMin);
  const X = t => padL + (t - tMin) / spanT * (w - padL - padR);
  const Y = v => padT + (1 - (v - yMin) / spanY) * (h - padT - padB);
  function render(p) {
    ctx.clearRect(0, 0, w, h);
    const nVis = Math.max(2, Math.ceil(pts.length * p));
    const vis = pts.slice(0, nVis);
    ctx.beginPath();
    ctx.moveTo(X(vis[0].t), h - padB);
    vis.forEach(pt => ctx.lineTo(X(pt.t), Y(pt.y)));
    ctx.lineTo(X(vis[vis.length - 1].t), h - padB);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, 'rgba(69,217,127,0.22)');
    grad.addColorStop(1, 'rgba(69,217,127,0)');
    ctx.fillStyle = grad;
    ctx.fill();
    // Repères horizontaux discrets : quatre lignes, pour situer l'échelle.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let g = 1; g <= 3; g++) { const gy = padT + (h - padT - padB) * g / 4; ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke(); }
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    vis.forEach((pt, i) => i ? ctx.lineTo(X(pt.t), Y(pt.y)) : ctx.moveTo(X(pt.t), Y(pt.y)));
    ctx.strokeStyle = CH.green; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    const last = vis[vis.length - 1];
    ctx.save();
    ctx.fillStyle = CH.green; ctx.shadowColor = CH.green; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(X(last.t), Y(last.y), 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = CH.ink; ctx.font = '700 15px "Playfair Display", Georgia, serif'; ctx.textAlign = 'left';
    ctx.fillText(fmtArgent(Math.round(last.y)), padL + 2, 16);
    ctx.fillStyle = CH.dim; ctx.font = CH.caps; ctx.textAlign = 'right';
    ctx.fillText('MAX ' + fmtArgent(yMax), w - 4, 14);
  }
  if (REDUCED) render(1);
  else {
    const t0 = performance.now();
    (function anim(now) {
      const p = Math.min(1, (now - t0) / 1100);
      render(easeOut(p));
      if (p < 1) requestAnimationFrame(anim);
    })(t0);
  }
}

