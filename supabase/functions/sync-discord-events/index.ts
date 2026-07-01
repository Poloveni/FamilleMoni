// ════════════════════════════════════════════════════════════
//  Fonction Edge Supabase — sync-discord-events
//  Recopie les messages d'un salon Discord dans la table "evenements".
//
//  Comportement :
//   • Chaque message (non vide) du salon devient un événement.
//   • 1ʳᵉ ligne = titre, lignes suivantes = description.
//   • Date/heure = date de publication du message (fuseau Europe/Paris).
//   • BONUS : si la 1ʳᵉ ligne commence par "JJ/MM HHhMM — Titre [Type]",
//     cette date/heure/type-là est utilisée à la place.
//
//  Secrets à définir dans Supabase (Edge Functions → Secrets) :
//    DISCORD_BOT_TOKEN   = le jeton du bot Discord
//    DISCORD_CHANNEL_ID  = l'identifiant du salon
//  (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.)
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MOIS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const TYPES_VALIDES = ["Important", "Social", "RP", "Recrutement"];

// Date/heure locales (Europe/Paris) à partir d'un ISO Discord.
function partsParis(iso: string) {
  const p = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => (p.find((x) => x.type === t)?.value ?? "");
  return { jour: g("day"), moisNum: parseInt(g("month"), 10), heure: `${parseInt(g("hour"), 10)}h${g("minute")}` };
}

// Essaie le format structuré :  JJ/MM  HHhMM  —  Titre  [Type]
function parseStructured(firstLine: string) {
  const m = firstLine.match(
    /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2})h(\d{2})?\s*[—–-]\s*(.+?)(?:\s*\[([^\]]+)\])?$/,
  );
  if (!m) return null;
  const [, jj, mm, hh, min, titre, typeRaw] = m;
  const moisIdx = Math.min(12, Math.max(1, parseInt(mm, 10))) - 1;
  let type: string | null = null;
  if (typeRaw) {
    const t = typeRaw.trim();
    type = TYPES_VALIDES.find((x) => x.toLowerCase() === t.toLowerCase()) ?? t;
  }
  return {
    jour: jj.padStart(2, "0"),
    mois: MOIS[moisIdx],
    heure: `${parseInt(hh, 10)}h${min ?? "00"}`,
    titre: titre.trim(),
    type,
    ordre: parseInt(mm, 10) * 100 + parseInt(jj, 10),
  };
}

// Transforme un message Discord en événement (ou null si vide).
function toEvent(msg: { id: string; content: string; timestamp: string }) {
  const content = (msg.content || "").trim();
  if (!content) return null; // on ignore les messages sans texte (images seules, etc.)
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

  const s = parseStructured(lines[0]);
  if (s) {
    return {
      discord_id: msg.id,
      jour: s.jour, mois: s.mois, heure: s.heure,
      titre: s.titre,
      texte: lines.slice(1).join(" "),
      type: s.type,
      ordre: s.ordre,
    };
  }

  // Sinon : message brut, daté par sa date de publication.
  const d = partsParis(msg.timestamp);
  return {
    discord_id: msg.id,
    jour: d.jour,
    mois: MOIS[d.moisNum - 1],
    heure: d.heure,
    titre: lines[0].slice(0, 90),
    texte: lines.slice(1).join(" "),
    type: null,
    ordre: d.moisNum * 100 + parseInt(d.jour, 10),
  };
}

Deno.serve(async () => {
  if (!DISCORD_TOKEN || !CHANNEL_ID) {
    return new Response("Secrets Discord manquants (DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID).", { status: 500 });
  }

  // 1) Récupérer les derniers messages du salon
  const res = await fetch(
    `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=50`,
    { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    return new Response(`Erreur Discord ${res.status}: ${body}`, { status: 500 });
  }
  const messages = await res.json();

  // 2) Transformer en événements
  const events = (messages as { id: string; content: string; timestamp: string }[])
    .map(toEvent)
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // 3) Enregistrer (upsert par discord_id → pas de doublon)
  if (events.length) {
    const { error } = await sb.from("evenements").upsert(events, { onConflict: "discord_id" });
    if (error) return new Response(`Erreur base: ${error.message}`, { status: 500 });
  }

  // 4) Nettoyer : supprimer les événements Discord dont le message n'existe plus
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
