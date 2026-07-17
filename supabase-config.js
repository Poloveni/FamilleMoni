// ── Configuration Supabase — Famille Moni ──
// La clé "publishable" est conçue pour être publique : elle est protégée
// côté serveur par les règles de sécurité (RLS) définies dans supabase-schema.sql.
window.SUPABASE_URL = 'https://prwdtdmdkhzwfyivaepw.supabase.co';
window.SUPABASE_KEY = 'sb_publishable_qgN4fRX9eVdKn3SWAjtmhw_F00rlqXz';

// Objectif hebdomadaire de ventes par membre (dashboard Business de l'espace membre).
window.MONI_QUOTA_DROGUE = 200;

// Corrections de noms par identifiant Discord (quand deux joueurs ont le même
// pseudo dans le bot). Clé = discord_id, valeur = nom à afficher sur le site.
window.MONI_NOM_FIX = {
  '1166846164155519000': 'Javier Cruz Silva'
};

// ══════════════════════════════════════════════════════════════════
//  SOURCE UNIQUE DE VÉRITÉ pour les membres et les rangs.
//  → Modifie UNIQUEMENT ce fichier pour ajouter/retirer un membre ou
//    changer un rang : la page d'accueil (cartes + organigramme +
//    compteur) et l'espace membre se mettent à jour automatiquement.
// ══════════════════════════════════════════════════════════════════

// Les rangs, du plus haut au plus bas, avec leur couleur d'affichage.
window.MONI_RANGS = [
  { nom: 'La Donna',       color: '#d4b26e', desc: 'Chef' },
  { nom: 'Braccio Destro', color: '#c0392b', desc: 'Bras Droit — Co-Lead' },
  { nom: 'Consigliere',    color: '#b5651d', desc: 'Conseiller — Capitaines' },
  { nom: 'Anziani',        color: '#c07a2b', desc: 'Aînés — Lieutenants' },
  { nom: 'Baroni',         color: '#5a7a2b', desc: 'Barons — Gérants drogue, armes, blanchiment, opérations, événements…' },
  { nom: 'Fedeli',         color: '#5a7a2b', desc: 'Fidèle — Gradé' },
  { nom: 'Vicino',         color: '#888888', desc: 'Proches' },
  { nom: 'Sicario',        color: '#777777', desc: 'Hommes de main — Membres confirmés' },
  { nom: 'Associati',      color: '#777777', desc: 'Associés — Membres' }
];

// Liste officielle des membres (nom -> rang). — Mise à jour 10/07/2026
window.MONI_MEMBRES = [
  { nom: 'Lov Moni',           rang: 'La Donna' },
  { nom: 'Raymond Carter',     rang: 'Braccio Destro' },
  { nom: 'Tony Moncini',       rang: 'Consigliere' },
  { nom: 'Ezio Spallow',       rang: 'Anziani' },
  { nom: 'Oscar Santo',        rang: 'Baroni' },
  { nom: 'James Mendoza',      rang: 'Fedeli' },
  { nom: 'Tommy Dane',         rang: 'Vicino' },
  { nom: 'Allesandro Moretti', rang: 'Associati' },
  { nom: 'Bass Carter',        rang: 'Associati' },
  { nom: 'Dayon Reas',         rang: 'Associati' },
  { nom: 'Javier Silva',       rang: 'Associati' },
  { nom: 'Javier Cruz Silva',  rang: 'Associati' },
  { nom: 'Soso Moni',          rang: 'Associati' }
];
