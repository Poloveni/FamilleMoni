// ════════════════════════════════════════════════════════════
//  Fonction Edge Supabase — sync-discord-events
//  Lit les messages d'un salon Discord, les transforme en événements
//  et les enregistre dans la table "evenements".
//
//  Format attendu d'un message (1 message = 1 événement) :
//    05/07 21h00 — Réunion générale [Important]
//    Description libre sur les lignes suivantes...
//
//  Secrets à définir dans Supabase (Edge Functions → Secrets) :
//    DISCORD_BOT_TOKEN   = le jeton du bot Discord
//    DISCORD_CHANNEL_ID  = l'identifiant du salon d'annonces
//  (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.)
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MOIS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const TYPES_VALIDES = ["Important", "Social", "RP", "Recrutement"];

// Transforme un message Discord en événement, ou renvoie null si le format ne correspond pas.
function parseMessage(msg: { id: string; content: string }) {
  const lines = (msg.content || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  // 1ʳᵉ ligne :  JJ/MM  HHhMM  —  Titre  [Type]
  const m = lines[0].match(
    /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2})h(\d{2})?\s*[—–-]\s*(.+?)(?:\s*\[([^\]]+)\])?$/,
  );
  if (!m) return null;

  const [, jj, mm, hh, min, titre, typeRaw] = m;
  const moisIdx = Math.min(12, Math.max(1, parseInt(mm, 10))) - 1;

  // Type : on ne garde que les valeurs connues (sinon vide).
  let type: string | null = null;
  if (typeRaw) {
    const t = typeRaw.trim();
    const found = TYPES_VALIDES.find((x) => x.toLowerCase() === t.toLowerCase());
    type = found ?? t;
  }

  return {
    discord_id: msg.id,
    jour: jj.padStart(2, "0"),
    mois: MOIS[moisIdx],
    heure: `${parseInt(hh, 10)}h${min ?? "00"}`,
    titre: titre.trim(),
    texte: lines.slice(1).join(" "),
    type,
    // "ordre" pour trier chronologiquement (MMJJ)
    ordre: parseInt(mm, 10) * 100 + parseInt(jj, 10),
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

  // 2) Parser ceux qui suivent le format
  const events = (messages as { id: string; content: string }[])
    .map(parseMessage)
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // 3) Enregistrer (upsert par discord_id → pas de doublon)
  if (events.length) {
    const { error } = await sb.from("evenements").upsert(events, { onConflict: "discord_id" });
    if (error) return new Response(`Erreur base: ${error.message}`, { status: 500 });
  }

  // 4) Nettoyer : supprimer les événements Discord dont le message n'existe plus / ne matche plus
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
