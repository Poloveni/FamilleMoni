// ════════════════════════════════════════════════════════════
//  Fonction Edge Supabase — fivem-status
//  Relais public vers l'API FiveM (contourne le blocage CORS du navigateur).
//  Renvoie l'état du serveur : en ligne, joueurs connectés / max, nom, liste.
//  Le code cfx du serveur est configurable via la variable CFX_CODE
//  (sinon valeur par défaut ci-dessous).
// ════════════════════════════════════════════════════════════

const CFX = Deno.env.get("CFX_CODE") ?? "k4aqg7";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retire les codes couleur FiveM (^1, ^2, …) du nom du serveur
function stripColors(s: string): string {
  return (s || "").replace(/\^\d/g, "").trim();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const r = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${CFX}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FamilleMoni/1.0)",
        "Accept": "application/json",
      },
    });
    if (!r.ok) return json({ online: false, error: `http ${r.status}` });

    const d = await r.json();
    const D = (d && d.Data) || {};
    const vars = D.vars || {};
    const maxclients = Number(D.sv_maxclients ?? D.svMaxclients ?? vars.sv_maxClients ?? 0) || 0;
    const players = Array.isArray(D.players) ? D.players.map((p: any) => p.name).filter(Boolean) : [];

    return json({
      online: true,
      hostname: stripColors(D.hostname || ""),
      clients: Number(D.clients ?? players.length ?? 0) || 0,
      maxclients,
      players,
      updated: new Date().toISOString(),
    });
  } catch (e) {
    return json({ online: false, error: String(e) });
  }
});
