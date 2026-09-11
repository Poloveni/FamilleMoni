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

  var host = canvas.parentElement;
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
  scene.add(new THREE.AmbientLight(0x5a5a5a, 0.4));
  var key = new THREE.SpotLight(0xffffff, 2.6, 30, Math.PI / 6, 0.6, 1);
  key.position.set(0, 7, 4); scene.add(key, key.target);
  var fillG = new THREE.PointLight(0xe6e6e6, 1.2, 20); fillG.position.set(-4, 1.5, 3); scene.add(fillG);
  var fillD = new THREE.PointLight(0xdcdcdc, 0.8, 20); fillD.position.set(4, -1, 3); scene.add(fillD);
  var rim = new THREE.PointLight(0xffffff, 1.0, 20); rim.position.set(0, 1, -5); scene.add(rim);

  // ── Jeux de lumière ─────────────────────────────────────────
  // 1. Un balayage : une lumière vive qui traverse lentement la plaque de gauche à droite
  var balayage = new THREE.PointLight(0xffffff, 0, 12, 2); balayage.position.set(0, 0.5, 2.2); scene.add(balayage);
  // 2. Un liseré tournant derrière le logo (bord lumineux qui se déplace)
  var orbite = new THREE.PointLight(0xdfe6f2, 1.6, 14, 2); scene.add(orbite);
  // 3. Le faisceau du projecteur, visible dans la poussière (cône translucide)
  var coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  var cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 9, 48, 1, true), coneMat);
  cone.position.set(0, 3.2, -0.6); cone.rotation.x = Math.PI; scene.add(cone);
  var cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 48, 1, true), coneMat.clone()); cone2.material.opacity = 0.035;
  cone2.position.copy(cone.position); cone2.rotation.x = Math.PI; scene.add(cone2);
  // 4. L'éclat : une étincelle qui apparaît quand la plaque fait face à la caméra
  function texEclat() {
    var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
    var r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(255,255,255,.6)'); r.addColorStop(0.5, 'rgba(255,255,255,.08)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,.9)';
    g.fillRect(63, 4, 2, 120); g.fillRect(4, 63, 120, 2);
    return new THREE.CanvasTexture(c);
  }
  var eclat = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEclat(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  eclat.scale.setScalar(1.2); scene.add(eclat);
  // 5. Un sol sombre qui reflète la plaque
  var sol = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0b0b0d, metalness: 0.7, roughness: 0.3, envMap: envMap, envMapIntensity: 0.5 }));
  sol.rotation.x = -Math.PI / 2; sol.position.y = -2.6; scene.add(sol);

  // Poussière argentée en suspension
  var N = 500, dp = new Float32Array(N * 3), vit = new Float32Array(N);
  for (var i = 0; i < N; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 12; dp[i * 3 + 1] = (Math.random() - 0.5) * 10; dp[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    vit[i] = 0.0015 + Math.random() * 0.004;
  }
  var dustGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dp, 3));
  var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xbfc4d0, size: 0.03, transparent: true, opacity: 0.5, depthWrite: false }));
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
    if (autoSpin && !dragging && !reduced) targetY += 0.006;
    var wantX = THREE.MathUtils.clamp(targetX, -0.6, 0.6) + (dragging ? 0 : -mouseY * 0.2) + (reduced ? 0 : Math.sin(t * 0.4) * 0.06);
    var wantY = targetY + (dragging ? 0 : mouseX * 0.3);
    world.rotation.x += (wantX - world.rotation.x) * 0.08;
    world.rotation.y += (wantY - world.rotation.y) * 0.08;
    key.position.x = Math.sin(t * 0.5) * 2.5;
    // Balayage toutes les ~9 s : la lumière traverse la plaque puis s'éteint
    var cycle = (t % 9) / 9, actif = cycle < 0.28, u = cycle / 0.28;
    balayage.position.x = -3.5 + u * 7;
    balayage.intensity = actif ? Math.sin(u * Math.PI) * 5 : 0;
    // Liseré qui tourne derrière le logo
    orbite.position.set(Math.cos(t * 0.6) * 3.2, Math.sin(t * 0.45) * 1.4, -1.6);
    // Respiration du projecteur et de son faisceau
    var souffle = 0.85 + Math.sin(t * 1.3) * 0.08 + Math.sin(t * 7.1) * 0.03;
    key.intensity = 2.6 * souffle; cone.material.opacity = 0.045 * souffle; cone2.material.opacity = 0.035 * souffle;
    // Éclat quand la plaque fait face à la caméra (rotation proche d'un multiple d'un demi-tour)
    var face = Math.abs(Math.cos(world.rotation.y)), force = Math.max(0, (face - 0.985) / 0.015);
    eclat.material.opacity += (force * 0.9 - eclat.material.opacity) * 0.15;
    eclat.material.rotation = t * 0.6;
    var brasX = Math.sin(world.rotation.y) > 0 ? 1 : -1;
    eclat.position.set(brasX * 0.95 * (opts.scale || 3.4) / 3.4, 0.9 + world.position.y, 0.4);
    world.position.y = (opts.offsetY || 0) + (reduced ? 0 : Math.sin(t * 0.9) * 0.05);
    if (!reduced) {
      var p = dustGeo.attributes.position.array;
      for (var i = 0; i < N; i++) { p[i * 3 + 1] -= vit[i]; if (p[i * 3 + 1] < -5) p[i * 3 + 1] = 5; }
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
      envMap: envMap, envMapIntensity: 1.4, side: THREE.DoubleSide
    });
    var taille = opts.scale || 3.4, geo = new THREE.PlaneGeometry(taille, taille);
    var face = new THREE.Mesh(geo, mat); face.position.z = 0.035;
    var dos = new THREE.Mesh(geo, mat); dos.position.z = -0.035; dos.rotation.y = Math.PI;
    world.add(face, dos);
    loaded = true;
    if (opts.fallback) { opts.fallback.style.transition = 'opacity .8s'; opts.fallback.style.opacity = '0'; setTimeout(function () { opts.fallback.style.visibility = 'hidden'; }, 900); }
    canvas.style.opacity = '1';
    animate();
  }, undefined, function (err) { console.warn('[logo3d] logo non chargé :', err); running = false; });

  return { stop: function () { running = false; }, resize: resize, isLoaded: function () { return loaded; } };
}
