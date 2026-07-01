// ════════════════════════════════════════════════════════════
//  Fonction Edge Supabase — sync-discord-events
//  Ne garde QUE les messages d'annonce d'événement (avec une date ET une heure)
//  et les recopie dans la table "evenements". Les messages de discussion sont ignorés.
//
//  Secrets (Edge Functions → Secrets) :
//    DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID
//  (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.)
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
const NB_MAX = 6; // nombre d'événements affichés (les plus récents)

// Retire mentions, salons, emojis custom et markdown.
function clean(s: string): string {
  return (s || "")
    .replace(/<a?:\w+:\d+>/g, "")     // emojis personnalisés
    .replace(/<@[&!]?\d+>/g, "")       // @mentions (membres / rôles)
    .replace(/<#\d+>/g, "")            // #salons
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // titres markdown (# ...)
    .replace(/\*\*?|__|`/g, "")        // markdown gras / souligné
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Rassemble le texte du message + des embeds (annonces de bots).
function fullText(msg: any): string {
  const parts: string[] = [msg.content || ""];
  for (const e of (msg.embeds || [])) {
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    for (const f of (e.fields || [])) parts.push(`${f.name}: ${f.value}`);
  }
  return parts.join("\n");
}

function findDate(text: string) {
  let m = text.match(/(\d{1,2})\/(\d{1,2})/); // JJ/MM
  if (m) return { jour: m[1].padStart(2, "0"), moisNum: parseInt(m[2], 10) };
  m = text.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/i);
  if (m) {
    const mn = MOIS_FR[m[2].toLowerCase()];
    if (mn) return { jour: m[1].padStart(2, "0"), moisNum: mn };
  }
  return null;
}

function findTime(text: string): string | null {
  const m = text.match(/(\d{1,2})\s*[hH]\s*(\d{2})?/); // 21h00 / 22H30 / 21 h
  if (!m) return null;
  return `${parseInt(m[1], 10)}h${m[2] ?? "00"}`;
}

function findTitle(text: string): string {
  const t = text.match(/Titre\s*:?\s*([^\n]+)/i);
  if (t) return clean(t[1]);
  // sinon : 1ʳᵉ ligne non vide, nettoyée des symboles/date/heure
  const first = clean((text.split("\n").map((l) => l.trim()).filter(Boolean)[0]) || "");
  return first
    .replace(/[📢⚠️📅🗓️🎭🕒👥📞ℹ️💬📌🎯•→\-–—]/g, " ")
    .replace(/\d{1,2}\/\d{1,2}/g, "")
    .replace(/\d{1,2}\s*[hH]\d{0,2}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\s+(à|a|le|la|du|de|pour)$/i, "") // enlève un mot de liaison en trop à la fin
    .trim();
}

function detectType(text: string): string | null {
  if (/recrut/i.test(text)) return "Recrutement";
  if (/soir[ée]e|\bbar\b|\bbal\b|f[êe]te/i.test(text)) return "Social";
  return "RP";
}

// Transforme un message en événement, ou null si ce n'est pas une annonce.
function toEvent(msg: any) {
  const text = fullText(msg);
  const date = findDate(text);
  const heure = findTime(text);
  if (!date || !heure) return null; // pas de date + heure → ce n'est pas un événement

  const titre = (findTitle(text) || "Événement").slice(0, 90);
  const texte = clean(text.replace(/\n/g, " ")).slice(0, 220);

  return {
    discord_id: msg.id,
    jour: date.jour,
    mois: MOIS[date.moisNum - 1],
    heure,
    titre,
    texte,
    type: detectType(text),
    ordre: date.moisNum * 100 + parseInt(date.jour, 10),
  };
}

Deno.serve(async () => {
  if (!DISCORD_TOKEN || !CHANNEL_ID) {
    return new Response("Secrets Discord manquants (DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID).", { status: 500 });
  }

  // 1) Récupérer les 100 derniers messages du salon
  const res = await fetch(
    `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=100`,
    { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    return new Response(`Erreur Discord ${res.status}: ${body}`, { status: 500 });
  }
  const messages = await res.json();

  // 2) Ne garder que les annonces d'événement, puis les 6 plus récentes
  const events = (messages as any[])
    .map(toEvent)
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .slice(0, NB_MAX);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // 3) Enregistrer (upsert par discord_id → pas de doublon)
  if (events.length) {
    const { error } = await sb.from("evenements").upsert(events, { onConflict: "discord_id" });
    if (error) return new Response(`Erreur base: ${error.message}`, { status: 500 });
  }

  // 4) Nettoyer : retirer les anciens événements Discord qui ne sont plus dans la liste
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
