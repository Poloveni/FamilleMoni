/* ══════════════════════════════════════════════════════════════
   logo3d.js — le monogramme M en 3D (three.js r128, sans GLTFLoader)
   Utilisation : monogramme3D(canvas, { fallback: img, scale, camZ, exposure, offsetX, offsetY, src })
   Le logo (logo-m-rond.webp) est posé sur une plaque métallique argentée
   à deux faces qui tourne lentement, avec des reflets et de la poussière.
   Sans WebGL ou en cas d'erreur, l'image de secours reste affichée.
   ══════════════════════════════════════════════════════════════ */
function monogramme3D(canvas, opts) {
  opts = opts || {};
  if (!canvas || typeof THREE === 'undefined') return null;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
  catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure || 1.15;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, opts.camZ || 7.2);

  // Reflets : petit environnement en dégradé gris neutre (le logo garde son argenté)
  function degrade(haut, milieu, bas) {
    var c = document.createElement('canvas'); c.width = 8; c.height = 64;
    var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, haut); gr.addColorStop(0.5, milieu); gr.addColorStop(1, bas);
    g.fillStyle = gr; g.fillRect(0, 0, 8, 64);
    return c;
  }
  var cote = degrade('#7a7a7a', '#1c1c1c', '#040404');
  var envMap = new THREE.CubeTexture([cote, cote, degrade('#b0b0b0', '#8a8a8a', '#7a7a7a'), degrade('#050505', '#030303', '#000'), cote, cote]);
  envMap.needsUpdate = true; envMap.encoding = THREE.sRGBEncoding;

  // Lumières blanches uniquement : aucune teinte sur le métal
  scene.add(new THREE.AmbientLight(0x707070, 0.55));
  var key = new THREE.SpotLight(0xffffff, 2.6, 30, Math.PI / 6, 0.6, 1);
  key.position.set(0, 7, 4); scene.add(key, key.target);
  var fillG = new THREE.PointLight(0xe6e6e6, 1.2, 20); fillG.position.set(-4, 1.5, 3); scene.add(fillG);
  var fillD = new THREE.PointLight(0xdcdcdc, 0.8, 20); fillD.position.set(4, -1, 3); scene.add(fillD);
  var rim = new THREE.PointLight(0xffffff, 1.0, 20); rim.position.set(0, 1, -5); scene.add(rim);

  // Poussière argentée en suspension (fine, et elle tombe lentement)
  var N = 350, dp = new Float32Array(N * 3), vit = new Float32Array(N);
  for (var i = 0; i < N; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 9; dp[i * 3 + 1] = (Math.random() - 0.5) * 9; dp[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1;
    vit[i] = 0.001 + Math.random() * 0.003;
  }
  var dustGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dp, 3));
  var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xbfc4d0, size: 0.022, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(dust);

  var world = new THREE.Group(); scene.add(world);
  var dragging = false, px = 0, py = 0, targetX = 0, targetY = 0, autoSpin = true, mouseX = 0, mouseY = 0, running = true, loaded = false;

  canvas.addEventListener('pointerdown', function (e) { dragging = true; autoSpin = false; px = e.clientX; py = e.clientY; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); });
  addEventListener('pointerup', function () { if (dragging) { dragging = false; setTimeout(function () { autoSpin = true; }, 2500); } });
  addEventListener('pointermove', function (e) {
    if (dragging) { targetY += (e.clientX - px) * 0.008; targetX += (e.clientY - py) * 0.008; px = e.clientX; py = e.clientY; }
    else { mouseX = e.clientX / innerWidth - 0.5; mouseY = e.clientY / innerHeight - 0.5; }
  }, { passive: true });
  canvas.addEventListener('dblclick', function () { targetX = 0; targetY = Math.round(targetY / (2 * Math.PI)) * 2 * Math.PI; });

  // Taille : on suit la taille RÉELLE du canvas à l'écran (et pas celle de son parent),
  // sinon l'image est étirée. Un ResizeObserver rattrape le cas où la taille n'est
  // connue qu'après le chargement de l'image de secours.
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    world.position.x = (opts.offsetX || 0) * (w / h);
  }
  addEventListener('resize', resize); resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

  var clock = new THREE.Clock();
  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    var t = clock.getElapsedTime();
    if (autoSpin && !dragging && !reduced) targetY += 0.006;
    var wantX = THREE.MathUtils.clamp(targetX, -0.6, 0.6) + (dragging ? 0 : -mouseY * 0.2) + (reduced ? 0 : Math.sin(t * 0.4) * 0.06);
    var wantY = targetY + (dragging ? 0 : mouseX * 0.3);
    world.rotation.x += (wantX - world.rotation.x) * 0.08;
    world.rotation.y += (wantY - world.rotation.y) * 0.08;
    key.position.x = Math.sin(t * 0.5) * 2.5;
    world.position.y = (opts.offsetY || 0) + (reduced ? 0 : Math.sin(t * 0.9) * 0.05);
    if (!reduced) {
      var p = dustGeo.attributes.position.array;
      for (var i = 0; i < N; i++) { p[i * 3 + 1] -= vit[i]; if (p[i * 3 + 1] < -4.5) p[i * 3 + 1] = 4.5; }
      dustGeo.attributes.position.needsUpdate = true;
      dust.rotation.y = t * 0.02;
    }
    renderer.render(scene, camera);
  }

  new THREE.TextureLoader().load(opts.src || (document.body.dataset.logo || 'logo-m-rond.webp'), function (tex) {
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    var mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.08,
      metalness: 0.8, roughness: 0.32, roughnessMap: tex,
      envMap: envMap, envMapIntensity: 1.6, side: THREE.DoubleSide
    });
    var taille = opts.scale || 3.4, geo = new THREE.PlaneGeometry(taille, taille);
    var face = new THREE.Mesh(geo, mat); face.position.z = 0.035;
    var dos = new THREE.Mesh(geo, mat); dos.position.z = -0.035; dos.rotation.y = Math.PI;
    world.add(face, dos);
    loaded = true;
    resize();
    if (opts.fallback) { opts.fallback.style.transition = 'opacity .8s'; opts.fallback.style.opacity = '0'; setTimeout(function () { opts.fallback.style.visibility = 'hidden'; }, 900); }
    canvas.style.opacity = '1';
    animate();
  }, undefined, function (err) { console.warn('[logo3d] logo non chargé :', err); running = false; });

  return { stop: function () { running = false; }, resize: resize, isLoaded: function () { return loaded; } };
}
