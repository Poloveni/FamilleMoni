/* ══════════════════════════════════════════════════════════════════════════
   generer-passeports.mjs — Famille Moni

   Fabrique une page publique par membre : membre/raymond-carter.html

   POURQUOI un fichier par membre plutôt qu'une seule page dynamique ?
   Parce que Discord, Google et les réseaux sociaux lisent le HTML SANS
   exécuter le JavaScript. Une page unique du type membre.html?nom=... aurait
   donné le même aperçu pour tout le monde. Un fichier par membre donne à
   chacun son titre, sa description et son aperçu.

   Ce script est appelé automatiquement par publier.bat. Tu n'as jamais à
   le lancer à la main : ajoute un membre dans supabase-config.js, publie,
   sa page existe.

   Lancement manuel si besoin :   node outils/generer-passeports.mjs
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE   = 'https://famillemoni.com';
const DOSSIER = join(RACINE, 'membre');

// ── 1. On lit la configuration comme le ferait un navigateur ──────────────
const conf = readFileSync(join(RACINE, 'supabase-config.js'), 'utf8');
const bac = { window: {} };
new Function('window', conf).call(bac, bac.window);
const RANGS   = bac.window.MONI_RANGS   || [];
const MEMBRES = bac.window.MONI_MEMBRES || [];

if (!MEMBRES.length) {
  console.error('✖ Aucun membre trouvé dans supabase-config.js — rien à générer.');
  process.exit(1);
}

// ── 2. Petits utilitaires ─────────────────────────────────────────────────
const slug = (n) => n.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // enlève les accents
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const esc = (t) => String(t ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pointFinal = (t) => { t = String(t || '').trim(); return /[.!?…]$/.test(t) ? t : t + '.'; };

const initiales = (n) => (n || '?').split(/\s+/).map(m => m[0]).join('').slice(0, 2).toUpperCase();

// ── 3. Le gabarit d'une page ──────────────────────────────────────────────
function page(m, i) {
  const rang = RANGS.find(r => r.nom === m.rang) || {};
  const chef = m.rang === 'La Donna';
  const couleur = chef ? '#d4b26e' : (rang.color || '#8e8e8e');
  const rangIdx = RANGS.findIndex(r => r.nom === m.rang);
  const romain = ['I','II','III','IV','V','VI','VII','VIII','IX','X'][rangIdx] || '—';
  const s = slug(m.nom);
  const desc = `${m.nom} — ${m.rang} de la Famille Moni, à Roxwood sur Flashback FA. ${rang.desc || ''}`.trim();

  // Voisins de rang, pour naviguer de fiche en fiche
  const prec = MEMBRES[i - 1], suiv = MEMBRES[i + 1];
  const memesRang = MEMBRES.filter(x => x.rang === m.rang).length;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(m.nom)} — ${esc(m.rang)} · Famille Moni</title>
  <meta name="description" content="${esc(desc.slice(0, 158))}" />
  <link rel="canonical" href="${SITE}/membre/${s}.html" />
  <link rel="icon" href="../favicon.ico" sizes="32x32" />
  <meta name="theme-color" content="#0b0c10" />

  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="Famille Moni" />
  <meta property="og:title" content="${esc(m.nom)} — ${esc(m.rang)}" />
  <meta property="og:description" content="${esc(desc.slice(0, 200))}" />
  <meta property="og:image" content="${SITE}/hero-og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${SITE}/membre/${s}.html" />
  <meta property="og:locale" content="fr_FR" />
  <meta name="twitter:card" content="summary_large_image" />

  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Person","name":${JSON.stringify(m.nom)},
   "jobTitle":${JSON.stringify(m.rang)},"url":"${SITE}/membre/${s}.html",
   "memberOf":{"@type":"Organization","name":"Famille Moni","url":"${SITE}/"}}
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:ital,wght@0,700;0,900;1,900&display=swap" rel="stylesheet" />
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    :root{
      --bg:#0b0c10; --surface:#12141b; --surface2:#1a1d27;
      --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.14);
      --text:#f0f0f0; --muted:#8a8a8a; --dim:#8a8a8a;
      --rc:${couleur};
    }
    body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;line-height:1.6;
      min-height:100vh;display:flex;flex-direction:column}
    body::before{content:'';position:fixed;inset:0;z-index:-1;
      background:
        radial-gradient(60vw 60vw at 20% 0%, color-mix(in srgb, var(--rc) 12%, transparent), transparent 60%),
        radial-gradient(50vw 50vw at 90% 20%, rgba(192,57,43,.08), transparent 60%)}
    a{color:inherit}
    .barre{padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;
      justify-content:space-between;gap:16px;flex-wrap:wrap}
    .logo{font-weight:700;letter-spacing:2px;font-size:14px;text-transform:uppercase;text-decoration:none}
    .logo span{color:#e35d4c}
    .retour{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);text-decoration:none}
    .retour:hover{color:var(--text)}
    main{flex:1;max-width:840px;width:100%;margin:0 auto;padding:56px 24px 72px}
    .tete{display:flex;gap:32px;align-items:center;flex-wrap:wrap;margin-bottom:44px}
    .portrait{width:132px;height:132px;border-radius:50%;flex-shrink:0;overflow:hidden;
      display:flex;align-items:center;justify-content:center;
      font-family:'Playfair Display',Georgia,serif;font-size:40px;font-weight:700;
      border:3px solid var(--rc);color:var(--rc);
      background:color-mix(in srgb, var(--rc) 14%, var(--surface2));
      box-shadow:0 0 0 6px color-mix(in srgb, var(--rc) 10%, transparent)}
    ${chef ? `.portrait{background:linear-gradient(160deg,#e6c887,#c39c52);color:#1a1206;border-color:#d4b26e}` : ''}
    .portrait img{width:100%;height:100%;object-fit:cover;display:block}
    .ident h1{font-family:'Playfair Display',Georgia,serif;font-size:clamp(34px,6vw,52px);
      font-weight:900;line-height:1.05;letter-spacing:-1px;margin-bottom:10px}
    .rang{display:inline-flex;align-items:center;gap:10px;font-size:12px;letter-spacing:2px;
      text-transform:uppercase;font-weight:600;color:var(--rc);
      border:1px solid color-mix(in srgb, var(--rc) 45%, transparent);
      background:color-mix(in srgb, var(--rc) 10%, transparent);
      padding:7px 14px;border-radius:30px}
    .rang b{font-family:'Playfair Display',Georgia,serif;font-size:13px}
    .role{color:var(--muted);font-size:15px;margin-top:14px;max-width:420px}
    .grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:2px;
      border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:36px}
    .stat{background:var(--surface);padding:22px 18px;text-align:center}
    .stat-n{font-family:'Playfair Display',Georgia,serif;font-size:34px;font-weight:700;
      line-height:1;color:var(--rc)}
    .stat-l{font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--dim);margin-top:8px}
    .bloc{background:var(--surface);border:1px solid var(--border);border-radius:14px;
      padding:26px 28px;margin-bottom:18px}
    .bloc h2{font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:700;margin-bottom:12px}
    .bloc p{color:var(--muted);font-size:15px}
    .prive{font-size:13.5px;color:var(--dim);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .prive a{color:#e35d4c}
    .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:10px;
      font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;
      text-decoration:none;cursor:pointer;border:1px solid var(--border-strong);
      background:none;color:var(--text);font-family:inherit;transition:.2s}
    .btn:hover{border-color:var(--rc);color:var(--rc)}
    .btn.plein{background:#c0392b;border-color:#c0392b;color:#fff}
    .btn.plein:hover{background:#a93226;color:#fff}
    .voisins{display:flex;justify-content:space-between;gap:16px;margin-top:48px;
      padding-top:24px;border-top:1px solid var(--border);font-size:13px}
    .voisins a{color:var(--muted);text-decoration:none}
    .voisins a:hover{color:var(--text)}
    footer{border-top:1px solid var(--border);padding:22px 24px;text-align:center;
      font-size:12px;color:var(--dim)}
    :focus-visible{outline:2px solid var(--rc);outline-offset:3px}
    @media (max-width:560px){ .tete{gap:22px} .portrait{width:104px;height:104px;font-size:32px} }
    @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style>
</head>
<body>

<header class="barre">
  <a class="logo" href="../index.html">Famille <span>Moni</span></a>
  <a class="retour" href="../index.html#membres">← Tous les membres</a>
</header>

<main>
  <div class="tete">
    <div class="portrait" id="portrait">${esc(initiales(m.nom))}</div>
    <div class="ident">
      <h1>${esc(m.nom)}</h1>
      <div class="rang"><b>${romain}</b> ${esc(m.rang)}</div>
      <p class="role">${esc(rang.desc || 'Membre de la Famille Moni.')}</p>
    </div>
  </div>

  <div class="grille">
    <div class="stat"><div class="stat-n">${romain}</div><div class="stat-l">Palier</div></div>
    <div class="stat"><div class="stat-n" id="s-ventes">—</div><div class="stat-l">Ventes · 30 jours</div></div>
    <div class="stat"><div class="stat-n">${memesRang}</div><div class="stat-l">${memesRang > 1 ? 'Membres à ce palier' : 'Seul à ce palier'}</div></div>
    <div class="stat"><div class="stat-n" id="s-rang">${rangIdx + 1}<span style="font-size:18px;color:var(--dim)">/${RANGS.length}</span></div><div class="stat-l">Dans la hiérarchie</div></div>
  </div>

  <div class="bloc">
    <h2>Le rôle</h2>
    <p>${esc(pointFinal(rang.desc || 'Membre de la Famille Moni'))} Au sein de la famille, ${esc(m.nom)} occupe le rang de <strong style="color:var(--rc)">${esc(m.rang)}</strong>, ${rangIdx === 0 ? 'à la tête de la famille' : `${rangIdx + 1}ᵉ palier sur ${RANGS.length}`}.</p>
  </div>

  <div class="bloc">
    <h2>Statistiques de jeu</h2>
    <p class="prive" id="stats-msg">
      Les chiffres détaillés sont réservés aux membres de la famille.
      <a href="../espace-membre.html">Se connecter à l'espace membre →</a>
    </p>
  </div>

  <div class="actions">
    <a class="btn plein" href="https://discord.gg/8zBwmG4y3" target="_blank" rel="noopener noreferrer">Rejoindre la famille</a>
    <button class="btn" id="partager" type="button">Copier le lien</button>
    <a class="btn" href="../index.html#membres">Voir la famille</a>
  </div>

  <nav class="voisins">
    <div>${prec ? `<a href="${slug(prec.nom)}.html">← ${esc(prec.nom)}</a>` : ''}</div>
    <div>${suiv ? `<a href="${slug(suiv.nom)}.html">${esc(suiv.nom)} →</a>` : ''}</div>
  </nav>
</main>

<footer>Famille Moni — Roxwood, Los Santos · Flashback FA GTA RP · Site fictif</footer>

<script src="../supabase-config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script>
<script>
  var NOM = ${JSON.stringify(m.nom)};

  // Copier le lien de la page — pratique pour le partager sur Discord.
  document.getElementById('partager').addEventListener('click', function () {
    var b = this;
    navigator.clipboard.writeText(location.href).then(function () {
      b.textContent = 'Lien copié ✓';
      setTimeout(function () { b.textContent = 'Copier le lien'; }, 2200);
    }).catch(function () {
      b.textContent = 'Copie refusée — utilise la barre d\\'adresse';
    });
  });

  window.addEventListener('load', function () {
    if (!window.supabase || !window.SUPABASE_URL) return;
    var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

    // La photo de profil est publique : on l'affiche pour tout le monde.
    sb.from('profils').select('nom,photo_url').eq('nom', NOM).maybeSingle().then(function (r) {
      var url = r.data && r.data.photo_url;
      if (!url) return;
      var p = document.getElementById('portrait');
      var img = new Image();
      img.alt = 'Portrait de ' + NOM;
      img.onload = function () { p.textContent = ''; p.appendChild(img); };
      img.src = url;
    });

    // Les statistiques de jeu sont protégées par les règles de la base :
    // elles n'apparaissent que pour un membre connecté ET approuvé.
    sb.auth.getSession().then(function (r) {
      if (!r.data || !r.data.session) return;
      var depuis = new Date(Date.now() - 30 * 864e5).toISOString();
      sb.from('bot_ventes').select('quantite').eq('joueur', NOM).eq('confirmed', true).gte('ts', depuis)
        .then(function (v) {
          if (v.error || !v.data) return;
          var total = v.data.reduce(function (a, x) { return a + (x.quantite || 0); }, 0);
          document.getElementById('s-ventes').textContent = total.toLocaleString('fr-FR');
          document.getElementById('stats-msg').innerHTML =
            'Données du bot Moni · ' + v.data.length + ' vente(s) confirmée(s) sur les 30 derniers jours.';
        });
    });
  });
</script>
</body>
</html>
`;
}

// ── 4. Génération ─────────────────────────────────────────────────────────
mkdirSync(DOSSIER, { recursive: true });

// On efface les pages des anciens membres pour ne pas laisser de fiches
// fantômes en ligne après un départ.
const attendus = new Set(MEMBRES.map(m => slug(m.nom) + '.html'));
if (existsSync(DOSSIER)) {
  for (const f of readdirSync(DOSSIER)) {
    if (f.endsWith('.html') && !attendus.has(f)) {
      unlinkSync(join(DOSSIER, f));
      console.log('  – supprimé (membre parti) : membre/' + f);
    }
  }
}

MEMBRES.forEach((m, i) => {
  writeFileSync(join(DOSSIER, slug(m.nom) + '.html'), page(m, i), 'utf8');
});

// ── 5. Le plan du site inclut les nouvelles pages ─────────────────────────
const urls = [
  { u: SITE + '/', f: 'weekly', p: '1.0' },
  ...MEMBRES.map(m => ({ u: `${SITE}/membre/${slug(m.nom)}.html`, f: 'monthly', p: '0.6' }))
];
writeFileSync(join(RACINE, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(x => `  <url>\n    <loc>${x.u}</loc>\n    <changefreq>${x.f}</changefreq>\n    <priority>${x.p}</priority>\n  </url>`).join('\n') +
  '\n</urlset>\n', 'utf8');

console.log(`✔ ${MEMBRES.length} passeport(s) généré(s) dans membre/ — sitemap.xml mis à jour.`);
