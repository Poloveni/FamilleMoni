/* Galerie publique (photos postées par les membres depuis l’espace membre) : chapitre « Table lumineuse ».
   Les photos sont posées en négatifs sur une table éclairée ; sous la loupe (curseur), la photo apparaît en positif,
   agrandie. Clic ou toucher : le tirage en grand dans la visionneuse. */
(function () {
  const sec = document.getElementById('galerie'), grid = document.getElementById('galerieGrid'), loupe = document.getElementById('loupe');
  if (!sec) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const deux = n => String(n).padStart(2, '0');
  let photos = [], cur = 0;
  const lb = document.getElementById('lightbox'), img = document.getElementById('lbImg'), cap = document.getElementById('lbCap');
  function show(i) {
    cur = (i + photos.length) % photos.length; const p = photos[cur];
    img.src = p.url; img.alt = p.caption || '';
    cap.innerHTML = `${p.caption ? `<i>${esc(p.caption)}</i> — ` : ''}<b>${esc(p.author.displayName)}</b> <span>${esc(p.author.rankLabel)}</span>`;
    lb.hidden = false; document.body.style.overflow = 'hidden';
  }
  const close = () => { lb.hidden = true; document.body.style.overflow = ''; };
  document.getElementById('lbClose').onclick = close;
  document.getElementById('lbPrev').onclick = () => show(cur - 1);
  document.getElementById('lbNext').onclick = () => show(cur + 1);
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  addEventListener('keydown', e => { if (lb.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });

  // photos d'exemple (fichiers du projet, assets/exemples/) : affichées tant qu'aucune vraie photo n'est publiée.
  // Pour ne jamais les montrer, vider cette liste (et supprimer le dossier).
  const EXEMPLES = [[1, 1600, 900], [2, 1600, 900], [3, 1200, 1200], [4, 1600, 900], [5, 1000, 1400], [6, 1600, 900]]
    .map(([n, width, height]) => ({ url: `assets/exemples/exemple-${n}.jpg`, thumb: `assets/exemples/exemple-${n}.jpg`, width, height,
      caption: 'Photo d’exemple', author: { displayName: 'Exemple', rankLabel: '' } }));

  // format de la case d'après la photo : large, haute ou carrée (la mosaïque se compose en CSS, grid-auto-flow: dense)
  const format = p => { const r = p.width / p.height || 1; return r > 1.35 ? 'large' : r < .8 ? 'haute' : 'carree'; };

  // ---- loupe : suit le curseur ; sur un négatif, découvre le positif agrandi à cet endroit (--lx / --ly en %)
  let survol = null;
  function vise(e) {
    if (e.pointerType !== 'mouse') return;
    const f = e.target.closest('.negatif');
    if (survol && survol !== f) survol.classList.remove('is-loupe');
    survol = f;
    const r = sec.getBoundingClientRect();
    loupe.style.transform = `translate(${e.clientX - r.left}px,${e.clientY - r.top}px)`;
    // la loupe reste visible sur toute la mosaïque : entre deux négatifs, elle ne clignote pas
    sec.classList.toggle('a-loupe', !!e.target.closest('.table__planche'));
    if (!f) return;
    const b = f.querySelector('.negatif__neg').getBoundingClientRect();
    f.style.setProperty('--lx', `${((e.clientX - b.left) / b.width * 100).toFixed(2)}%`);
    f.style.setProperty('--ly', `${((e.clientY - b.top) / b.height * 100).toFixed(2)}%`);
    f.classList.add('is-loupe');
  }
  sec.addEventListener('pointermove', vise);
  sec.addEventListener('pointerleave', () => { sec.classList.remove('a-loupe'); survol?.classList.remove('is-loupe'); survol = null; });

  fetch('api/gallery?limit=24').then(r => r.ok ? r.json() : []).catch(() => []).then(list => {
    photos = list.length ? list : EXEMPLES; if (!photos.length) return;
    // la grande image (url) sert au positif sous la loupe, agrandi ; la miniature au négatif
    grid.innerHTML = photos.map((p, i) => `
      <figure class="negatif negatif--${format(p)}">
        <button type="button" class="negatif__cadre" data-i="${i}" aria-label="Voir le tirage ${i + 1}${p.caption ? ` : ${esc(p.caption)}` : ''}">
          <img class="negatif__neg" src="${esc(p.thumb)}" alt="" loading="lazy">
          <img class="negatif__pos" src="${esc(p.url)}" alt="${esc(p.caption)}" loading="lazy">
        </button>
        <figcaption><b>▸ ${deux(i + 1)}A</b>${p.caption ? `<i>${esc(p.caption)}</i>` : ''}<span>${esc(p.author.displayName)}</span></figcaption>
      </figure>`).join('');
    grid.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) show(Number(b.dataset.i)); });
    sec.hidden = false; const nav = document.getElementById('navGalerie'); if (nav) nav.hidden = false;
  }).catch(() => {});
})();
