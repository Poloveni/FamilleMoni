// ─────────────────────────────────────────────────────────────────────────────
//  bot-suivi — passerelle LECTURE SEULE entre l'espace membre et l'API REST
//  du bot Discord (bot-moni-v3, dossier src/api/ du bot).
//
//  Pourquoi une fonction : le site est 100 % statique (GitHub Pages). Le
//  jeton que le bot délivre après la connexion Discord ne doit pas vivre dans
//  le navigateur (lisible par n'importe quelle extension, visible en F12,
//  7 jours de validité). Il est donc rangé ici, dans la table bot_sessions,
//  et chaque consultation passe par cette fonction qui l'ajoute côté serveur.
//
//  Ce que la fonction garantit, quoi que fasse le navigateur :
//   • l'appelant est un membre connecté au site (JWT Supabase vérifié) ;
//   • son compte est approuvé (table comptes) ; un accès « taxes uniquement »
//     ne peut relayer que les routes taxes ;
//   • le jeton du bot qu'il tente de lier correspond à SON compte Discord
//     (identité Discord de Supabase, jamais user_metadata) et à la guilde
//     Famille Moni ;
//   • seules des routes GET connues de l'API du bot sont relayées — aucune
//     écriture, aucun chemin libre ;
//   • un jeton refusé par le bot (expiré, révoqué) est effacé et le site
//     reçoit un état « reconnexion nécessaire », jamais de faux chiffres.
//
//  Secrets attendus (Supabase → Edge Functions → Secrets) :
//    BOT_API_URL      URL publique de l'API du bot, sans slash final
//                     (= API_BASE_URL côté bot, ex. https://bot.exemple.fr)
//    BOT_GUILD_ID     Identifiant du serveur Discord Famille Moni (à défaut,
//                     DISCORD_GUILD_ID déjà présent est utilisé)
//    DISCORD_BOT_TOKEN (optionnel, déjà posé pour les fonctions sync-discord-*) :
//                     lit la photo et le nom affiché Discord pour le panel admin
//    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (fournis
//    automatiquement par Supabase)
//
//  Déploiement :  supabase functions deploy bot-suivi --no-verify-jwt
//  (la vérification du JWT membre est faite ICI, explicitement — le
//  --no-verify-jwt évite que la passerelle refuse la clé « publishable »
//  du site, qui n'est pas un JWT.)
//
//  Appel depuis le site : POST JSON { action, ... } avec
//    Authorization: Bearer <access_token de la session Supabase du membre>
//    apikey: <clé publishable>
//  Actions avec session du site : status | link { token } | unlink | api { path, query }
//  Actions SANS session (page de connexion) : config | login { token }
//    `login` = connexion au site PAR le bot : le jeton du bot, vérifié auprès
//    de lui, désigne un compte Discord ; on retrouve (ou crée) le compte du
//    site qui porte cet identifiant et on lui ouvre une session Supabase via
//    un lien magique consommé côté client (verifyOtp). Un seul écran Discord
//    pour le site et le bot.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOT_API_URL = (Deno.env.get("BOT_API_URL") ?? "").replace(/\/+$/, "");
// BOT_GUILD_ID en priorité ; à défaut DISCORD_GUILD_ID, déjà posé pour le bot de présences (même serveur).
const BOT_GUILD_ID = Deno.env.get("BOT_GUILD_ID") || Deno.env.get("DISCORD_GUILD_ID") || "";
// Optionnel : le jeton du bot de présences du site (déjà utilisé par sync-discord-*).
// Sert UNIQUEMENT à lire la photo et le nom affiché d'un compte Discord, pour
// que le panel admin montre un visage plutôt qu'une adresse technique.
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
/** L'administratrice du site — la même adresse que dans les règles SQL (comptes_details, RLS). */
const ADMIN_EMAIL = "syne@live.fr";

/** Délai maximal d'attente du bot — au-delà, on répond « indisponible » plutôt que de laisser le navigateur pendu. */
const BOT_TIMEOUT_MS = 10_000;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Réponse d'erreur normalisée : `code` est stable (le site s'en sert pour choisir l'état à afficher), `message` est pour l'humain. */
function refus(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, code, message, ...extra }, status);
}

