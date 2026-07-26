// ════════════════════════════════════════════════════════════
//  Fonction Edge Supabase — sync-discord-annonces
//  Salon Discord des annonces → table "bot_annonces" (section
//  Actualités du site public).
//  Secrets requis : DISCORD_BOT_TOKEN, ANNONCES_CHANNEL_ID.
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const CHANNEL = Deno.env.get("ANNONCES_CHANNEL_ID") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function embedsText(embeds: any[]): string {
  return (embeds || []).map((e) => [e.title, e.description].filter(Boolean).join("\n")).join("\n");
}

Deno.serve(async () => {
  if (!TOKEN || !CHANNEL) {
    return new Response("Secrets manquants (DISCORD_BOT_TOKEN / ANNONCES_CHANNEL_ID).", { status: 500 });
  }
  const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages?limit=10`, {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  if (!res.ok) return new Response(`Erreur Discord ${res.status}: ${await res.text()}`, { status: 500 });
  const msgs = await res.json();

  const rows: any[] = [];
  for (const m of msgs as any[]) {
    const text = [m.content || "", embedsText(m.embeds)].join("\n").trim();
    if (!text) continue;
    rows.push({
      id: String(m.id),
      auteur: m.author?.global_name || m.author?.username || "",
      texte: text.replace(/[*_`#]/g, "").slice(0, 500),
      ts: m.timestamp,
    });
  }

  const sb = createClient(SB_URL, SB_KEY);
  await sb.from("bot_annonces").delete().neq("id", "__aucun__");
  let erreur: string | null = null;
  if (rows.length) {
    const { error } = await sb.from("bot_annonces").insert(rows);
    erreur = error?.message ?? null;
  }
  return new Response(JSON.stringify({ synchronisees: rows.length, erreur }), {
    headers: { "Content-Type": "application/json" },
  });
});
