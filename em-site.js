// ─────────────────────────────────────────────────────────────────────────────
//  em-site.js — ce qui appartient au SITE (Supabase), pas au bot : hiérarchie,
//  profil, galerie, planning (événements + présences Discord), notifications
//  push. Repris de l'ancienne page ; dépend des globales d'em-core.js
//  (sb, currentUser, currentNom, escT, toast, showMsg, hideMsg, cap, fmtArgent).
// ─────────────────────────────────────────────────────────────────────────────

async function chargerHierarchie() {
  try {
    const [r, h] = await Promise.all([
      sb.from('rangs').select('nom,color,description,ordre').order('ordre'),
      sb.from('hierarchie').select('id,nom,rang').order('nom')
    ]);
    if (!r.error && r.data && r.data.length) window.MONI_RANGS = r.data.map(x => ({ nom: x.nom, color: x.color, desc: x.description }));
    if (!h.error && h.data && h.data.length) {
      window.MONI_MEMBRES = h.data.map(x => ({ id: x.id, nom: x.nom, rang: x.rang }));
      const idx = {}; (window.MONI_RANGS || []).forEach((x, i) => idx[x.nom] = i);
      window.MONI_MEMBRES.sort((a, b) => ((idx[a.rang] ?? 99) - (idx[b.rang] ?? 99)) || a.nom.localeCompare(b.nom));
    }
  } catch (e) { console.warn('[hierarchie] lecture impossible :', e); }
}
function hierMsg(txt, ok) {
  const el = document.getElementById('hier-msg');
  if (!el) return;
  el.textContent = txt; el.className = 'msg ' + (ok ? 'ok' : 'error');
  if (ok) setTimeout(() => { el.className = 'msg'; }, 2500);
}
function hierOptions(sel) {
  return (window.MONI_RANGS || []).map(r => `<option value="${escT(r.nom)}" ${r.nom === sel ? 'selected' : ''}>${escT(r.nom)}</option>`).join('');
}
function hierRender() {
  const rows = document.getElementById('hier-rows'), rrows = document.getElementById('rang-rows');
  if (!rows) return;
  const rangs = window.MONI_RANGS || [], membres = window.MONI_MEMBRES || [];
  document.getElementById('hier-count').textContent = membres.length + ' membre' + (membres.length > 1 ? 's' : '');
  document.getElementById('hier-new-rang').innerHTML = hierOptions(rangs.length ? rangs[rangs.length - 1].nom : '');
  rows.innerHTML = membres.length ? membres.map(m => `<tr data-id="${escT(m.id || '')}" data-nom="${escT(m.nom)}">
    <td><input type="text" value="${escT(m.nom)}" data-f="nom" /></td>
    <td><select data-f="rang">${hierOptions(m.rang)}</select></td>
    <td><button class="btn ghost" type="button" onclick="hierEnregistrer(this)">Enregistrer</button><button class="btn danger" type="button" onclick="hierRetirer(this)">Retirer</button></td>
  </tr>`).join('') : '<tr><td colspan="3" class="hint">Aucun membre — ajoute le premier ci-dessus.</td></tr>';
  rows.querySelectorAll('input,select').forEach(el => el.addEventListener('input', () => el.closest('tr').classList.add('is-dirty')));
  rrows.innerHTML = rangs.map((r, i) => `<tr data-nom="${escT(r.nom)}">
    <td class="hint">${i + 1}</td>
    <td><span class="hier-rang-pill" style="background:${escT(r.color)}"></span><b>${escT(r.nom)}</b></td>
    <td><input type="text" value="${escT(r.desc || '')}" data-f="desc" placeholder="Description" /></td>
    <td><button class="btn ghost" type="button" onclick="rangEnregistrer(this)">Enregistrer</button></td>
  </tr>`).join('');
  rrows.querySelectorAll('input').forEach(el => el.addEventListener('input', () => el.closest('tr').classList.add('is-dirty')));
}
async function hierAjouter() {
  const nomEl = document.getElementById('hier-new-nom'), rang = document.getElementById('hier-new-rang').value;
  const nom = nomEl.value.trim().replace(/\s+/g, ' ');
  if (nom.length < 2) { hierMsg('Indique le nom du membre.', false); nomEl.focus(); return; }
  if ((window.MONI_MEMBRES || []).some(m => m.nom.toLowerCase() === nom.toLowerCase())) { hierMsg('Ce membre est déjà dans la liste.', false); return; }
  const { error } = await sb.from('hierarchie').insert({ nom, rang });
  if (error) { hierMsg('Ajout impossible : ' + error.message, false); return; }
  nomEl.value = '';
  await chargerHierarchie(); remplirNoms(); hierRender();
  hierMsg(nom + ' rejoint la famille (' + rang + ').', true); toast('Membre ajouté');
}
async function hierEnregistrer(btn) {
  const tr = btn.closest('tr'), id = tr.dataset.id, ancien = tr.dataset.nom;
  const nom = tr.querySelector('[data-f="nom"]').value.trim().replace(/\s+/g, ' ');
  const rang = tr.querySelector('[data-f="rang"]').value;
  if (nom.length < 2) { hierMsg('Le nom ne peut pas être vide.', false); return; }
  btn.disabled = true;
  const q = id ? sb.from('hierarchie').update({ nom, rang }).eq('id', id) : sb.from('hierarchie').upsert({ nom, rang }, { onConflict: 'nom' });
  const { error } = await q;
  btn.disabled = false;
  if (error) { hierMsg('Enregistrement impossible : ' + error.message, false); return; }
  // Si le nom change, la fiche publique (profils) suit pour ne pas être perdue.
  if (id && ancien && ancien !== nom) { try { await sb.from('profils').update({ nom }).eq('nom', ancien); } catch (e) {} }
  await chargerHierarchie(); remplirNoms(); hierRender();
  hierMsg(nom + ' — ' + rang + ' : enregistré.', true); toast('Hiérarchie mise à jour');
}
async function hierRetirer(btn) {
  const tr = btn.closest('tr'), id = tr.dataset.id, nom = tr.dataset.nom;
  if (!id) return;
  if (!confirm('Retirer ' + nom + ' de la hiérarchie ? Sa fiche et son compte ne sont pas supprimés.')) return;
  const { error } = await sb.from('hierarchie').delete().eq('id', id);
  if (error) { hierMsg('Suppression impossible : ' + error.message, false); return; }
  await chargerHierarchie(); remplirNoms(); hierRender();
  hierMsg(nom + ' a été retiré de la hiérarchie.', true); toast('Membre retiré');
}
async function rangEnregistrer(btn) {
  const tr = btn.closest('tr'), nom = tr.dataset.nom;
  const description = tr.querySelector('[data-f="desc"]').value.trim();
  btn.disabled = true;
  const { error } = await sb.from('rangs').update({ description }).eq('nom', nom);
  btn.disabled = false;
  if (error) { hierMsg('Enregistrement impossible : ' + error.message, false); return; }
  await chargerHierarchie(); hierRender();
  toast('Rang « ' + nom + ' » mis à jour');
}