// ─── Routes du bot autorisées ────────────────────────────────────────────────
// Miroir strict de src/api/server.ts + src/api/routes/*.ts du bot. Un chemin
// absent d'ici n'est jamais relayé, même s'il existe côté bot : la liste
// s'allonge à la main, jamais par déduction.
const SNOWFLAKE = "[0-9]{5,25}";
const ROUTES_AUTORISEES: RegExp[] = [
  /^\/api\/me$/,
  /^\/api\/users$/,
  /^\/api\/stocks$/,
  /^\/api\/stocks\/channels$/,
  /^\/api\/stocks\/history$/,
  new RegExp(`^/api/stocks/${SNOWFLAKE}$`),
  /^\/api\/quotas$/,
  /^\/api\/quotas\/config$/,
  /^\/api\/quotas\/summary$/,
  /^\/api\/quotas\/ranking$/,
  /^\/api\/quotas\/pay$/,
  new RegExp(`^/api/quotas/pay/${SNOWFLAKE}$`),
  new RegExp(`^/api/quotas/${SNOWFLAKE}$`),
  /^\/api\/ventes$/,
  new RegExp(`^/api/ventes/${SNOWFLAKE}$`),
  /^\/api\/armurerie$/,
  /^\/api\/armurerie\/search$/,
  /^\/api\/armurerie\/ammo$/,
  /^\/api\/armurerie\/ammo\/history$/,
  /^\/api\/taxes$/,
  /^\/api\/taxes\/search$/,
  /^\/api\/taxes\/[0-9]{1,12}$/,
  // Ajoutées par le second correctif du bot (docs/bot-moni-v3-correctifs/) :
  /^\/api\/braquages$/,
  /^\/api\/cooldowns$/,
  new RegExp(`^/api/cooldowns/${SNOWFLAKE}$`),
];

/** Un compte du site en accès « taxes uniquement » ne relaie que ce qui concerne les taxes (et son identité). */
const ROUTES_TAXES_SEULEMENT: RegExp[] = [/^\/api\/me$/, /^\/api\/users$/, /^\/api\/taxes(\/.*)?$/];

/** Paramètres de requête relayés tels quels (tout autre paramètre est ignoré). Valeurs bornées : jamais de chaîne géante vers le bot. */
const PARAMS_AUTORISES = new Set(["week", "item", "channelId", "limit", "status", "q", "type"]);
const PARAM_MAX = 120;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lit `exp` d'un JWT sans le vérifier (la vérification, c'est le bot qui la fait avec son secret) — sert juste à dater la ligne en base. */
function expirationDuJeton(token: string): Date | null {
  try {
    const part = token.split(".")[1];
    const pad = part.length % 4 ? "=".repeat(4 - (part.length % 4)) : "";
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad));
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

/** Appel GET vers le bot avec le jeton donné. Renvoie le statut HTTP et le corps JSON (ou null si pas du JSON). Lève en cas de panne réseau / délai. */
async function appelBot(path: string, token: string, query: URLSearchParams | null = null): Promise<{ status: number; body: unknown }> {
  const url = BOT_API_URL + path + (query && [...query.keys()].length ? "?" + query.toString() : "");
  const r = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(BOT_TIMEOUT_MS),
  });
  let body: unknown = null;
  const texte = await r.text();
  try { body = texte ? JSON.parse(texte) : null; } catch { body = { raw: texte.slice(0, 300) }; }
  return { status: r.status, body };
}

interface MeBot { id: string; username: string; isAdmin: boolean; isTaxes: boolean; guildId: string }

function estMeBot(x: unknown): x is MeBot {
  return !!x && typeof x === "object" && typeof (x as MeBot).id === "string" && typeof (x as MeBot).guildId === "string";
}

/** URL de départ du flux de connexion au bot — construite ici pour que le site n'ait pas à connaître l'adresse de l'API. */
function loginUrl(): string {
  return `${BOT_API_URL}/auth/login?guild=${encodeURIComponent(BOT_GUILD_ID)}`;
}

