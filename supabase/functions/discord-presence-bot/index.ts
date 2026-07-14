// ════════════════════════════════════════════════════════════
//  Fonction Edge Supabase — discord-presence-bot
//  Commande /presence sur Discord : publie une présence formatée
//  dans le salon des présences, qui apparaît ensuite sur le
//  planning du site (via sync-discord-presences).
//
//  Secrets requis : DISCORD_BOT_TOKEN, PRESENCES_CHANNEL_ID,
//                   DISCORD_APP_ID, DISCORD_PUBLIC_KEY, DISCORD_GUILD_ID.
//
//  Mise en service :
//   1. Ouvrir une fois l'URL de la fonction avec ?setup à la fin
//      → enregistre la commande /presence sur le serveur.
//   2. Coller l'URL de la fonction dans le portail développeur
//      Discord → General Information → INTERACTIONS ENDPOINT URL.
// ════════════════════════════════════════════════════════════

const TOKEN      = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const CHANNEL    = Deno.env.get("PRESENCES_CHANNEL_ID") ?? "";
const APP_ID     = Deno.env.get("DISCORD_APP_ID") ?? "";
const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY") ?? "";
const GUILD_ID   = Deno.env.get("DISCORD_GUILD_ID") ?? "";
const SYNC_URL   = "https://prwdtdmdkhzwfyivaepw.supabase.co/functions/v1/sync-discord-presences";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function signatureValide(req: Request, body: string): Promise<boolean> {
  try {
    const sig = req.headers.get("x-signature-ed25519") ?? "";
    const ts = req.headers.get("x-signature-timestamp") ?? "";
    if (!sig || !ts || !PUBLIC_KEY) return false;
    const key = await crypto.subtle.importKey("raw", hexToBytes(PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Enregistrement (une seule fois) de la commande /presence ──
  if (req.method === "GET" && url.searchParams.has("setup")) {
    if (!APP_ID || !GUILD_ID || !TOKEN) return new Response("Secrets manquants (DISCORD_APP_ID / DISCORD_GUILD_ID / DISCORD_BOT_TOKEN).", { status: 500 });
    const cmd = {
      name: "presence",
      description: "Publier une présence sur le planning de la famille",
      options: [
        { type: 3, name: "titre",  description: "Titre (ex : Descente au QG)",            required: true },
        { type: 3, name: "date",   description: "Date au format JJ/MM (ex : 18/07)",      required: true },
        { type: 3, name: "heure",  description: "Heure (ex : 21h00)",                     required: true },
        { type: 3, name: "details", description: "Détails supplémentaires (optionnel)",   required: false },
      ],
    };
    const r = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    return new Response(`Enregistrement de /presence : HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
  }

  if (req.method !== "POST") return new Response("discord-presence-bot OK");

  // ── Interactions Discord (signature obligatoire) ──
  const body = await req.text();
  if (!(await signatureValide(req, body))) {
    return new Response("invalid request signature", { status: 401 });
  }
  const inter = JSON.parse(body);

  // PING de vérification de Discord
  if (inter.type === 1) return json({ type: 1 });

  // Commande /presence
  if (inter.type === 2 && inter.data?.name === "presence") {
    const opts: Record<string, string> = {};
    for (const o of (inter.data.options ?? [])) opts[o.name] = String(o.value ?? "").trim();

    if (!/^\d{1,2}\/\d{1,2}$/.test(opts.date ?? "")) {
      return json({ type: 4, data: { content: "❌ Date invalide. Format attendu : JJ/MM (ex : 18/07).", flags: 64 } });
    }
    if (!/^\d{1,2}\s*[hH]\s*\d{0,2}$/.test(opts.heure ?? "")) {
      return json({ type: 4, data: { content: "❌ Heure invalide. Format attendu : 21h ou 21h30.", flags: 64 } });
    }

    const user = inter.member?.nick || inter.member?.user?.global_name || inter.member?.user?.username || "un membre";
    const message = `📋 ${opts.titre}\n🗓 ${opts.date} à ${opts.heure}` +
      (opts.details ? `\n${opts.details}` : "") +
      `\n— proposée par ${user}`;

    const r = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });

    if (!r.ok) {
      return json({ type: 4, data: { content: `❌ Impossible de publier (HTTP ${r.status}). Le bot a-t-il la permission « Envoyer des messages » dans le salon des présences ?`, flags: 64 } });
    }

    // Synchronisation immédiate vers le site (en tâche de fond)
    try {
      // @ts-ignore : API spécifique à l'environnement Supabase Edge
      EdgeRuntime.waitUntil(fetch(SYNC_URL).catch(() => {}));
    } catch { /* pas grave : la synchro auto passera dans les 5 min */ }

    return json({ type: 4, data: { content: "✅ Présence publiée ! Elle apparaît sur le planning du site dans quelques secondes.", flags: 64 } });
  }

  return json({ type: 4, data: { content: "Commande inconnue.", flags: 64 } });
});
