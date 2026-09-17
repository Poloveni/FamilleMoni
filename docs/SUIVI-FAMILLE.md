# Suivi de la famille — brancher l'espace membre sur l'API du bot

La rubrique **Suivi de la famille** de l'espace membre affiche, en lecture
seule, ce que calcule le bot Discord
[bot-moni-v3](https://github.com/poulpizar01/bot-moni-v3) : stocks, coffres,
historique, quotas, paie, classement, ventes, armurerie, munitions et (pour le
rôle taxes / les admins) les taxes. Toute la gestion reste sur Discord.

## Comment ça circule

```
Navigateur du membre           Supabase (backend du site)            Bot (VPS)
────────────────────           ──────────────────────────            ─────────
espace-membre.html
  └─ suivi-famille.js  ──POST──►  Edge Function bot-suivi  ──GET──►  /api/... (Bearer <jwt bot>)
        (JWT Supabase              • vérifie la session du site
         du membre)                • vérifie comptes.approuve + acces
                                   • prend le jeton du bot dans
                                     la table bot_sessions
                                   • ne relaie que des GET connus
suivi-connexion.html  ──POST──►  action « link » : vérifie via /api/me que le jeton
  (#token=… effacé                 est bien celui du membre (même Discord, même
   aussitôt de l'URL)              serveur), puis le range côté serveur
```

- Le **jeton du bot n'est jamais stocké dans le navigateur** (ni localStorage,
  ni cookie). Il ne fait que transiter par la page de retour.
