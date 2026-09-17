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
//   • son compte est approuvé ET en accès complet (table comptes) ;
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
//  Actions : status | link { token } | unlink | api { path, query }
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOT_API_URL = (Deno.env.get("BOT_API_URL") ?? "").replace(/\/+$/, "");
// BOT_GUILD_ID en priorité ; à défaut DISCORD_GUILD_ID, déjà posé pour le bot de présences (même serveur).
const BOT_GUILD_ID = Deno.env.get("BOT_GUILD_ID") || Deno.env.get("DISCORD_GUILD_ID") || "";

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
];

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

// ─── Serveur ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return refus(405, "method", "POST attendu.");

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
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const { data: compte, error: compteErr } = await admin
    .from("comptes").select("approuve, acces").eq("id", user.id).maybeSingle();
  if (compteErr) return refus(500, "site_error", "Vérification du compte impossible : " + compteErr.message);
  if (!compte || compte.approuve !== true) return refus(403, "site_forbidden", "Compte en attente de validation par un administrateur.");
  if (compte.acces && compte.acces !== "complet") return refus(403, "site_forbidden", "Cette rubrique n'est pas ouverte à ce type d'accès.");

  // 3. Quelle action ?
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corps vide toléré pour status */ }
  const action = typeof body.action === "string" ? body.action : "status";

  const configure = !!BOT_API_URL && !!BOT_GUILD_ID;

  // Identité Discord côté site : celle enregistrée par Supabase Auth lors de la
  // connexion OAuth (auth.identities) — pas user_metadata, que l'utilisateur
  // peut modifier lui-même. Un compte email sans identité Discord ne peut pas
  // être lié : on ne saurait pas prouver que le jeton du bot est le sien.
  const identiteDiscord = (user.identities ?? []).find((i) => i.provider === "discord");
  const discordIdSite: string | null = identiteDiscord
    ? String(identiteDiscord.identity_data?.provider_id ?? identiteDiscord.identity_data?.sub ?? identiteDiscord.id ?? "") || null
    : null;

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
    if (!discordIdSite) return refus(403, "no_discord_identity", "Ton compte du site n'est pas relié à Discord : déconnecte-toi puis utilise « Se connecter avec Discord ».", base);

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
    if (me.id !== discordIdSite) return refus(403, "mismatch", "Le compte Discord utilisé chez le bot n'est pas celui relié à ton compte du site. Reconnecte-toi sur Discord avec le bon compte puis recommence.", base);

    const expiresAt = expirationDuJeton(token) ?? new Date(Date.now() + 7 * 24 * 3600 * 1000);
    if (expiresAt.getTime() <= Date.now()) return refus(401, "reconnect", "Ce jeton est déjà expiré.", base);

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
