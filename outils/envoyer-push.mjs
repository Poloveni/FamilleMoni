// Envoi des notifications push aux appareils abonnés.
// Lancé par le robot GitHub (voir docs/NOTIFICATIONS-PUSH.md).
// Variables d'environnement : SUPABASE_URL, SUPABASE_SERVICE_KEY,
// VAPID_PUBLIC, VAPID_PRIVATE, TITRE, MESSAGE, URL_CIBLE (optionnelles).
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('Secrets manquants — voir docs/NOTIFICATIONS-PUSH.md');
  process.exit(1);
}
webpush.setVapidDetails('mailto:syne@live.fr', VAPID_PUBLIC, VAPID_PRIVATE);
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const { data, error } = await sb.from('push_abonnements').select('*');
if (error) { console.error(error.message); process.exit(1); }

const payload = JSON.stringify({
  titre: process.env.TITRE || 'Famille Moni',
  corps: process.env.MESSAGE || 'La Famille a un message pour toi.',
  url: process.env.URL_CIBLE || 'https://famillemoni.com/espace-membre.html',
});

let ok = 0, nettoyes = 0;
for (const r of data || []) {
  try { await webpush.sendNotification(r.sub, payload); ok++; }
  catch (e) {
    // 404/410 = l'appareil s'est désabonné (appli désinstallée…) : on nettoie.
    if (e.statusCode === 404 || e.statusCode === 410) {
      await sb.from('push_abonnements').delete().eq('user_id', r.user_id);
      nettoyes++;
    } else console.error('échec pour', r.email, '—', e.statusCode || e.message);
  }
}
console.log('envoyés :', ok, '· abonnements expirés nettoyés :', nettoyes, '· total :', (data || []).length);
