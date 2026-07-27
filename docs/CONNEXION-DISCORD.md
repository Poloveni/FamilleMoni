# Activer la connexion Discord — guide pas à pas

> Sans cette configuration, le bouton « Se connecter avec Discord » affichera
> une erreur. Le reste du site continue de fonctionner normalement pendant ce
> temps : la connexion par email n'est pas supprimée.

Compte environ 15 minutes. Tu vas faire trois choses : créer une application
Discord, la déclarer dans Supabase, puis exécuter un fichier SQL.

---

## Étape 1 — Créer l'application Discord (5 min)

1. Va sur **https://discord.com/developers/applications**
2. Clique **New Application** en haut à droite.
3. Nom : `Famille Moni — Site`. Coche la case des conditions, **Create**.
4. Dans le menu de gauche, clique **OAuth2**.
5. Note le **CLIENT ID** affiché (une longue suite de chiffres).
6. Juste en dessous, **Client Secret** → **Reset Secret** → confirme.
   Copie la valeur affichée : **elle ne sera plus jamais visible.**
   Colle-la quelque part en attendant l'étape 2.

Ne ferme pas cette page, tu y reviens à l'étape 3.

---

## Étape 2 — Déclarer Discord dans Supabase (5 min)

1. Va sur **https://supabase.com/dashboard**, ouvre ton projet.
2. Menu de gauche → **Authentication** → **Providers** (ou *Sign In / Up*).
3. Trouve **Discord** dans la liste, clique dessus, active l'interrupteur.
4. Colle le **Client ID** et le **Client Secret** de l'étape 1.
5. Supabase affiche une **Callback URL** du type :
   `https://prwdtdmdkhzwfyivaepw.supabase.co/auth/v1/callback`
   **Copie-la**, tu en as besoin à l'étape 3.
6. **Save**.

Toujours dans Authentication, va dans **URL Configuration** et ajoute ces
deux adresses dans **Redirect URLs** :

```
https://poloveni.github.io/FamilleMoni/espace-membre.html
https://poloveni.github.io/FamilleMoni/**
```

Sans ça, Discord te renverra vers une page d'erreur après la connexion.

---

## Étape 3 — Autoriser le retour, côté Discord (2 min)

1. Retourne sur la page **OAuth2** de ton application Discord.
2. Section **Redirects** → **Add Redirect**.
3. Colle la **Callback URL de Supabase** copiée à l'étape 2
   (celle en `…supabase.co/auth/v1/callback`, pas celle de ton site).
4. **Save Changes** en bas de page.

---

## Étape 4 — Exécuter le SQL (2 min)

Dans Supabase → **SQL Editor** → **New query**, colle le contenu de
**`discord-admin.sql`** et clique **Run**.

Il crée la vérification des droits et ajoute la colonne `is_admin` si ton
bot ne l'a pas encore créée.

---

## Étape 5 — Publier et tester

1. Double-clique sur **`publier.bat`**.
2. Ouvre l'espace membre, `Ctrl + F5`.
3. Clique **Se connecter avec Discord**. Discord demande l'autorisation,
   tu acceptes, tu reviens sur le site connectée.
4. Onglet **Taxes** : le bloc d'import doit apparaître.

### Vérifier en détail

Sur l'espace membre connecté, ouvre la console (`F12` → *Console*) et tape :

```js
await sb.rpc('mon_discord_id')      // ton identifiant Discord
await sb.rpc('est_admin_discord')   // true si tu es admin sur le serveur
```

Si `mon_discord_id` renvoie `null` : tu t'es connectée par email, pas par
Discord. Déconnecte-toi et repasse par le bouton Discord.

Si `mon_discord_id` renvoie bien un identifiant mais `est_admin_discord`
renvoie `false` : ton identifiant n'est pas encore dans `bot_user_mapping`,
ou le bot n'a pas encore synchronisé. Vérifie avec :

```sql
select game_name, discord_id, is_admin from public.bot_user_mapping
 order by is_admin desc, game_name;
```

---

## Ce qui change pour tes membres

**Rien n'est cassé.** Les comptes email existants continuent de fonctionner.
Le bouton Discord s'ajoute, il ne remplace rien.

Mais **seule la connexion Discord permet au site de reconnaître les rôles**.
Un membre connecté par email n'aura jamais accès à l'import, même s'il est
administrateur sur Discord.

⚠️ **Un compte Discord et un compte email sont deux comptes différents** aux
yeux de Supabase, même avec la même adresse. Si tu t'es d'abord inscrite par
email puis que tu te connectes par Discord, tu obtiens un second compte, à
approuver de nouveau dans ton panneau admin. Prévois-le au moment où tes
membres basculeront.

---

## L'accès de secours

`discord-admin.sql` garde ton email `syne@live.fr` comme accès de secours à
l'import, pour éviter que tu te retrouves enfermée dehors pendant la bascule.

Quand tout le monde sera passé par Discord, ouvre `discord-admin.sql`,
trouve le bloc `peut_importer_taxes`, et remplace la liste d'emails par
`and false` :

```sql
  select public.est_admin_discord();
```

Puis relance le fichier. À partir de là, seul le rôle Discord compte.

---

## Le délai de 5 minutes

`is_admin` est recalculé par ton bot à chaque synchronisation. Si tu retires
le rôle admin à quelqu'un sur Discord, il peut garder l'accès jusqu'à
5 minutes. C'est le fonctionnement prévu.

Pour couper immédiatement, exécute dans Supabase :

```sql
update public.bot_user_mapping set is_admin = false where discord_id = '…';
```

L'effet est instantané — jusqu'à la prochaine synchronisation du bot, qui
remettra la valeur réelle lue sur Discord.
