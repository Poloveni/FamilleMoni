// ════════════════════════════════════════════════════════════
//  Fonction Edge Supabase — sync-discord-events
//  Recopie les annonces d'événement (avec date + heure) d'un salon Discord.
//  Gère les messages NATIFS, les EMBEDS (bots) et les messages TRANSFÉRÉS
//  (forwards → contenu dans message_snapshots), et récupère l'image jointe.
//
//  Secrets : DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MOIS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const MOIS_FR: Record<string, number> = {
  janvier: 1, "février": 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, "août": 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, "décembre": 12, decembre: 12,
};
const NB_MAX = 6;

function clean(s: string): string {
  return (s || "")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<@[&!]?\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*?|__|`/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function embedsText(embeds: any[]): string[] {
  const out: string[] = [];
  for (const e of (embeds || [])) {
    if (e.title) out.push(e.title);
    if (e.description) out.push(e.description);
    for (const f of (e.fields || [])) out.push(`${f.name}: ${f.value}`);
  }
  return out;
}

// Texte complet : contenu + embeds + messages transférés (snapshots).
function fullText(msg: any): string {
  const parts: string[] = [msg.content || "", ...embedsText(msg.embeds)];
  for (const s of (msg.message_snapshots || [])) {
    const sm = s.message || {};
    if (sm.content) parts.push(sm.content);
    parts.push(...embedsText(sm.embeds));
  }
  return parts.join("\n");
}

function imageFromAttachments(atts: any[]): string | null {
  const a = (atts || []).find((x) =>
    (x.content_type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(x.url || ""));
  return a ? a.url : null;
}
function imageFromEmbeds(embeds: any[]): string | null {
  for (const e of (embeds || [])) {
    if (e.image?.url) return e.image.url;
    if (e.thumbnail?.url) return e.thumbnail.url;
  }
  return null;
}

// Cherche une image (message, embeds, ou message transféré).
function findImage(msg: any): string | null {
  return imageFromAttachments(msg.attachments) || imageFromEmbeds(msg.embeds) ||
    (msg.message_snapshots || []).reduce((acc: string | null, s: any) => {
      if (acc) return acc;
      const sm = s.message || {};
      return imageFromAttachments(sm.attachments) || imageFromEmbeds(sm.embeds);
    }, null);
}

function findDate(text: string) {
  let m = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (m) return { jour: m[1].padStart(2, "0"), moisNum: parseInt(m[2], 10) };
  m = text.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/i);
  if (m) {
    const mn = MOIS_FR[m[2].toLowerCase()];
    if (mn) return { jour: m[1].padStart(2, "0"), moisNum: mn };
  }
  return null;
}

function findTime(text: string): string | null {
  const m = text.match(/(\d{1,2})\s*[hH]\s*(\d{2})?/);
  if (!m) return null;
  return `${parseInt(m[1], 10)}h${m[2] ?? "00"}`;
}

function findTitle(text: string): string {
  const t = text.match(/Titre\s*:?\s*([^\n]+)/i);
  if (t) return clean(t[1]);
  const first = clean((text.split("\n").map((l) => l.trim()).filter(Boolean)[0]) || "");
  return first
    .replace(/[📢⚠️📅🗓️🎭🕒👥📞ℹ️💬📌🎯•→\-–—]/g, " ")
    .replace(/\d{1,2}\/\d{1,2}/g, "")
    .replace(/\d{1,2}\s*[hH]\d{0,2}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\s+(à|a|le|la|du|de|pour)$/i, "")
    .trim();
}

function detectType(text: string): string | null {
  if (/recrut/i.test(text)) return "Recrutement";
  if (/soir[ée]e|\bbar\b|\bbal\b|f[êe]te/i.test(text)) return "Social";
  return "RP";
}

function toEvent(msg: any) {
  const text = fullText(msg);
  const date = findDate(text);
  const heure = findTime(text);
  if (!date || !heure) return null;

  return {
    discord_id: msg.id,
    jour: date.jour,
    mois: MOIS[date.moisNum - 1],
    heure,
    titre: (findTitle(text) || "Événement").slice(0, 90),
    texte: clean(text.replace(/\n/g, " ")).slice(0, 300),
    type: detectType(text),
    image_url: findImage(msg),
    ordre: date.moisNum * 100 + parseInt(date.jour, 10),
  };
}

Deno.serve(async () => {
  if (!DISCORD_TOKEN || !CHANNEL_ID) {
    return new Response("Secrets Discord manquants.", { status: 500 });
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=100`,
    { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    return new Response(`Erreur Discord ${res.status}: ${body}`, { status: 500 });
  }
  const messages = await res.json();

  const events = (messages as any[])
    .map(toEvent)
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .slice(0, NB_MAX);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  if (events.length) {
    const { error } = await sb.from("evenements").upsert(events, { onConflict: "discord_id" });
    if (error) return new Response(`Erreur base: ${error.message} :: DEBUG=${JSON.stringify(events[0])}`, { status: 500 });
  }

  const idsActifs = events.map((e) => e.discord_id);
  let delQuery = sb.from("evenements").delete().not("discord_id", "is", null);
  if (idsActifs.length) {
    delQuery = delQuery.not("discord_id", "in", `(${idsActifs.map((i) => `"${i}"`).join(",")})`);
  }
  await delQuery;

  return new Response(JSON.stringify({ synchronises: events.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
