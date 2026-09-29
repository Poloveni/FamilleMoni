/* DA « Pellicule » : ce que le CSS ne peut pas faire seul.
   Bobine (chapitre actif, heure de la filature, numéro de pose), timecode du viseur, collimateur au curseur,
   citation imprimée mot à mot, liens de la hiérarchie. Les animations liées au défilement sont dans styles.css. */
(function () {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const deux = n => String(n).padStart(2, '0');

  // ---- bobine : un chapitre par section ; les chapitres masqués (hiérarchie, galerie vides) le restent dans l'index
  const liens = [...document.querySelectorAll('.bobine a[data-ch]')];
  const chapitres = liens.map(a => ({ a, sec: document.getElementById(a.dataset.ch) })).filter(c => c.sec);
  const syncMasques = () => chapitres.forEach(c => { c.a.parentElement.hidden = c.sec.hidden; });
  syncMasques();
  const mo = new MutationObserver(syncMasques);
  chapitres.forEach(c => mo.observe(c.sec, { attributes: true, attributeFilter: ['hidden'] }));

  // heure de la filature : de 22:00 à 06:00 au fil de la page ; 36 poses sur la pellicule
  const heure = document.getElementById('heure'), pose = document.getElementById('pose');
  let actif = null, prevu = false;
  function suivi() {
    prevu = false;
    const max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? Math.min(1, scrollY / max) : 0;
    const min = Math.round(p * 8 * 60), h = (22 + Math.floor(min / 60)) % 24;
    heure.textContent = `${deux(h)}:${deux(min % 60)}`;
    pose.textContent = deux(1 + Math.round(p * 35));
    // chapitre actif : le dernier dont le haut a passé le milieu de l'écran
    let c = chapitres[0];
    for (const x of chapitres) if (!x.sec.hidden && x.sec.getBoundingClientRect().top <= innerHeight / 2) c = x;
    if (c !== actif) {
      actif?.a.classList.remove('is-active'); actif?.a.removeAttribute('aria-current');
      c.a.classList.add('is-active'); c.a.setAttribute('aria-current', 'true'); actif = c;
    }
  }
  const demande = () => { if (!prevu) { prevu = true; requestAnimationFrame(suivi); } };
  addEventListener('scroll', demande, { passive: true }); addEventListener('resize', demande); suivi();

  // ---- viseur : timecode à l'heure réelle
  const tc = document.getElementById('timecode');
  const horloge = () => { const d = new Date(); tc.textContent = `${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`; };
  horloge(); setInterval(horloge, 1000);

  // ---- collimateur, nom et photo suivent le curseur (souris seulement) avec un amorti.
  // Une seule boucle d'animation, qui s'arrête dès que tout est immobile ; uniquement des « translate » (carte graphique).
  const prise = document.querySelector('.ch--prise');
  if (prise && !calme && matchMedia('(pointer: fine)').matches) {
    const nom = prise.querySelector('.prise__nom'), photo = prise.querySelector('.prise__photo img'), point = prise.querySelector('.viseur__point');
    let cx = 0, cy = 0, tx = 0, ty = 0, boucle = 0, visible = true, lw = prise.clientWidth, lh = prise.clientHeight;
    addEventListener('resize', () => { lw = prise.clientWidth; lh = prise.clientHeight; });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(prise);
    const pas = () => {
      cx += (tx - cx) * .07; cy += (ty - cy) * .07;
      nom.style.translate = `${(-cx * 18).toFixed(2)}px ${(-cy * 10).toFixed(2)}px`;
      photo.style.translate = `${(-cx * 1.4).toFixed(3)}% ${(-cy * 1.4).toFixed(3)}%`;
      point.style.translate = `${(cx * lw * .16).toFixed(1)}px ${(cy * lh * .16).toFixed(1)}px`;
      boucle = Math.abs(tx - cx) + Math.abs(ty - cy) > .002 ? requestAnimationFrame(pas) : 0;
    };
    addEventListener('pointermove', e => {
      if (!visible) return;
      tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1;
      if (!boucle) boucle = requestAnimationFrame(pas);
    }, { passive: true });
  }

  // ---- « Rejoindre » : ajusté pour occuper exactement la largeur du contenu, sans jamais déborder
  const titre = document.querySelector('.tirage__titre');
  if (titre) {
    const ajuste = () => {
      titre.style.fontSize = '100px';
      const place = titre.parentElement.clientWidth - parseFloat(getComputedStyle(titre.parentElement).paddingLeft) - parseFloat(getComputedStyle(titre.parentElement).paddingRight);
      titre.style.fontSize = `${Math.floor(100 * place / titre.scrollWidth * 10) / 10}px`;
    };
    ajuste(); addEventListener('resize', ajuste); document.fonts?.ready.then(ajuste);
  }

  // ---- citation : chaque mot s'imprime à son tour quand elle entre à l'écran
  const citation = document.getElementById('citation');
  if (citation && !calme && 'IntersectionObserver' in window) {
    const mots = citation.textContent.trim().split(/\s+/);
    citation.innerHTML = '';
    mots.forEach((m, i) => {
      const s = document.createElement('span'); s.className = 'mot'; s.style.setProperty('--i', i); s.textContent = m;
      citation.append(s, ' ');
    });
    new IntersectionObserver(([e], io) => { if (e.isIntersecting) { citation.parentElement.classList.add('is-in'); io.disconnect(); } }, { threshold: .5 }).observe(citation);
  }

  // ---- hiérarchie : chaque fiche est reliée au grade du dessus (fiche la plus proche à l'horizontale), tracé à l'arrivée
  const reseau = document.querySelector('.reseau'), org = document.getElementById('org'), svg = document.getElementById('orgLiens');
  if (!reseau || !org || !svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  function trace() {
    svg.replaceChildren();
    const niveaux = [...org.querySelectorAll('.org__tier')].map(t => [...t.querySelectorAll('.rank')].map(r => ({
      x: r.offsetLeft + r.offsetWidth / 2, haut: r.offsetTop, bas: r.offsetTop + r.offsetHeight })));
    for (let n = 1; n < niveaux.length; n++) {
      for (const f of niveaux[n]) {
        const p = niveaux[n - 1].reduce((a, b) => Math.abs(b.x - f.x) < Math.abs(a.x - f.x) ? b : a);
        const mi = (p.bas + f.haut) / 2, d = document.createElementNS(NS, 'path');
        d.setAttribute('d', `M${p.x} ${p.bas}C${p.x} ${mi} ${f.x} ${mi} ${f.x} ${f.haut}`);
        svg.append(d);
        const l = Math.ceil(d.getTotalLength()); d.style.setProperty('--l', l);
        if (calme) d.style.strokeDasharray = 'none';
      }
    }
  }
  let attente;
  const retrace = () => { clearTimeout(attente); attente = setTimeout(trace, 120); };
  new MutationObserver(retrace).observe(org, { childList: true });
  addEventListener('resize', retrace);
  document.fonts?.ready.then(retrace);
  new IntersectionObserver(([e], io) => { if (e.isIntersecting) { reseau.classList.add('is-in'); io.disconnect(); } }, { threshold: .2 }).observe(reseau);
})();
