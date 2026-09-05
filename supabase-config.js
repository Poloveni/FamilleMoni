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
  { nom: 'Braccio Destro', color: '#e35d4c', desc: 'Bras Droit — Co-Lead' },
  { nom: 'Consigliere',    color: '#d08a3f', desc: 'Conseiller — Capitaines' },
  { nom: 'Anziani',        color: '#c07a2b', desc: 'Aînés — Lieutenants' },
  { nom: 'Baroni',         color: '#96b854', desc: 'Barons — Gérants drogue, armes, blanchiment, opérations, événements…' },
  { nom: 'Fedeli',         color: '#96b854', desc: 'Fidèle — Gradé' },
  { nom: 'Vicino',         color: '#9a9a9a', desc: 'Proches' },
  { nom: 'Sicario',        color: '#8e8e8e', desc: 'Hommes de main — Membres confirmés' },
  { nom: 'Associati',      color: '#8e8e8e', desc: 'Associés — Membres' }
];

// Liste officielle des membres (nom -> rang). — Mise à jour 05/09/2026
// Source : aperçu des membres du bot Discord (12 membres).
//
// ⚠ Depuis le 05/09/2026, cette liste n'est plus que la valeur DE SECOURS :
//   la vraie liste vit dans Supabase (tables « hierarchie » et « rangs »,
//   voir hierarchie.sql) et se modifie depuis l'espace membre, panneau
//   « Hiérarchie ». Elle n'est lue ici que si la base ne répond pas.
//
// Changements du 05/09/2026 :
//   • Andréas Kyros et Michel Duboisie rejoignent la famille (Associati)
//   • James Mendoza, Oscar Santo, Tommy Dane, Valentino Romano et Valerio Moncini quittent la famille
//   • Javier Cruz Silva → Braccio Destro, Javier Silva → Fedeli, Gustavo Cardoso → Baroni
//
// Rappel : le bot affiche DEUX « Javier Silva ». Sur le site, celui dont
// l'identifiant Discord figure dans MONI_NOM_FIX ci-dessus s'appelle
// « Javier Cruz Silva » — sans quoi les deux se confondraient partout.
window.MONI_MEMBRES = [
  { nom: 'Lov Moni',          rang: 'La Donna' },
  { nom: 'Raymond Carter',    rang: 'Braccio Destro' },
  { nom: 'Javier Cruz Silva', rang: 'Braccio Destro' },
  { nom: 'Ezio Spallow',      rang: 'Anziani' },
  { nom: 'Gustavo Cardoso',   rang: 'Baroni' },
  { nom: 'Bass Carter',       rang: 'Fedeli' },
  { nom: 'Dayon Reas',        rang: 'Fedeli' },
  { nom: 'Javier Silva',      rang: 'Fedeli' },
  { nom: 'Andréas Kyros',     rang: 'Associati' },
  { nom: 'James Davis',       rang: 'Associati' },
  { nom: 'Michel Duboisie',   rang: 'Associati' },
  { nom: 'Tiago Rodrigues',   rang: 'Associati' },
];