- Le navigateur **ne parle jamais au bot** : CORS côté bot n'entre pas en jeu
  pour la lecture (l'Edge Function appelle sans en-tête `Origin`).
- L'Edge Function refuse tout ce qui n'est pas dans sa liste de routes GET.
  Aucune écriture n'est possible, même en bidouillant le JavaScript.

## 1. Côté bot (VPS) — activer l'API REST

Dans le `.env` du bot (voir `.env.example` du bot) :

```env
API_PORT=3001
API_BASE_URL=https://api.famillemoni.com        # URL PUBLIQUE de l'API, sans slash final
DISCORD_CLIENT_SECRET=<Developer Portal > OAuth2 > Client Secret>
API_JWT_SECRET=<longue chaîne aléatoire, ex. : openssl rand -hex 48>
```

`API_BASE_URL` doit être joignable en **HTTPS depuis Internet** (Supabase
appelle le bot depuis ses serveurs). Le bot écoute en HTTP sur `API_PORT` :
mets un reverse proxy TLS devant. Exemple avec Caddy (certificat automatique) :

```caddyfile
api.famillemoni.com {
    reverse_proxy 127.0.0.1:3001
}
```

Ou nginx + certbot :

```nginx
server {
    listen 443 ssl http2;
    server_name api.famillemoni.com;
    ssl_certificate     /etc/letsencrypt/live/api.famillemoni.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.famillemoni.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

N'ouvre que 443 dans le pare-feu ; le port 3001 reste local. Puis
`git pull && npm install && npx prisma migrate deploy && npm run build && sudo systemctl restart bot-moni-v3.service`
(ou `docker compose up -d --build`). Dans les logs :
`✅ API REST en écoute sur le port 3001`.

**Applique aussi le correctif** `docs/bot-moni-v3-correctifs/0001-*.patch`
(voir plus bas) avant de mettre en production : il corrige deux points de
sécurité de l'API et ajoute la route dont le site se sert pour afficher les
objectifs.

```bash
cd bot-moni-v3
git am /chemin/vers/0001-API-r-les-rev-rifi-s-chaque-requ-te-historique-des-c.patch
npm run typecheck
```

## 2. Discord Developer Portal

Application du bot → **OAuth2** → **Redirects** → ajouter exactement :

```
https://api.famillemoni.com/auth/callback
```

(c'est `<API_BASE_URL>/auth/callback`, au caractère près).

## 3. Sur Discord — déclarer le site (une fois, par un administrateur)

```
/config site-externe set url:https://famillemoni.com/suivi-connexion.html
```

C'est **l'URL exacte de la page de retour** du site (le bot y renvoie le
navigateur avec `#token=…`). L'origine CORS `https://famillemoni.com` en est
dérivée automatiquement. `/config site-externe list` pour vérifier.

Si le rôle « taxes » doit voir l'onglet Taxes du site :
`/config role set cible:taxes role:@Gérants` (les admins l'ont d'office).

## 4. Côté Supabase

1. **SQL Editor** → coller `migrations/bot-sessions.sql` → **Run**.
2. **Edge Functions** → **Secrets** :
   - `BOT_API_URL` = `https://api.famillemoni.com` (même valeur que
     `API_BASE_URL` du bot)
   - `BOT_GUILD_ID` = identifiant du serveur Discord Famille Moni
     (clic droit sur le serveur → *Copier l'identifiant du serveur*). Le
     serveur principal référencé par le site public est `1450234264305008693`
     — à confirmer, c'est celui sur lequel le bot est invité qui compte.
     Si ce secret manque, la fonction utilise `DISCORD_GUILD_ID`, déjà posé
     pour le bot de présences.
3. Déployer la fonction depuis le dossier du site :

   ```bash
   supabase functions deploy bot-suivi --no-verify-jwt --project-ref prwdtdmdkhzwfyivaepw
   ```

   `--no-verify-jwt` est voulu : la fonction vérifie elle-même la session du
   membre (`auth.getUser`) ; la vérification de la passerelle refuserait la
   clé « publishable » du site, qui n'est pas un JWT.

Aucun secret du bot (`API_JWT_SECRET`, `DISCORD_CLIENT_SECRET`, token du
bot) ne quitte le VPS. Supabase ne connaît que l'URL publique et l'ID de
guilde.

## 5. Publier le site

`publier.bat` (ou `git push`). Fichiers concernés : `espace-membre.html`,
`suivi-famille.js`, `suivi-connexion.html`, `moni-theme-dash.css`.

## Parcours d'un membre

1. Espace membre → **Suivi de la famille** → « Connecter mon compte Discord au bot ».
2. Redirection vers `<API_BASE_URL>/auth/login?guild=<ID>` → Discord → retour
   sur `suivi-connexion.html#token=…`.
3. La page efface le fragment, envoie le jeton à `bot-suivi` (action `link`),
   qui vérifie auprès du bot (`/api/me`) que l'identifiant Discord est celui
   relié au compte du site et que la guilde est la bonne, puis le range.
4. Retour automatique sur l'espace membre, rubrique ouverte.

Le jeton du bot dure **7 jours** ; ensuite la rubrique affiche « Me
reconnecter au bot ». « Délier » efface le jeton côté serveur.

**Prérequis pour le membre** : compte du site connecté **via Discord** (sinon
le site ne peut pas prouver que le jeton du bot est le sien : message
explicite), approuvé, en accès complet.

## Qui voit quoi

| Donnée | Membre | Admin Discord | Rôle taxes |
|---|---|---|---|
| Stock général, historique, coffres normaux | ✔ | ✔ | ✔ |
| Coffres administrateurs (contenu et mouvements) | ✖ (403) | ✔ | ✖ |
| Mon quota, ma paie, mes ventes | soi-même | tout le monde | soi-même |
| Classement, paie du groupe, bilan, ventes du groupe | ✔ (données de groupe, comme sur Discord) | ✔ | ✔ |
| Armurerie, munitions | ✔ | ✔ | ✔ |
| Taxes (liste, détail avec téléphone / mot de passe) | ✖ | ✔ | ✔ |

Ces règles sont celles du bot ; le site n'en ajoute qu'une, la sienne :
compte approuvé en accès complet. Un onglet masqué n'est jamais la seule
barrière — la requête correspondante est refusée par le bot.

## Le correctif du bot (`docs/bot-moni-v3-correctifs/`)

Un seul commit, trois changements, tous dans `src/api/` (+ une signature dans
`src/db.ts`) :

1. **Rôles revérifiés à chaque requête.** Le JWT du bot embarque `isAdmin`
   et `isTaxes` calculés au login et valables 7 jours : un membre à qui l'on
   retirait un rôle (ou expulsé du serveur) gardait ses accès jusqu'à
   l'expiration. `requireAuth(client)` re-résout désormais l'appartenance et
   les rôles via le cache membres du bot (intent `GuildMembers` déjà actif) ;
   le token ne prouve plus que l'identité. `/api/me` reflète les droits du
   moment, ce dont le site se sert pour afficher ou non l'onglet Taxes.
2. **Historique des coffres admin.** `GET /api/stocks/history` renvoyait les
   mouvements des coffres admin à tout membre (avec `?channelId=` ou sans
   filtre), alors que `/channels` et `/:channelId` les lui cachent. Même règle
   partout maintenant : exclus de la liste, 403 si demandés explicitement.
3. **`GET /api/quotas/config?week=`** : plage `[since, until)` résolue,
   objectifs (`/config quota`), taux (`/config salaire`, `/config classement`)
   actuels, libellés des activités. Sans elle, l'API ne permettait pas
   d'afficher une progression ni d'expliquer une paie. Sans le correctif, le
   site fonctionne quand même : il écrit « objectif non exposé par ce bot ».

Vérifié en local sur un Postgres de test avec les vraies routes (voir la
section « Vérifications » du compte rendu de livraison) : un token signé
`isAdmin: true` pour un simple membre est bien rétrogradé ; un membre qui
demande l'historique d'un coffre admin reçoit 403 ; l'historique global d'un
membre ne contient plus les lignes des coffres admin.

## Dépannage

| Symptôme dans la rubrique | Cause probable |
|---|---|
| « La liaison avec le bot n'est pas encore configurée » | Secrets `BOT_API_URL` / `BOT_GUILD_ID` absents |
| « La passerelle bot-suivi n'est pas déployée » | `supabase functions deploy bot-suivi` pas fait |
| « Bot indisponible » | API du bot arrêtée, `API_PORT` non défini, ou HTTPS/proxy cassé |
| Discord renvoie une erreur `redirect_uri` | L'URI `<API_BASE_URL>/auth/callback` manque dans le Developer Portal |
| Page bot « Aucun site externe configuré » | `/config site-externe set` pas fait pour cette guilde |
| « Le compte Discord utilisé chez le bot n'est pas celui relié à ton compte du site » | Le membre s'est connecté sur Discord (navigateur) avec un autre compte |
| « Ton compte du site n'est pas relié à Discord » | Compte email/mot de passe : se reconnecter avec le bouton Discord |
| Onglet Taxes absent alors que le rôle est donné | Sans le correctif du bot, il faut se reconnecter au bot (les rôles étaient figés dans le jeton) |
