/* ══════════════════════════════════════════════════════════════════════
   fond3d-gl.js — le fond de l'espace membre, en WebGL (three.js r128)

   Une pièce sombre : un sol noir poli qui reflète, une grille d'ivoire
   gravée dedans qui file vers l'horizon, le monogramme M argenté qui
   flotte au loin dans la brume et oscille lentement (même plaque
   métallique que sur l'accueil, même environnement de reflets), de la
   poussière lumineuse en suspension. La caméra dérive doucement, suit la
   souris avec retard et penche un peu au défilement.

   Utilisation :
     const ok = fond3dGL('member-canvas', { logo: 'logo-m-rond.webp' });
     if (!ok) fond3d('member-canvas');        // secours : la version canvas 2D

   Renvoie null (sans toucher au canvas) sur tactile, sans three.js, sans
   WebGL, ou si le système demande « réduire les animations » : dans ces
   cas la version 2D, plus légère, prend le relais.
   ══════════════════════════════════════════════════════════════════════ */
window.fond3dGL = function (id, opts) {
  const o = Object.assign({ logo: 'logo-m-rond.webp', dpr: 1.5, poussiere: 700 }, opts || {});
  const canvas = document.getElementById(id);
  if (!canvas || typeof THREE === 'undefined') return null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  if (window.matchMedia('(hover: none)').matches) return null;

  let renderer;
  // Pas d'antialiasing : la brume adoucit déjà les bords, et c'est un fond.
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' }); }
  catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.dpr));
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0b, 0.034);   // la brume mange le lointain, sans avaler le M
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
  const CAM = { x: 0, y: 2.4, z: 11 };
  camera.position.set(CAM.x, CAM.y, CAM.z);
  const regard = new THREE.Vector3(0, 3.4, -12);

  // ── Reflets : le même petit environnement neutre que le monogramme de l'accueil ──
  // Les faces d'une cube-map doivent être carrées, sinon WebGL les refuse.
  function degrade(haut, milieu, bas) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, haut); gr.addColorStop(0.5, milieu); gr.addColorStop(1, bas);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  const cote = degrade('#6a6a6a', '#1a1a1a', '#040404');
  const envMap = new THREE.CubeTexture([cote, cote, degrade('#a8a8a8', '#8a8a8a', '#6a6a6a'), degrade('#050505', '#030303', '#000'), cote, cote]);
  envMap.needsUpdate = true; envMap.encoding = THREE.sRGBEncoding;

  // ── Lumières : blanc pour le métal, un souffle d'or et de bordeaux pour l'ambiance ──
  scene.add(new THREE.AmbientLight(0x6a6a70, 0.55));
  // Le spot vise le monogramme (sans cible, il pointerait l'origine et le raterait).
  const PLAQUE = { x: 0, y: 7.4, z: -19 };     // assez haut pour se voir entre le titre et la cloche
  const key = new THREE.SpotLight(0xffffff, 2.0, 70, Math.PI / 7, 0.9, 1);
  key.position.set(0, 16, -4); key.target.position.set(PLAQUE.x, PLAQUE.y, PLAQUE.z); scene.add(key, key.target);
  const rim = new THREE.PointLight(0xffffff, 1.0, 50); rim.position.set(0, 6, -32); scene.add(rim);
  // Les lampes de couleur sont hautes et lointaines : elles teintent sans faire de tache sur le sol.
  const or = new THREE.PointLight(0xd4b26e, 0.55, 60); or.position.set(-22, 9, -16); scene.add(or);
  const sang = new THREE.PointLight(0x8b2f2f, 0.45, 60); sang.position.set(22, 8, -14); scene.add(sang);

  // ── Le sol : noir poli, légèrement translucide pour laisser voir le reflet du M ──
  const solGeo = new THREE.PlaneGeometry(240, 240);
  const solMat = new THREE.MeshStandardMaterial({
    // Poli mais pas miroir : un sol trop lisse renvoie chaque lampe en tache blanche.
    color: 0x0b0b0d, metalness: 0.8, roughness: 0.68, envMap, envMapIntensity: 0.5,
    transparent: true, opacity: 0.9,
  });
  const sol = new THREE.Mesh(solGeo, solMat);
  sol.rotation.x = -Math.PI / 2; sol.position.y = 0;
  scene.add(sol);

  // La grille : une texture dessinée à la main, répétée, qui défile vers la caméra.
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gg = gc.getContext('2d');
  gg.clearRect(0, 0, 128, 128);
  gg.strokeStyle = 'rgba(233,223,201,0.9)'; gg.lineWidth = 1.2;
  gg.beginPath(); gg.moveTo(0, 0.6); gg.lineTo(128, 0.6); gg.moveTo(0.6, 0); gg.lineTo(0.6, 128); gg.stroke();
  const grilleTex = new THREE.CanvasTexture(gc);
  grilleTex.wrapS = grilleTex.wrapT = THREE.RepeatWrapping;
  grilleTex.repeat.set(60, 60);
  grilleTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const grille = new THREE.Mesh(solGeo, new THREE.MeshBasicMaterial({
    map: grilleTex, transparent: true, opacity: 0.22, depthWrite: false, fog: true,
  }));
  grille.rotation.x = -Math.PI / 2; grille.position.y = 0.02;
  scene.add(grille);

  // ── La poussière : des points ivoire en suspension, additifs, qui montent lentement ──
  const N = o.poussiere;
  const pos = new Float32Array(N * 3), vit = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 16;
    pos[i * 3 + 2] = -Math.random() * 60 + 8;
    vit[i] = 0.004 + Math.random() * 0.012;
  }
  const dustGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // Un disque doux pour chaque point, plutôt qu'un carré.
  const pc = document.createElement('canvas'); pc.width = pc.height = 32;
  const pg = pc.getContext('2d'), pr = pg.createRadialGradient(16, 16, 0, 16, 16, 16);
  pr.addColorStop(0, 'rgba(255,255,255,1)'); pr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); pr.addColorStop(1, 'rgba(255,255,255,0)');
  pg.fillStyle = pr; pg.fillRect(0, 0, 32, 32);
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xe9dfc9, size: 0.22, map: new THREE.CanvasTexture(pc), transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  scene.add(dust);

  // ── Le monogramme, au loin, et son reflet sous le sol ──
  const world = new THREE.Group();
  world.position.set(PLAQUE.x, PLAQUE.y, PLAQUE.z);
  scene.add(world);
  const reflet = new THREE.Group();
  reflet.position.set(PLAQUE.x, -PLAQUE.y, PLAQUE.z);
  reflet.scale.y = -1;
  scene.add(reflet);
  let plaqueOK = false;

  new THREE.TextureLoader().load(o.logo, tex => {
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.08,
      metalness: 0.8, roughness: 0.32, roughnessMap: tex,
      envMap, envMapIntensity: 2.2, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(8, 8);
    const face = new THREE.Mesh(geo, mat); face.position.z = 0.05;
    const dos = new THREE.Mesh(geo, mat); dos.position.z = -0.05; dos.rotation.y = Math.PI;
    world.add(face, dos);
    const matR = mat.clone(); matR.opacity = 0.3; matR.envMapIntensity = 0.5;
    const faceR = new THREE.Mesh(geo, matR), dosR = new THREE.Mesh(geo, matR);
    faceR.position.z = 0.05; dosR.position.z = -0.05; dosR.rotation.y = Math.PI;
    reflet.add(faceR, dosR);
    plaqueOK = true;
  }, undefined, err => { console.warn('[fond3d-gl] logo non chargé :', err); });

  // ── Souris et défilement ──
  let mx = 0, my = 0, scrollT = 0;
  window.addEventListener('pointermove', e => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
  window.addEventListener('scroll', () => { scrollT = window.scrollY || 0; }, { passive: true });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  const clock = new THREE.Clock();
  let running = true;
  const lisse = { x: 0, y: 0 };
  function animate() {
    if (!running || document.hidden) return;
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, clock.getDelta() || 0.016);
    // La caméra : dérive lente + souris (avec retard) + plongée au défilement.
    lisse.x += (mx - lisse.x) * 0.04;
    lisse.y += (my - lisse.y) * 0.04;
    camera.position.x = CAM.x + Math.sin(t * 0.11) * 1.2 + lisse.x * 2.4;
    camera.position.y = CAM.y + Math.sin(t * 0.17) * 0.35 - lisse.y * 1.2 + Math.min(1.2, scrollT / 900);
    camera.position.z = CAM.z + Math.cos(t * 0.08) * 0.6;
    camera.lookAt(regard.x + lisse.x * 3, regard.y - lisse.y * 2 - Math.min(1.6, scrollT / 700), regard.z);
    // Le monogramme oscille, et son reflet le suit.
    const ry = Math.sin(t * 0.35) * 0.5, rx = Math.sin(t * 0.4) * 0.05;
    world.rotation.set(rx, ry, 0); reflet.rotation.set(-rx, ry, 0);
    world.position.y = PLAQUE.y + Math.sin(t * 0.8) * 0.12; reflet.position.y = -world.position.y;
    key.position.x = Math.sin(t * 0.3) * 4;
    // La grille défile vers nous ; la poussière monte et tourne.
    grilleTex.offset.y = (grilleTex.offset.y - dt * 0.06) % 1;
    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { p[i * 3 + 1] += vit[i]; if (p[i * 3 + 1] > 16) p[i * 3 + 1] = 0; }
    dustGeo.attributes.position.needsUpdate = true;
    dust.rotation.y = t * 0.012;
    renderer.render(scene, camera);
  }
  animate();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && running) { clock.getDelta(); animate(); } });
  canvas.style.opacity = '1';

  return { stop() { running = false; }, resize, isReady: () => plaqueOK };
};