// ─── Comptes du site ↔ identifiant Discord ───────────────────────────────────
// deno-lint-ignore no-explicit-any
type Utilisateur = any;
// Client service_role : typé `any` pour ne pas se battre avec les génériques de supabase-js (pas de types de schéma ici).
// deno-lint-ignore no-explicit-any
type Admin = any;

/** Identifiant Discord d'un compte du site : l'identité OAuth Discord (connexion classique) ou `app_metadata.discord_id` (posé par `login`/`link`, hors de portée de l'utilisateur — jamais `user_metadata`, qu'il peut modifier). */
function discordIdDe(user: Utilisateur): string | null {
  const identite = (user.identities ?? []).find((i: Utilisateur) => i.provider === "discord");
  if (identite) {
    const id = String(identite.identity_data?.provider_id ?? identite.identity_data?.sub ?? identite.id ?? "");
    if (id) return id;
  }
  const meta = user.app_metadata?.discord_id;
  return meta ? String(meta) : null;
}

/** Retrouve le compte du site portant cet identifiant Discord (identité OAuth ou app_metadata), ou `null`. La famille compte quelques dizaines de comptes : parcourir la liste suffit. */
async function trouverCompteParDiscord(admin: Admin, discordId: string): Promise<Utilisateur | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("Lecture des comptes impossible : " + error.message);
    const users: Utilisateur[] = data?.users ?? [];
    const trouve = users.find((u) => discordIdDe(u) === discordId);
    if (trouve) return trouve;
    if (users.length < 200) break;
  }
  return null;
}

/**
 * Photo et nom affiché d'un compte Discord, lus auprès de Discord avec le
 * jeton du bot de présences. Au mieux : sans jeton, ou si Discord ne répond
 * pas, on renvoie `null` et rien ne bloque. Sans photo personnalisée, Discord
 * attribue un des six avatars par défaut selon l'identifiant.
 */
