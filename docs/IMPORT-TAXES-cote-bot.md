# Import de taxes — ce qu'il reste à faire côté bot

> Ce fichier décrit la partie à implémenter **dans le dépôt du bot**, pas ici.
> La partie site est terminée : elle lit le fichier Excel, valide chaque ligne
> et dépose les lignes valides dans la table `import_taxes` de Supabase.

## Pourquoi ce montage

Le site est **100 % statique** (GitHub Pages) : il n'a aucun serveur, et son
JavaScript est lisible par n'importe qui avec F12. Il ne peut donc **pas**
détenir de clé secrète ni appeler directement le bot.

Plutôt que d'exposer le VPS sur internet (sous-domaine, TLS, reverse proxy,
port ouvert), on passe par une **boîte aux lettres** dans Supabase, avec qui
le bot parle déjà. Le bot reste en sortie uniquement : **rien à ouvrir sur
le VPS**.

```
Navigateur de la Donna          Supabase                    Bot (VPS)
──────────────────────          ────────                    ─────────
 lit le .xlsx (SheetJS)
 valide chaque ligne
 dépose la demande      ──►  table import_taxes
                              (statut = en_attente)
                                     │
                                     └── Realtime ────────►  reçoit en <1 s
                                                             revalide
                                                             database.addTaxe()
                                                             refresh #taxes
                              table import_taxes  ◄────────  écrit le rapport
                              (statut = traite)
 affiche le rapport     ◄──  Realtime
```

## Prérequis

Exécuter `import-taxes.sql` (à la racine du dépôt du site) dans
Supabase → SQL Editor. Il crée `import_taxes` et `bot_taxes_types`.

## Ce que le bot reçoit

Une ligne de `import_taxes` :

```json
{
  "id": "uuid",
  "cree_par": "uuid de l'admin",
  "fichier": "taxes-juillet.xlsx",
  "statut": "en_attente",
  "lignes": [
    { "ligne": 2, "nom": "Les Ballas",   "type": "roxwood",   "jours": 7,  "telephone": "555-0142", "mot_de_passe": "moni2026" },
    { "ligne": 3, "nom": "Cartel Vagos", "type": "labo_hero", "jours": 14, "telephone": "",         "mot_de_passe": "" }
  ]
}
```

`ligne` est le **numéro de ligne dans le fichier Excel** (l'en-tête est la
ligne 1). Il sert uniquement à ce que le rapport soit compréhensible pour
l'admin : renvoie-le tel quel.

Le site a déjà écarté les lignes invalides — **revalide quand même**, comme
prévu : le site est du code client, il ne fait pas autorité.

## Ce que le bot doit écrire en retour

```json
{
  "statut": "traite",
  "traite_le": "2026-07-27T18:04:12.000Z",
  "rapport": [
    { "ligne": 2, "ok": true },
    { "ligne": 3, "ok": false, "raison": "un groupe de ce nom existe déjà" }
  ]
}
```

Mettre `statut: "erreur"` seulement si l'import a échoué **globalement**
(base inaccessible, exception non rattrapée). Une ligne refusée n'est pas
une erreur globale : elle se signale dans `rapport`.

## Squelette (à adapter à ton arborescence)

```js
// modules/import-taxes.js
const { createClient } = require('@supabase/supabase-js');
const database = require('../database');
const taxes = require('./taxes');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const TYPES = ['roxwood', 'labo_hero', 'sporex', 'vente', 'fertilisant'];

function valider(l) {
  if (!l || !String(l.nom || '').trim())      return 'nom du groupe vide';
  if (!TYPES.includes(l.type))                return `type « ${l.type} » inconnu`;
  const j = Number(l.jours);
  if (!Number.isInteger(j) || j <= 0)         return 'jours avant échéance invalide';
  return null;
}

async function traiter(demande, client) {
  const rapport = [];
  for (const l of demande.lignes || []) {
    const probleme = valider(l);
    if (probleme) { rapport.push({ ligne: l.ligne, ok: false, raison: probleme }); continue; }
    try {
      const echeance = new Date(Date.now() + l.jours * 86400000);
      await database.addTaxe({
        nom: String(l.nom).trim(),
        type: l.type,
        telephone: l.type === 'roxwood' ? (l.telephone || '') : '',
        echeance,
        mot_de_passe: l.mot_de_passe || '',
      });
      rapport.push({ ligne: l.ligne, ok: true });
    } catch (e) {
      rapport.push({ ligne: l.ligne, ok: false, raison: e.message });
    }
  }

  if (rapport.some(r => r.ok)) {
    try { await taxes.initPermanentMessage(client); }
    catch (e) { console.error('[import-taxes] refresh #taxes impossible :', e.message); }
  }

  await sb.from('import_taxes')
    .update({ statut: 'traite', traite_le: new Date().toISOString(), rapport })
    .eq('id', demande.id);

  console.log(`[import-taxes] ${demande.fichier} : ${rapport.filter(r => r.ok).length}/${rapport.length} créées`);
}

function demarrer(client) {
  // 1) Les demandes déposées pendant que le bot était éteint.
  sb.from('import_taxes').select('*').eq('statut', 'en_attente')
    .then(({ data }) => (data || []).forEach(d => traiter(d, client).catch(console.error)));

  // 2) Les nouvelles, en temps réel.
  sb.channel('import-taxes')
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'import_taxes' },
        ({ new: d }) => traiter(d, client).catch(async (e) => {
          console.error('[import-taxes] échec global :', e);
          await sb.from('import_taxes')
            .update({ statut: 'erreur', traite_le: new Date().toISOString(),
                      rapport: [{ ligne: 0, ok: false, raison: e.message }] })
            .eq('id', d.id);
        }))
    .subscribe();
}

module.exports = { demarrer };
```

Puis, une fois le client Discord prêt (`ready`) :

```js
require('./modules/import-taxes').demarrer(client);
```

## Deux points à ne pas oublier

**`echeance`** : le site envoie un **nombre de jours**, pas une date — c'est
ce que demande le fichier Excel. La conversion en date se fait côté bot, avec
son propre fuseau. Vérifie que le format attendu par `database.addTaxe`
correspond (objet `Date`, timestamp, ou chaîne ISO).

**La liste des types** : le bot est la source de vérité. Pour que le site
valide sans recopier la liste, publie-la à chaque synchronisation :

```js
await sb.from('bot_taxes_types').upsert(
  Object.entries(TYPE_LABELS).map(([type, label], i) => ({ type, label, ordre: (i + 1) * 10 }))
);
```

Sans ça, la table garde les 5 valeurs de départ insérées par le SQL — ça
fonctionne, mais tu auras deux listes à maintenir le jour où tu ajoutes un
type.

## Vérifier que ça marche

1. Dans l'espace membre → onglet **Taxes**, choisis un fichier `.xlsx`.
2. L'aperçu s'affiche **sans rien envoyer** : vérifie les lignes rejetées.
3. Clique sur **Importer**. La demande part.
4. Le rapport du bot doit apparaître **en moins d'une seconde**.
   S'il ne vient pas, le site le dit au bout d'une minute, et la demande
   reste en attente : le bot la traitera à son prochain démarrage.
5. Les taxes créées apparaissent dans le tableau du dessus à la prochaine
   synchronisation (5 min maximum).

Pour rejouer une demande à la main :

```sql
update public.import_taxes set statut = 'en_attente', rapport = null where id = '…';
```
