// ── Configuration Supabase — Famille Moni ──
// La clé "publishable" est conçue pour être publique : elle est protégée
// côté serveur par les règles de sécurité (RLS) définies dans migrations/supabase-schema.sql.
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

// Liste officielle des membres (nom -> rang). — Mise à jour 18/09/2026
// Source : aperçu des membres du bot Discord (15 membres).
//
// ⚠ Depuis le 05/09/2026, cette liste n'est plus que la valeur DE SECOURS :
//   la vraie liste vit dans Supabase (tables « hierarchie » et « rangs »,
//   voir migrations/hierarchie.sql) et se modifie depuis l'espace membre, panneau
//   « Hiérarchie ». Elle n'est lue ici que si la base ne répond pas — et par
//   outils/generer-passeports.mjs pour créer les pages membre/.
//
// Changements du 18/09/2026 (migrations/hierarchie-2026-09-18.sql pour la base) :
//   • Kaleo Maranzano, Leandro Maranzano, Haziro Javez, Rocco Hawk, Vincenzo Moni
//     et Gustavo Madrazo rejoignent la famille (Associati)
//   • Gustavo Cardoso, James Davis et Michel Duboisie quittent la famille
//
// Rappel : le bot affiche DEUX « Javier Silva ». Sur le site, celui dont
// l'identifiant Discord figure dans MONI_NOM_FIX ci-dessus (le Braccio Destro)
// s'appelle « Javier Cruz Silva » — sans quoi les deux se confondraient partout.
window.MONI_MEMBRES = [
  { nom: 'Lov Moni',          rang: 'La Donna' },
  { nom: 'Raymond Carter',    rang: 'Braccio Destro' },
  { nom: 'Javier Cruz Silva', rang: 'Braccio Destro' },
  { nom: 'Ezio Spallow',      rang: 'Anziani' },
  { nom: 'Bass Carter',       rang: 'Fedeli' },
  { nom: 'Dayon Reas',        rang: 'Fedeli' },
  { nom: 'Javier Silva',      rang: 'Fedeli' },
  { nom: 'Andréas Kyros',     rang: 'Associati' },
  { nom: 'Gustavo Madrazo',   rang: 'Associati' },
  { nom: 'Haziro Javez',      rang: 'Associati' },
  { nom: 'Kaleo Maranzano',   rang: 'Associati' },
  { nom: 'Leandro Maranzano', rang: 'Associati' },
  { nom: 'Rocco Hawk',        rang: 'Associati' },
  { nom: 'Tiago Rodrigues',   rang: 'Associati' },
  { nom: 'Vincenzo Moni',     rang: 'Associati' },
];