// ── AUTH ──
function remplirNoms() {
  const sel = document.getElementById('nom-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Choisis ton personnage —</option>' +
    window.MONI_MEMBRES.map(m => `<option value="${escT(m.nom)}">${escT(m.nom)} (${escT(m.rang)})</option>`).join('');
  if (cur) sel.value = cur;
}
(function fillNoms() {
  const sel = document.getElementById('nom-select');
  remplirNoms();
  sel.addEventListener('change', () => {
    const m = window.MONI_MEMBRES.find(x => x.nom === sel.value);
    document.getElementById('rang-input').value = m ? m.rang : '';
    if (!currentPhotoUrl && !pendingFile) setAvatarInitials(sel.value);
  });
})();

const PHOTO_MAX_OCTETS = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
let profilSnapshot = '';     // le formulaire tel qu'il était au dernier chargement / enregistrement
let profilDirty = false;

function initiales(nom) {
  return String(nom || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}
function rangCouleur(rang) {
  const r = (window.MONI_RANGS || []).find(x => x.nom === rang);
  return (r && r.color) || '#d6d6db';
}
// Doit rester identique à slugNom() d'accueil.html : c'est l'adresse de la page publique.
function slugNom(n) {
  return String(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// L'avatar est affiché à deux endroits (carte identité + aperçu public) :
// ces deux fonctions les tiennent synchronisés.
function setAvatarInitials(nom) {
  const init = initiales(nom);
  document.getElementById('avatar-big').textContent = init;
  const p = document.getElementById('prev-avatar'); if (p) p.textContent = init;
  const rm = document.getElementById('photo-remove'); if (rm) rm.hidden = true;
}
function setAvatarPhoto(url) {
  const img = `<img src="${escT(url)}" alt="Photo de profil" />`;
  document.getElementById('avatar-big').innerHTML = img;
  const p = document.getElementById('prev-avatar'); if (p) p.innerHTML = img;
  const rm = document.getElementById('photo-remove'); if (rm) rm.hidden = false;
}
function photoErreur(txt) {
  const el = document.getElementById('photo-err'); if (el) el.textContent = txt || '';
}
// Recadre la photo en carré (centré) et la ramène à 640 px de côté : la
// fiche reste nette et le fichier envoyé reste léger. Si le navigateur
// n'y parvient pas, on garde le fichier d'origine ; si l'image est
// illisible, on renvoie null.
function recadrerCarre(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const cote = Math.min(img.naturalWidth, img.naturalHeight);
        const taille = Math.min(640, cote);
        const c = document.createElement('canvas'); c.width = taille; c.height = taille;
        c.getContext('2d').drawImage(img, (img.naturalWidth - cote) / 2, (img.naturalHeight - cote) / 2, cote, cote, 0, 0, taille, taille);
        c.toBlob(b => { URL.revokeObjectURL(url); resolve(b ? new File([b], 'avatar.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.9);
      } catch (e) { URL.revokeObjectURL(url); resolve(file); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
async function onPhotoChosen(e) {
  const file = e.target.files[0];
  e.target.value = '';           // permet de rechoisir le même fichier après une erreur
  if (!file) return;
  photoErreur('');
  if (!PHOTO_TYPES.includes(file.type)) { photoErreur('Format non pris en charge : choisis un JPG, un PNG ou un WebP.'); return; }
  if (file.size > PHOTO_MAX_OCTETS) { photoErreur('Photo trop lourde (' + (file.size / 1048576).toFixed(1) + ' Mo) : 5 Mo maximum.'); return; }
  const carre = await recadrerCarre(file);
  if (!carre) { photoErreur('Impossible de lire cette image. Essaie un autre fichier.'); return; }
  pendingFile = carre;
  const reader = new FileReader();
  reader.onload = () => {
    setAvatarPhoto(reader.result);
    const b = document.getElementById('pid-avatar-badge'); if (b) b.hidden = false;
    marquerModifie();
  };
  reader.readAsDataURL(carre);
}
function retirerPhoto() {
  pendingFile = null; currentPhotoUrl = null; photoErreur('');
  const b = document.getElementById('pid-avatar-badge'); if (b) b.hidden = true;
  setAvatarInitials(document.getElementById('nom-select').value);
  marquerModifie();
}

function profilEtat() {
  return {
    nom: document.getElementById('nom-select').value,
    spec: document.getElementById('spec-input').value.trim(),
    citation: document.getElementById('citation-input').value.trim(),
    bio: document.getElementById('bio-input').value.trim(),
    photo: pendingFile ? 'nouvelle' : (currentPhotoUrl || ''),
  };
}
// Carte identité + aperçu public : même contenu que la modale d'accueil.html.
function majApercuProfil() {
  const s = profilEtat();
  const m = (window.MONI_MEMBRES || []).find(x => x.nom === s.nom);
  const rang = m ? m.rang : '';
  const rc = rangCouleur(rang);
  const T = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const nomEl = document.getElementById('pid-nom');
  if (nomEl) { nomEl.textContent = s.nom || 'Ton personnage'; nomEl.classList.toggle('vide', !s.nom); }
  const badge = document.getElementById('pid-rang-badge');
  if (badge) { badge.textContent = rang || 'Rang à définir'; badge.style.setProperty('--rc', rang ? rc : '#6f6f76'); }
  T('pid-spec', s.spec);
  T('pid-citation', s.citation ? '« ' + s.citation + ' »' : '');
  const lien = document.getElementById('pid-lien');
  // Les deux liens vers la page publique (carte d'identité et aperçu) pointent au même endroit.
  const adresse = s.nom ? 'membre/' + slugNom(s.nom) + '.html' : 'accueil.html#famiglia';
  if (lien) lien.href = adresse;
  const lienPrev = document.getElementById('prev-lien');
  if (lienPrev) lienPrev.href = adresse;
  T('prev-nom', s.nom || '—');
  T('prev-rang', rang || '—');
  const pr = document.getElementById('prev-rang'); if (pr) pr.style.color = rang ? rc : '';
  T('prev-spec', s.spec);
  T('prev-citation', s.citation ? '« ' + s.citation + ' »' : '');
  T('prev-bio', s.bio);
  const vide = document.getElementById('prev-empty'); if (vide) vide.hidden = !!(s.spec || s.citation || s.bio);
  if (!currentPhotoUrl && !pendingFile) setAvatarInitials(s.nom);
}
function majCompteurs() {
  document.querySelectorAll('#profil-form [data-max]').forEach(inp => {
    const max = +inp.dataset.max, n = inp.value.length;
    const c = document.getElementById(inp.id.replace('-input', '-count'));
    if (c) { c.textContent = n + ' / ' + max; c.classList.toggle('warn', n >= max * 0.9 && n < max); c.classList.toggle('full', n >= max); }
    const err = document.getElementById(inp.id.replace('-input', '-err'));
    if (err) err.textContent = n >= max ? 'Limite atteinte : ' + max + ' caractères maximum.' : '';
  });
}
function majDirty() {
  profilDirty = JSON.stringify(profilEtat()) !== profilSnapshot;
  const d = document.getElementById('profil-dirty'); if (d) d.hidden = !profilDirty;
}
function snapshotProfil() { profilSnapshot = JSON.stringify(profilEtat()); majDirty(); }
function marquerModifie() { majApercuProfil(); majCompteurs(); majDirty(); }
(function initProfil() {
  const form = document.getElementById('profil-form');
  if (!form) return;
  form.addEventListener('input', marquerModifie);
  form.addEventListener('change', marquerModifie);
  // Quitter la page avec des changements non enregistrés : le navigateur demande confirmation.
  window.addEventListener('beforeunload', e => { if (profilDirty) { e.preventDefault(); e.returnValue = ''; } });
  majApercuProfil(); majCompteurs(); snapshotProfil();
})();

async function loadProfil() {
  const { data, error } = await sb.from('profils').select('*').eq('id', currentUser.id).maybeSingle();
  if (error) { console.warn(error); }
  if (data) {
    if (data.nom) {
      currentNom = data.nom;
      document.getElementById('nom-select').value = data.nom;
      const m = window.MONI_MEMBRES.find(x => x.nom === data.nom);
      document.getElementById('rang-input').value = m ? m.rang : (data.rang || '');
    }
    if (data.photo_url) { currentPhotoUrl = data.photo_url; setAvatarPhoto(data.photo_url + '?t=' + Date.now()); }
    else setAvatarInitials(data.nom);
    document.getElementById('spec-input').value = data.specialite || '';
    document.getElementById('citation-input').value = data.citation || '';
    document.getElementById('bio-input').value = data.bio || '';
  }
  // L'aperçu reflète ce qui vient d'être chargé, et c'est le nouveau point
  // de référence pour détecter les modifications non enregistrées.
  majApercuProfil(); majCompteurs(); snapshotProfil();
}

async function saveProfil() {
  const btn = document.getElementById('profil-save');
  const lbl = btn.querySelector('.btn-lbl');
  const LBL = 'Enregistrer mon profil';
  const nomSel = document.getElementById('nom-select');
  const nom = nomSel.value;
  const rowNom = nomSel.closest('.f-row');
  const nomErr = document.getElementById('nom-err');
  // Le bouton raconte ce qui se passe : chargement (spinner), succès, erreur (secousse).
  const fin = (ok, texte) => {
    btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy');
    btn.classList.add(ok ? 'is-ok' : 'is-err');
    if (lbl) lbl.textContent = ok ? '✓ Profil enregistré' : 'Réessayer';
    clearTimeout(saveProfil._t);
    saveProfil._t = setTimeout(() => { btn.classList.remove('is-ok', 'is-err'); if (lbl) lbl.textContent = LBL; }, 2200);
    if (!ok) { showMsg('profil-msg', texte, false); toast(texte, 'err'); }
  };
  if (!nom) {
    if (rowNom) rowNom.classList.add('invalid');
    if (nomErr) nomErr.textContent = 'Choisis d’abord ton personnage.';
    nomSel.focus();
    fin(false, 'Choisis d’abord ton personnage.');
    return;
  }
  if (rowNom) rowNom.classList.remove('invalid');
  if (nomErr) nomErr.textContent = '';
  const m = window.MONI_MEMBRES.find(x => x.nom === nom);
  const rang = m ? m.rang : '';
  hideMsg('profil-msg');
  btn.classList.remove('is-ok', 'is-err'); btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
  if (lbl) lbl.textContent = 'Enregistrement…';
  try {
    if (pendingFile) {
      const ext = (pendingFile.name.split('.').pop() || 'jpg').toLowerCase();
      const path = currentUser.id + '/avatar.' + ext;
      const up = await sb.storage.from('photos').upload(path, pendingFile, { upsert: true, cacheControl: '3600' });
      if (up.error) { fin(false, 'Erreur upload photo : ' + up.error.message); return; }
      const pub = sb.storage.from('photos').getPublicUrl(path);
      currentPhotoUrl = pub.data.publicUrl;
      pendingFile = null;
    }
    const row = {
      id: currentUser.id, nom, rang, photo_url: currentPhotoUrl,
      specialite: document.getElementById('spec-input').value.trim() || null,
      citation: document.getElementById('citation-input').value.trim() || null,
      bio: document.getElementById('bio-input').value.trim() || null,
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from('profils').upsert(row);
    if (error) { fin(false, 'Erreur : ' + error.message); return; }
  } catch (e) {
    fin(false, 'Erreur inattendue : ' + ((e && e.message) || e));
    return;
  }
  currentNom = nom;
  if (currentPhotoUrl) setAvatarPhoto(currentPhotoUrl + '?t=' + Date.now()); else setAvatarInitials(nom);
  const badge = document.getElementById('pid-avatar-badge'); if (badge) badge.hidden = true;
  snapshotProfil();
  fin(true);
  toast('Profil enregistré');
  showMsg('profil-msg', 'Ton profil est à jour. Ta fiche apparaît sur le site.', true);
}

// ── GALERIE ──
let galeriePendingFile = null;
function onGalerieChosen(e) {
  const f = e.target.files[0];
  galeriePendingFile = f || null;
  const prev = document.getElementById('galerie-preview');
  const zone = document.getElementById('galerie-zone');
  prev.innerHTML = f ? '<img src="' + URL.createObjectURL(f) + '" alt="Aperçu de la photo choisie" />' : '';
  if (zone) zone.classList.toggle('a-photo', !!f);
}
async function uploadGalerie() {
  const btn = document.getElementById('galerie-btn');
  const lbl = btn && btn.querySelector('.btn-lbl');
  const fin = (ok, txt) => {
    if (btn) { btn.classList.remove('is-loading'); btn.classList.add(ok ? 'is-ok' : 'is-err'); setTimeout(() => btn.classList.remove('is-ok', 'is-err'), 2200); }
    if (lbl) { lbl.textContent = ok ? '✓ Publiée' : 'Réessayer'; setTimeout(() => { lbl.textContent = 'Publier dans la galerie'; }, 2200); }
    if (!ok) { showMsg('galerie-msg', txt, false); toast(txt, 'err'); }
  };
  if (!currentUser) { fin(false, 'Tu dois être connecté.'); return; }
  if (!galeriePendingFile) { fin(false, 'Choisis d’abord une image.'); return; }
  hideMsg('galerie-msg');
  if (btn) btn.classList.add('is-loading');
  if (lbl) lbl.textContent = 'Publication…';
  const file = galeriePendingFile;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = currentUser.id + '/' + Date.now() + '.' + ext;
  const up = await sb.storage.from('galerie').upload(path, file, { cacheControl: '3600' });
  if (up.error) { fin(false, 'Erreur upload : ' + up.error.message); return; }
  const pub = sb.storage.from('galerie').getPublicUrl(path);
  const caption = document.getElementById('galerie-caption').value.trim();
  const { error } = await sb.from('galerie_photos').insert({ url: pub.data.publicUrl, caption: caption, user_id: currentUser.id });
  if (error) { fin(false, 'Erreur : ' + error.message); return; }
  galeriePendingFile = null;
  document.getElementById('galerie-input').value = '';
  document.getElementById('galerie-caption').value = '';
  document.getElementById('galerie-preview').innerHTML = '';
  const zone = document.getElementById('galerie-zone'); if (zone) zone.classList.remove('a-photo');
  fin(true);
  toast('Photo publiée');
  showMsg('galerie-msg', 'Photo publiée ! Elle apparaît maintenant dans la galerie du site.', true);
  loadGalerieRecentes();
}
// Les dernières photos de la galerie publique : on voit ce que la famille
// a posté, et sa propre photo y apparaît juste après la publication.
async function loadGalerieRecentes() {
  const box = document.getElementById('galerie-recentes');
  if (!box) return;
  let r = await sb.from('galerie_photos').select('url,caption,user_id,created_at').order('created_at', { ascending: false }).limit(12);
  if (r.error) r = await sb.from('galerie_photos').select('url,caption,user_id').limit(12);
  const rows = (r && r.data) || [];
  const count = document.getElementById('galerie-count');
  if (count) count.textContent = rows.length ? rows.length + ' dernière' + (rows.length > 1 ? 's' : '') : '';
  box.innerHTML = !rows.length
    ? '<div class="locked">Aucune photo pour l\'instant — la tienne sera la première.</div>'
    : '<div class="galerie-mur">' + rows.map(p =>
        '<figure class="galerie-photo' + (currentUser && p.user_id === currentUser.id ? ' moi' : '') + '">' +
          '<img src="' + escT(p.url) + '" alt="' + escT(p.caption || 'Photo de la galerie') + '" loading="lazy" />' +
          (p.caption ? '<figcaption>' + escT(p.caption) + '</figcaption>' : '') +
        '</figure>').join('') + '</div>';
}

// ── PLANNING HEBDOMADAIRE (événements + présences Discord) ──
const CAL_H0 = 8, CAL_ROWH = 38, CAL_NROWS = 16;   // grille de 08h00 à minuit
let calOffset = 0;       // décalage en semaines par rapport à aujourd'hui
let calItems = [];       // tous les éléments datés (événements + présences)
let calSelected = null;

const CAL_MOIS = { janv: 1, févr: 2, fevr: 2, mars: 3, avr: 4, avri: 4, mai: 5, juin: 6, juil: 7, août: 8, aout: 8, sept: 9, octo: 10, oct: 10, nove: 11, nov: 11, déc: 12, dec: 12 };
// Convertit un événement (jour "05" + mois "Juil" + heure "21h00") en vraie date
function eventDate(e) {
  const j = parseInt(e.jour, 10);
  const ab = String(e.mois || '').toLowerCase().replace('.', '').slice(0, 4);
  let mn = null;
  for (const k in CAL_MOIS) { if (ab.indexOf(k) === 0 || k.indexOf(ab) === 0) { mn = CAL_MOIS[k]; break; } }
  if (!j || !mn) return null;
  const now = new Date();
  let an = now.getFullYear();
  const diff = mn - (now.getMonth() + 1);
  if (diff < -6) an++; else if (diff > 6) an--;
  const hm = String(e.heure || '').match(/(\d{1,2})\s*[hH]\s*(\d{2})?/);
  return new Date(an, mn - 1, j, hm ? Math.min(23, +hm[1]) : 21, hm && hm[2] ? +hm[2] : 0);
}

async function loadEvents() {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;
  const [ev, parts, pres] = await Promise.all([
    sb.from('evenements').select('*'),
    sb.from('participations').select('event_id, user_id'),
    sb.from('bot_presences').select('*'),
  ]);
  const counts = {}, mine = {};
  ((parts && parts.data) || []).forEach(p => {
    counts[p.event_id] = (counts[p.event_id] || 0) + 1;
    if (currentUser && p.user_id === currentUser.id) mine[p.event_id] = true;
  });
  calItems = [];
  ((ev && ev.data) || []).forEach(e => {
    const d = eventDate(e);
    if (!d) return;
    calItems.push({ kind: 'ev', d, titre: e.titre || 'Événement', texte: e.texte || '', heure: e.heure || '', type: e.type || '', id: e.id, count: counts[e.id] || 0, going: !!mine[e.id] });
  });
  ((pres && pres.data) || []).forEach(p => {
    if (!p.date_evt) return;
    calItems.push({ kind: 'pr', d: new Date(p.date_evt), titre: p.titre || 'Présence', texte: p.texte || '', auteur: p.auteur || '', reactions: p.reactions || null });
  });
  renderCal();
  renderAgenda();
}

// L'agenda : les rendez-vous des 14 prochains jours, en cartes, avec la
// réponse « je participe » directement dessus. La grille reste dessous.
function renderAgenda() {
  const box = document.getElementById('cal-agenda');
  if (!box) return;
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const fin = new Date(auj); fin.setDate(fin.getDate() + 14);
  const prochains = calItems.map((it, idx) => ({ it, idx }))
    .filter(x => x.it.d >= auj && x.it.d < fin)
    .sort((a, b) => a.it.d - b.it.d);
  if (!prochains.length) {
    box.innerHTML = '<div class="locked">Rien de prévu dans les deux prochaines semaines — la famille se repose, ou prépare quelque chose.</div>';
    return;
  }
  const demain = new Date(auj); demain.setDate(demain.getDate() + 1);
  box.innerHTML = '<div class="agenda">' + prochains.map(({ it, idx }) => {
    const quand = it.d < demain ? "Aujourd'hui" : it.d < new Date(demain.getTime() + 86400000) ? 'Demain' : it.d.toLocaleDateString('fr-FR', { weekday: 'long' });
    const heure = String(it.d.getHours()).padStart(2, '0') + 'h' + String(it.d.getMinutes()).padStart(2, '0');
    const nb = it.kind === 'ev' ? it.count : ((it.reactions && it.reactions.oui) || []).length;
    return '<article class="agenda-item ' + it.kind + '">' +
      '<div class="agenda-date"><b>' + it.d.getDate() + '</b><span>' + it.d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') + '</span></div>' +
      '<div class="agenda-corps">' +
        '<div class="agenda-meta">' + escT(cap(quand)) + ' · ' + heure +
          (it.kind === 'ev' ? (it.type ? ' <span class="pill">' + escT(it.type) + '</span>' : '') : ' <span class="pill ok">présence</span>') + '</div>' +
        '<div class="agenda-titre">' + escT(it.titre) + '</div>' +
        (it.texte ? '<div class="agenda-txt">' + escT(it.texte) + '</div>' : '') +
      '</div>' +
      '<div class="agenda-act">' +
        (it.kind === 'ev'
          ? '<button type="button" class="btn ' + (it.going ? 'ghost' : 'green') + ' agenda-btn" onclick="calRsvp(' + idx + ')">' + (it.going ? '✓ J\'y serai' : 'Je participe') + '</button>'
          : '<button type="button" class="btn ghost agenda-btn" onclick="calShow(' + idx + ');document.getElementById(\'cal-detail\').scrollIntoView({behavior:\'smooth\',block:\'center\'})">Qui vient ?</button>') +
        '<span class="agenda-nb">' + nb + ' participant' + (nb > 1 ? 's' : '') + '</span>' +
      '</div>' +
    '</article>';
  }).join('') + '</div>';
}

function calMonday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + calOffset * 7);
  return d;
}
function calNav(dir) {
  calOffset = dir === 0 ? 0 : calOffset + dir;
  calSelected = null;
  document.getElementById('cal-detail').innerHTML = '';
  renderCal();
}

function renderCal() {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;
  const lundi = calMonday();
  const dim = new Date(lundi); dim.setDate(dim.getDate() + 6);
  const fmtJ = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  document.getElementById('cal-range').textContent = '📅 Semaine du ' + fmtJ(lundi) + ' au ' + fmtJ(dim);
  const noms = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let html = '<div class="cal"><div class="cal-hcell" style="border-left:none;">Heure</div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(lundi); d.setDate(d.getDate() + i);
    html += '<div class="cal-hcell' + (d.getTime() === today.getTime() ? ' today' : '') + '"><b>' + noms[i] + '</b>' +
      String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '</div>';
  }
  // colonne des heures
  html += '<div class="cal-timecol" style="height:' + (CAL_ROWH * CAL_NROWS) + 'px;">';
  for (let h = 0; h < CAL_NROWS; h++) html += '<div class="cal-hour">' + String(CAL_H0 + h).padStart(2, '0') + ':00</div>';
  html += '</div>';
  // 7 colonnes jour avec les éléments positionnés
  for (let i = 0; i < 7; i++) {
    const d0 = new Date(lundi); d0.setDate(d0.getDate() + i);
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    html += '<div class="cal-day' + (d0.getTime() === today.getTime() ? ' today' : '') + '" style="height:' + (CAL_ROWH * CAL_NROWS) + 'px;">';
    calItems.forEach((it, idx) => {
      if (it.d < d0 || it.d >= d1) return;
      const minutes = Math.max(0, (it.d.getHours() - CAL_H0) * 60 + it.d.getMinutes());
      const top = Math.min(CAL_ROWH * CAL_NROWS - 46, minutes / 60 * CAL_ROWH);
      const hLbl = String(it.d.getHours()).padStart(2, '0') + 'h' + String(it.d.getMinutes()).padStart(2, '0');
      html += '<div class="cal-evt ' + it.kind + '" style="top:' + top + 'px;height:52px;" data-cal="' + idx + '" title="' + escT(it.titre) + '">' +
        '<b>' + escT(it.titre) + '</b>' + hLbl + (it.kind === 'ev' && it.count ? ' · ' + it.count + ' 👤' : '') + '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-evt').forEach(el => {
    el.addEventListener('click', () => calShow(parseInt(el.dataset.cal, 10)));
  });
  if (calSelected !== null) calShow(calSelected);
}

function calShow(idx) {
  const it = calItems[idx];
  const box = document.getElementById('cal-detail');
  if (!it || !box) return;
  calSelected = idx;
  const quand = it.d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) +
    ' à ' + String(it.d.getHours()).padStart(2, '0') + 'h' + String(it.d.getMinutes()).padStart(2, '0');
  if (it.kind === 'pr') {
    let reacHtml = '';
    if (it.reactions) {
      const bloc = (emo, lbl, arr) => (arr && arr.length)
        ? '<div style="margin-top:7px;font-size:12.5px;color:var(--muted);">' + emo + ' <b style="color:var(--text);">' + lbl + ' (' + arr.length + ')</b> : ' + arr.map(escT).join(', ') + '</div>'
        : '';
      reacHtml = bloc('✅', 'Présents', it.reactions.oui) + bloc('❌', 'Absents', it.reactions.non) + bloc('❓', 'Incertains', it.reactions.incertain);
      reacHtml = '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
        (reacHtml || '<span class="hint">Personne n\'a encore réagi sur Discord.</span>') + '</div>';
    }
    box.innerHTML = '<div class="cal-card pr"><h3>🟢 ' + escT(it.titre) + '</h3>' +
      '<div class="meta">' + escT(quand) + (it.auteur ? ' · posté par ' + escT(it.auteur) : '') + '</div>' +
      '<p>' + escT(it.texte) + '</p>' + reacHtml + '</div>';
  } else {
    box.innerHTML = '<div class="cal-card"><h3>🔴 ' + escT(it.titre) + (it.type ? ' <span style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;">· ' + escT(it.type) + '</span>' : '') + '</h3>' +
      '<div class="meta">' + escT(quand) + '</div>' +
      '<p>' + escT(it.texte) + '</p>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap;">' +
      '<button class="btn ' + (it.going ? 'ghost' : 'green') + '" style="width:auto;padding:9px 18px;font-size:11px;" onclick="calRsvp(' + idx + ')">' + (it.going ? '✓ Je participe' : 'Je participe') + '</button>' +
      '<span style="font-size:12px;color:var(--muted);">' + it.count + ' participant' + (it.count > 1 ? 's' : '') + '</span></div></div>';
  }
}

async function calRsvp(idx) {
  const it = calItems[idx];
  if (!currentUser || !it || it.kind !== 'ev') return;
  if (it.going) await sb.from('participations').delete().eq('event_id', it.id).eq('user_id', currentUser.id);
  else await sb.from('participations').insert({ event_id: it.id, user_id: currentUser.id });
  await loadEvents();
}


// ── Notifications push (téléphone, même appli fermée) ──
const VAPID_PUB = 'BCLzeteW_uRb6hKgzoCTgLZSCEqa71675H53SvoM1ZmFBXBn6tC2NJBMiko0d6Zp4Bs_BGzJqn6JlP4h8ho5hfs';
function b64ToU8(b) {
  const pad = '='.repeat((4 - b.length % 4) % 4);
  const raw = atob((b + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
window.activerPush = async function () {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('⚠️ Non pris en charge par ce navigateur');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications refusées — tu peux les réactiver dans les réglages du navigateur');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUB) });
    const { error } = await sb.from('push_abonnements').upsert(
      { user_id: currentUser.id, email: currentUser.email, sub: sub.toJSON(), maj: new Date().toISOString() },
      { onConflict: 'user_id' });
    if (error) return toast('⚠️ Enregistrement impossible : ' + error.message);
    toast('📲 Notifications activées sur cet appareil');
    // Test immédiat : on affiche une notification locale. Si elle n'apparaît
    // pas, c'est qu'Android bloque l'affichage (réglages de l'appareil).
    try {
      await reg.showNotification('🔔 Test réussi — Famille Moni', {
        body: 'Si tu vois cette notification, ce téléphone est prêt à recevoir les rappels.',
        icon: './icon-192.png',
        badge: './icon-192.png',
        data: { url: './espace-membre.html' },
      });
    } catch (e2) { toast('⚠️ Android bloque l\'affichage des notifications : ' + e2.message); }
  } catch (e) { toast('⚠️ ' + e.message); }
};
