/* ══════════════════════════════════════════════════════════════
   logo3d.js — le monogramme M en 3D (three.js r128 + GLTFLoader)
   Utilisation : monogramme3D(canvas, { fallback: img, scale, offsetX, offsetY })
   Le modèle (logo-m.glb, généré avec Meshy) remplace l'image dès qu'il
   est chargé ; sans WebGL ou en cas d'erreur, l'image reste affichée.
   ══════════════════════════════════════════════════════════════ */
function monogramme3D(canvas, opts) {
  opts = opts || {};
  if (!canvas || typeof THREE === 'undefined' || !THREE.GLTFLoader) return null;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
  catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure || 1.05;

  var host = canvas.parentElement;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, opts.camZ || 6);

  // Environnement « vitrine » : lumière froide, argent, sans couleur.
  var pmrem = new THREE.PMREMGenerator(renderer);
  var es = new THREE.Scene(); es.background = new THREE.Color(0x0d0d10);
  [[4, 4, 4, 0xffffff, 5], [-5, 2, 3, 0xd8dde8, 4], [0, -5, 2, 0x6a6a70, 2]].forEach(function (l) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: l[3] }));
    m.position.set(l[0], l[1], l[2]); m.scale.setScalar(l[4] * 0.3); es.add(m);
  });
  var strip = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.2), new THREE.MeshBasicMaterial({ color: 0xbdbdc4, side: THREE.DoubleSide }));
  strip.position.set(0, 5, -2); strip.rotation.x = Math.PI / 2.4; es.add(strip);
  scene.environment = pmrem.fromScene(es, 0.04).texture;

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  var key = new THREE.SpotLight(0xffffff, 1.6, 40, Math.PI / 5, 0.5); key.position.set(4, 5, 6); scene.add(key);
  var rim = new THREE.PointLight(0xc9d6ff, 1.0, 20); rim.position.set(-5, -2, 3); scene.add(rim);
  var fill = new THREE.PointLight(0xffffff, 0.5, 20); fill.position.set(0, 2, -4); scene.add(fill);

  // Poussière argentée
  var N = 400, dp = new Float32Array(N * 3);
  for (var i = 0; i < N * 3; i++) dp[i] = (Math.random() - 0.5) * 14;
  var dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dp, 3)),
    new THREE.PointsMaterial({ color: 0xbfc4d0, size: 0.022, transparent: true, opacity: 0.5 }));
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

  function resize() {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    world.position.x = (opts.offsetX || 0) * (w / h);
  }
  addEventListener('resize', resize); resize();

  var clock = new THREE.Clock();
  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    var t = clock.getElapsedTime();
    if (autoSpin && !dragging && !reduced) targetY += 0.004;
    var wantX = THREE.MathUtils.clamp(targetX, -0.6, 0.6) + (dragging ? 0 : -mouseY * 0.25);
    var wantY = targetY + (dragging ? 0 : mouseX * 0.35);
    world.rotation.x += (wantX - world.rotation.x) * 0.08;
    world.rotation.y += (wantY - world.rotation.y) * 0.08;
    key.position.x = 4 + Math.sin(t * 0.5) * 2;
    dust.rotation.y = t * 0.02;
    world.position.y = (opts.offsetY || 0) + (reduced ? 0 : Math.sin(t * 0.9) * 0.05);
    renderer.render(scene, camera);
  }

  new THREE.GLTFLoader().load(opts.src || 'logo-m.glb', function (gltf) {
    var model = gltf.scene;
    // Centre + mise à l'échelle (la hauteur du M = opts.scale unités)
    var box = new THREE.Box3().setFromObject(model), size = new THREE.Vector3(), center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    model.position.sub(center);
    var s = (opts.scale || 3.2) / size.y; model.scale.setScalar(s);
    model.traverse(function (o) { if (o.isMesh && o.material) { o.material.envMapIntensity = 1.1; o.material.needsUpdate = true; } });
    world.add(model);
    loaded = true;
    if (opts.fallback) { opts.fallback.style.transition = 'opacity .8s'; opts.fallback.style.opacity = '0'; setTimeout(function () { opts.fallback.style.visibility = 'hidden'; }, 900); }
    canvas.style.opacity = '1';
    animate();
  }, undefined, function (err) { console.warn('[logo3d] modèle non chargé :', err); running = false; });

  return { stop: function () { running = false; }, resize: resize, isLoaded: function () { return loaded; } };
}