async function profilDiscord(discordId: string): Promise<{ avatar_url: string; nom: string | null } | null> {
  if (!DISCORD_BOT_TOKEN || !/^[0-9]{5,25}$/.test(discordId)) return null;
  try {
    const r = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const u = await r.json() as { avatar?: string | null; global_name?: string | null; username?: string };
    const avatar_url = u.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${u.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(discordId) >> 22n) % 6n)}.png`;
    return { avatar_url, nom: u.global_name || u.username || null };
  } catch {
    return null;
  }
}

/** Range photo et nom Discord dans les métadonnées du compte (purement décoratif : lu par le panel admin, jamais par une règle d'accès). */
async function memoriserProfilDiscord(admin: Admin, user: Utilisateur, discordId: string, pseudo: string): Promise<void> {
  const prof = await profilDiscord(discordId);
  const meta = { ...(user.user_metadata ?? {}) };
  const voulu = { user_name: pseudo, full_name: prof?.nom ?? meta.full_name ?? pseudo, ...(prof ? { avatar_url: prof.avatar_url } : {}) };
  const change = Object.entries(voulu).some(([k, v]) => meta[k] !== v);
  if (!change) return;
  await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, ...voulu } });
}

/** Pose `app_metadata.discord_id` sur un compte qui ne l'a pas encore — pour qu'un compte créé par e-mail puis lié au bot soit ensuite retrouvé par `login`. */
async function memoriserDiscordId(admin: Admin, user: Utilisateur, discordId: string): Promise<void> {
  if (user.app_metadata?.discord_id === discordId) return;
  await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata ?? {}), discord_id: discordId } });
}

/** Adresse technique d'un compte créé par le bot — aucun mail n'y est jamais envoyé (compte confirmé d'office, session ouverte par lien magique consommé directement). */
function emailTechnique(me: MeBot): string {
  const base = String(me.username || "membre").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "membre";
  return `${base}.${me.id}@bot.famillemoni.com`;
}

/**
 * action `login` — connexion au site par le bot. Le jeton du bot (obtenu via
 * SON écran Discord) est vérifié auprès de lui ; il désigne un compte Discord
 * du serveur Famille Moni. On retrouve le compte du site correspondant (ou on
 * le crée, en attente de validation comme n'importe quelle inscription), on
 * range le jeton, puis on ouvre une session Supabase pour ce compte : un lien
 * magique généré côté serveur, dont seul le `hashed_token` (usage unique,
 * courte durée) repart au navigateur, qui l'échange contre une session avec
 * `verifyOtp`. Aucun mail n'est envoyé.
 */
async function connexionParLeBot(admin: Admin, body: Record<string, unknown>, configure: boolean): Promise<Response> {
  const base = { configured: configure, loginUrl: configure ? loginUrl() : null };
  if (!configure) return refus(503, "not_configured", "La connexion par le bot n'est pas encore configurée (BOT_API_URL / BOT_GUILD_ID).", base);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 4096 || token.split(".").length !== 3) return refus(400, "bad_request", "Jeton absent ou mal formé.", base);

  let me: unknown;
  try {
    const r = await appelBot("/api/me", token);
    if (r.status === 401) return refus(401, "reconnect", "Le bot a refusé ce jeton (expiré ou invalide) — relance la connexion.", base);
    if (r.status === 403) return refus(403, "forbidden", "Le bot indique que tu n'es pas membre du serveur Discord de la famille.", base);
    if (r.status !== 200) return refus(502, "unavailable", `Réponse inattendue du bot (${r.status}).`, base);
    me = r.body;
  } catch (e) {
    return refus(503, "unavailable", "Le bot ne répond pas : " + String((e as Error).message ?? e), base);
  }
  if (!estMeBot(me)) return refus(502, "unavailable", "Réponse du bot illisible.", base);
  if (me.guildId !== BOT_GUILD_ID) return refus(403, "wrong_guild", "Ce jeton concerne un autre serveur Discord que la Famille Moni.", base);

  let user: Utilisateur | null;
  try { user = await trouverCompteParDiscord(admin, me.id); }
  catch (e) { return refus(500, "site_error", String((e as Error).message ?? e), base); }
  let nouveau = false;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: emailTechnique(me),
      email_confirm: true,
      app_metadata: { discord_id: me.id, via: "bot" },
      user_metadata: { user_name: me.username, full_name: me.username },
    });
    if (error || !data?.user) return refus(500, "site_error", "Création du compte impossible : " + (error?.message ?? "?"), base);
    user = data.user; nouveau = true;
  } else {
    try { await memoriserDiscordId(admin, user, me.id); } catch { /* non bloquant */ }
  }
  try { await memoriserProfilDiscord(admin, user, me.id, me.username); } catch { /* décoratif, non bloquant */ }
  if (!user.email) return refus(500, "site_error", "Ce compte n'a pas d'adresse : impossible d'ouvrir une session.", base);

  const expiresAt = expirationDuJeton(token) ?? new Date(Date.now() + 7 * 24 * 3600 * 1000);
  if (expiresAt.getTime() > Date.now()) {
    await admin.from("bot_sessions").upsert({
      user_id: user.id, discord_id: me.id, username: me.username, token,
      expires_at: expiresAt.toISOString(), is_admin: !!me.isAdmin, is_taxes: !!me.isTaxes,
      linked_at: new Date().toISOString(), last_used: new Date().toISOString(),
    });
  }

  const { data: lien, error: lienErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  const tokenHash = lien?.properties?.hashed_token;
  if (lienErr || !tokenHash) return refus(500, "site_error", "Ouverture de session impossible : " + (lienErr?.message ?? "lien vide"), base);
  return json({ ok: true, ...base, tokenHash, nouveau, me: { id: me.id, username: me.username, isAdmin: !!me.isAdmin, isTaxes: !!me.isTaxes } });
}

// ─── Serveur ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return refus(405, "method", "POST attendu.");

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corps vide toléré pour status */ }
  const action = typeof body.action === "string" ? body.action : "status";
  const configure = !!BOT_API_URL && !!BOT_GUILD_ID;
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // ── Actions publiques : pas encore de session du site ──
  if (action === "config") return json({ ok: true, configured: configure, loginUrl: configure ? loginUrl() : null });
  if (action === "login") return await connexionParLeBot(admin, body, configure);

  // 1. Qui appelle ? Le JWT de session du membre, vérifié par Supabase Auth.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwtMembre = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwtMembre) return refus(401, "unauthorized", "Connecte-toi à l'espace membre.");

  const sbUser = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: `Bearer ${jwtMembre}` } } });
  const { data: userData, error: userErr } = await sbUser.auth.getUser(jwtMembre);
  if (userErr || !userData?.user) return refus(401, "unauthorized", "Session expirée — reconnecte-toi à l'espace membre.");
  const user = userData.user;

  // 2. Le site l'autorise-t-il ? Compte approuvé et accès complet (un compte
  //    « taxes uniquement » ne voit que le panneau Taxes du site, pas cette
  //    rubrique — même règle que le menu, appliquée ici pour de vrai).
  const { data: compte, error: compteErr } = await admin
    .from("comptes").select("approuve, acces").eq("id", user.id).maybeSingle();
  if (compteErr) return refus(500, "site_error", "Vérification du compte impossible : " + compteErr.message);
  if (!compte || compte.approuve !== true) return refus(403, "site_forbidden", "Compte en attente de validation par un administrateur.");
  // Accès « taxes uniquement » (comptes.acces = 'taxes') : même règle que le
  // menu du site, appliquée ici pour de vrai — seules les routes taxes passent.
  const taxesSeulement = compte.acces === "taxes";

  // ── profils (administratrice du site uniquement) ──
  // La photo Discord n'est relevée qu'à la connexion ou à la liaison : les
  // membres liés avant cette fonction n'en ont pas. Le panel admin demande ici
  // un rattrapage. Purement décoratif : on ne touche qu'aux métadonnées
  // d'affichage des comptes du site, jamais au bot ni aux droits.
  if (action === "profils") {
    if ((user.email ?? "").toLowerCase() !== ADMIN_EMAIL) return refus(403, "forbidden", "Réservé à l'administration du site.");
    if (!DISCORD_BOT_TOKEN) return json({ ok: true, jeton: false, maj: 0, photos: {}, echecs: 0 });
    // `ids` : comptes dont la photo enregistrée ne charge plus (avatar changé
    // depuis sur Discord) — à relire même s'ils ont déjà une adresse de photo.
    const forces = new Set((Array.isArray(body.ids) ? body.ids : []).filter((x: unknown) => typeof x === "string").slice(0, 60) as string[]);
    const { data: liaisons } = await admin.from("bot_sessions").select("user_id, discord_id, username");
    const photos: Record<string, string> = {};
    let maj = 0, echecs = 0;
    for (const l of (liaisons ?? []).slice(0, 60)) {
      try {
        const { data: cible } = await admin.auth.admin.getUserById(l.user_id);
        if (!cible?.user) continue;
        const meta = { ...(cible.user.user_metadata ?? {}) };
        if (meta.avatar_url && !forces.has(l.user_id)) continue;
        const prof = await profilDiscord(l.discord_id);
        if (!prof) { echecs++; continue; }
        photos[l.user_id] = prof.avatar_url;
        if (meta.avatar_url !== prof.avatar_url) {
          await admin.auth.admin.updateUserById(l.user_id, { user_metadata: { ...meta, avatar_url: prof.avatar_url, user_name: meta.user_name ?? l.username, full_name: meta.full_name ?? prof.nom ?? l.username } });
          maj++;
        }
      } catch { echecs++; /* un compte en échec ne bloque pas les autres */ }
    }
    return json({ ok: true, jeton: true, maj, photos, echecs });
  }

  // 3. Quelle action ?
  // Identité Discord côté site : celle enregistrée par Supabase Auth lors de la
  // connexion OAuth (auth.identities) — pas user_metadata, que l'utilisateur
  // peut modifier lui-même. Un compte email sans identité Discord ne peut pas
  // être lié : on ne saurait pas prouver que le jeton du bot est le sien.
  const discordIdSite: string | null = discordIdDe(user);

  const { data: session } = await admin
    .from("bot_sessions").select("discord_id, username, token, expires_at, is_admin, is_taxes, linked_at")
    .eq("user_id", user.id).maybeSingle();
  const sessionValide = !!session && new Date(session.expires_at).getTime() > Date.now();

  const base = {
    configured: configure,
    loginUrl: configure ? loginUrl() : null,
    guildId: BOT_GUILD_ID || null,
    discordLinkedOnSite: !!discordIdSite,
  };

  // ── unlink ──
  if (action === "unlink") {
    await admin.from("bot_sessions").delete().eq("user_id", user.id);
    return json({ ok: true, ...base, linked: false });
  }

  // ── link ──
  if (action === "link") {
    if (!configure) return refus(503, "not_configured", "La liaison avec le bot n'est pas encore configurée sur le site (BOT_API_URL / BOT_GUILD_ID).", base);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 4096 || token.split(".").length !== 3) return refus(400, "bad_request", "Jeton absent ou mal formé.", base);

    let me: unknown;
    try {
      const r = await appelBot("/api/me", token);
      if (r.status === 401) return refus(401, "reconnect", "Le bot a refusé ce jeton (expiré ou invalide) — relance la connexion.", base);
      if (r.status === 403) return refus(403, "forbidden", "Le bot indique que tu n'es pas (ou plus) membre du serveur Discord.", base);
      if (r.status !== 200) return refus(502, "unavailable", `Réponse inattendue du bot (${r.status}).`, base);
      me = r.body;
    } catch (e) {
      return refus(503, "unavailable", "Le bot ne répond pas : " + String((e as Error).message ?? e), base);
    }
    if (!estMeBot(me)) return refus(502, "unavailable", "Réponse du bot illisible.", base);
    if (me.guildId !== BOT_GUILD_ID) return refus(403, "wrong_guild", "Ce jeton concerne un autre serveur Discord que la Famille Moni.", base);
    if (discordIdSite) {
      if (me.id !== discordIdSite) return refus(403, "mismatch", "Le compte Discord utilisé chez le bot n'est pas celui relié à ton compte du site. Reconnecte-toi sur Discord avec le bon compte puis recommence.", base);
    } else {
      // Compte du site sans Discord (créé par e-mail) : le jeton prouve que la
      // personne contrôle CE compte Discord — on le rattache, une fois pour
      // toutes, sauf s'il appartient déjà à un autre compte du site (par
      // exemple un doublon créé par la connexion par le bot) : dans ce cas
      // c'est ce doublon qu'il faut supprimer, pas partager un identifiant.
      let autre: Utilisateur | null = null;
      try { autre = await trouverCompteParDiscord(admin, me.id); } catch (e) { return refus(500, "site_error", String((e as Error).message ?? e), base); }
      if (autre && autre.id !== user.id) {
        return refus(409, "discord_pris", "Cet identifiant Discord est déjà rattaché à un autre compte du site (" + String(autre.email ?? "sans adresse") + "). Si c'est un doublon créé par la connexion par le bot, supprime-le dans le panel admin, puis recommence.", base);
      }
    }

    const expiresAt = expirationDuJeton(token) ?? new Date(Date.now() + 7 * 24 * 3600 * 1000);
    if (expiresAt.getTime() <= Date.now()) return refus(401, "reconnect", "Ce jeton est déjà expiré.", base);

    await memoriserDiscordId(admin, user, me.id);
    try { await memoriserProfilDiscord(admin, user, me.id, me.username); } catch { /* décoratif, non bloquant */ }
    const { error: upErr } = await admin.from("bot_sessions").upsert({
      user_id: user.id,
      discord_id: me.id,
      username: me.username,
      token,
      expires_at: expiresAt.toISOString(),
      is_admin: !!me.isAdmin,
      is_taxes: !!me.isTaxes,
      linked_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
    });
    if (upErr) return refus(500, "site_error", "Enregistrement impossible : " + upErr.message, base);
    return json({ ok: true, ...base, linked: true, me: { id: me.id, username: me.username, isAdmin: !!me.isAdmin, isTaxes: !!me.isTaxes }, expiresAt: expiresAt.toISOString() });
  }

  // ── status ──
  if (action === "status") {
    if (!configure) return json({ ok: true, ...base, linked: false, code: "not_configured" });
    if (!sessionValide) {
      if (session) await admin.from("bot_sessions").delete().eq("user_id", user.id); // jeton périmé : on ne le garde pas
      return json({ ok: true, ...base, linked: false, code: session ? "reconnect" : "not_linked" });
    }
    // Rafraîchit l'identité/les droits auprès du bot : avec un bot à jour, /api/me
    // reflète les rôles ACTUELS (pas ceux figés dans le jeton).
    try {
      const r = await appelBot("/api/me", session!.token);
      if (r.status === 401) {
        await admin.from("bot_sessions").delete().eq("user_id", user.id);
        return json({ ok: true, ...base, linked: false, code: "reconnect" });
      }
      if (r.status === 403) return json({ ok: true, ...base, linked: true, code: "forbidden", message: (r.body as { error?: string })?.error ?? "Accès refusé par le bot.", expiresAt: session!.expires_at });
      if (r.status === 200 && estMeBot(r.body)) {
        const me = r.body;
        if (me.isAdmin !== session!.is_admin || me.isTaxes !== session!.is_taxes || me.username !== session!.username) {
          await admin.from("bot_sessions").update({ is_admin: !!me.isAdmin, is_taxes: !!me.isTaxes, username: me.username }).eq("user_id", user.id);
        }
        return json({ ok: true, ...base, linked: true, me: { id: me.id, username: me.username, isAdmin: !!me.isAdmin, isTaxes: !!me.isTaxes }, expiresAt: session!.expires_at, linkedAt: session!.linked_at });
      }
      return json({ ok: true, ...base, linked: true, code: "unavailable", message: `Réponse inattendue du bot (${r.status}).`, expiresAt: session!.expires_at });
    } catch (e) {
      return json({ ok: true, ...base, linked: true, code: "unavailable", message: "Le bot ne répond pas : " + String((e as Error).message ?? e), expiresAt: session!.expires_at,
        me: { id: session!.discord_id, username: session!.username, isAdmin: session!.is_admin, isTaxes: session!.is_taxes } });
    }
  }

  // ── api ──
  if (action === "api") {
    if (!configure) return refus(503, "not_configured", "Liaison avec le bot non configurée.", base);
    if (!sessionValide) return refus(401, session ? "reconnect" : "not_linked", "Connexion au bot requise.", base);

    const path = typeof body.path === "string" ? body.path : "";
    if (!ROUTES_AUTORISEES.some((re) => re.test(path))) return refus(400, "bad_request", "Route non autorisée : " + path.slice(0, 80), base);
    if (taxesSeulement && !ROUTES_TAXES_SEULEMENT.some((re) => re.test(path))) return refus(403, "site_forbidden", "Ton accès au site est limité aux taxes.", base);

    const query = new URLSearchParams();
    const q = (body.query && typeof body.query === "object") ? body.query as Record<string, unknown> : {};
    for (const [k, v] of Object.entries(q)) {
      if (!PARAMS_AUTORISES.has(k) || v === null || v === undefined || v === "") continue;
      query.set(k, String(v).slice(0, PARAM_MAX));
    }

    try {
      const r = await appelBot(path, session!.token, query);
      admin.from("bot_sessions").update({ last_used: new Date().toISOString() }).eq("user_id", user.id).then(() => {});
      if (r.status === 401) {
        await admin.from("bot_sessions").delete().eq("user_id", user.id);
        return refus(401, "reconnect", (r.body as { error?: string })?.error ?? "Jeton refusé par le bot — relance la connexion.", base);
      }
      if (r.status === 403) return refus(403, "forbidden", (r.body as { error?: string })?.error ?? "Accès refusé par le bot.", base);
      if (r.status === 404) return refus(404, "not_found", (r.body as { error?: string })?.error ?? "Introuvable.", base);
      if (r.status === 400) return refus(400, "bad_request", (r.body as { error?: string })?.error ?? "Requête refusée par le bot.", base);
      if (r.status >= 500) return refus(502, "unavailable", `Erreur du bot (${r.status}).`, base);
      return json({ ok: true, status: r.status, fetchedAt: new Date().toISOString(), data: r.body });
    } catch (e) {
      return refus(503, "unavailable", "Le bot ne répond pas : " + String((e as Error).message ?? e), base);
    }
  }

  return refus(400, "bad_request", "Action inconnue : " + action.slice(0, 40), base);
});
