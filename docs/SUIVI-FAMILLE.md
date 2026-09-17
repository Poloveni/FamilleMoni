# L'espace membre et l'API du bot

Depuis le 17 septembre 2026, l'espace membre est **bâti autour de l'API REST
du bot Discord** [bot-moni-v3](https://github.com/poulpizar01/bot-moni-v3),
en lecture seule. Les tables miroir `bot_*` de Supabase ne sont plus lues.

| Panneau | Ce qu'il montre | Routes du bot |
|---|---|---|
| Ma semaine | mes ventes face à l'objectif, ma paie, mon rang, mon quota, mes cooldowns | `/quotas/:me`, `/quotas/pay/:me`, `/ventes/:me`, `/quotas/ranking`, `/cooldowns`, `/quotas/config` |
| Mon bilan | la carte du mois (image à poster), semaine par semaine | `/ventes`, `/quotas`, `/quotas/pay` avec `?week=` |
| La famille | ventes, classement, paie et bilan du groupe, sélecteur de semaine | `/ventes`, `/quotas`, `/quotas/ranking`, `/quotas/pay`, `/quotas/summary`, `/stocks` |
| Stocks | stock général, drogue à vendre, coffres, historique, courbe d'argent sale | `/stocks`, `/stocks/items`, `/stocks/channels`, `/stocks/:id`, `/stocks/history` |
| Armurerie | armes, munitions, ventes de munitions | `/armurerie*` |
| Braquages | créneaux de la semaine glissante, mes cooldowns, labos | `/braquages`, `/cooldowns`, `/labos` |
| Taxes | rôle taxes / admin uniquement | `/taxes*` |
| Profil, Planning, Galerie, Hiérarchie | données propres du site | Supabase, inchangé |

Code : `em-core.js` (socle), `em-bot.js` (bot), `em-site.js` (site),
`em-charts.js` (graphiques), `espace-membre.css` (styles propres à la page).
Toute la gestion reste sur Discord.

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

**Applique aussi les deux correctifs** de `docs/bot-moni-v3-correctifs/`
(voir plus bas), dans l'ordre : le premier corrige deux points de sécurité de
l'API et ajoute les objectifs, le second ajoute braquages, cooldowns, labos,
la configuration des items et les noms des membres. Sans eux, l'espace membre
fonctionne mais affiche « pas encore exposé par ce bot » aux endroits
concernés.

```bash
cd bot-moni-v3
git am /chemin/vers/0001-*.patch /chemin/vers/0002-*.patch
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

## Parcours d'un membre : la connexion par le bot

Depuis le 17 septembre au soir, **la connexion au site passe par le bot** :
un seul écran Discord (application Moni V3) ouvre la session du site et la
liaison au bot. L'application « Oil Roxwood Logs » (fournisseur Discord de
Supabase) ne sert plus qu'en secours.

1. Écran de connexion → **Se connecter avec Discord**. Le bouton pointe vers
   `<API_BASE_URL>/auth/login?guild=<ID>` (adresse fournie par la passerelle,
   action `config`).
2. Discord → retour sur `suivi-connexion.html#token=…`, fragment effacé
   aussitôt.
3. Pas de session du site → action `login` : la passerelle vérifie le jeton
   auprès du bot (`/api/me`), retrouve le compte du site portant cet
   identifiant Discord (identité OAuth historique ou `app_metadata.discord_id`),
   ou le crée (adresse technique `pseudo.<id>@bot.famillemoni.com`, en
   attente de validation comme toute inscription), range le jeton du bot,
   puis renvoie un lien magique à usage unique que la page échange contre
   une session Supabase (`verifyOtp`). Aucun mail n'est envoyé.
4. Session déjà ouverte → action `link`, comme avant : le jeton est vérifié
   (même compte Discord, même serveur) et rangé.

Le jeton du bot dure **7 jours** ; ensuite les panneaux affichent « Me
reconnecter au bot » : même bouton, même écran. La session du site, elle,
tient plusieurs semaines.

**Secours** : le bloc « Connexion par e-mail » (replié) reste disponible pour
l'administratrice et les comptes historiques. Si la passerelle ne répond pas
ou n'est pas configurée, il s'ouvre tout seul avec, en plus, l'ancienne
connexion Discord classique.

**Comptes historiques** : ceux qui s'étaient connectés via Discord sont
retrouvés automatiquement. Un compte créé par e-mail sans Discord se connecte
une dernière fois par e-mail puis lie le bot depuis un panneau : à partir de
là, la connexion par le bot le retrouve aussi.

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

## Les correctifs du bot (`docs/bot-moni-v3-correctifs/`)

### 0002 — braquages, cooldowns, labos, items, noms

- `GET /api/braquages` : plafonds de la semaine glissante (7 j), consommé,
  restant, prochain créneau libre — même calcul que `checkBraquageLimit`.
- `GET /api/cooldowns` (les siens), `/api/cooldowns/:userId` (soi-même ou admin).
- `GET /api/labos` : disponibilité de chaque labo actif et heure de fin.
- `GET /api/stocks/items` : configuration des items (groupe, vendable PNJ,
  visible, lien labo, multiplicateur) — sans elle, impossible de distinguer
  la drogue du matériel dans `/api/stocks`.
- `GET /api/users` : liste (userId, pseudo, nom en jeu) renvoyée à tout
  membre. Les routes de groupe exposent déjà les `userId` de chacun, comme le
  classement sur Discord montre les noms ; cacher les pseudos ne protégeait
  rien et rendait ces vues illisibles. Rien d'autre n'est ajouté.

**Après l'ajout de ces routes, redéployer la fonction** `bot-suivi` (sa
liste blanche les connaît déjà, mais la version en ligne doit être à jour) :
`npx -y supabase@latest functions deploy bot-suivi --no-verify-jwt --project-ref prwdtdmdkhzwfyivaepw`.

### 0001 — sécurité et objectifs

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
| « Ton compte du site n'est pas relié à Discord » | Compte email/mot de passe : se connecter par le bot une fois (ou lier depuis un panneau) |
| Après connexion par le bot, « Compte en attente de validation » | Nouveau compte créé par le bot : à approuver dans le panel admin (il apparaît avec son pseudo Discord si `migrations/comptes-details.sql` a été rejoué) |
| Onglet Taxes absent alors que le rôle est donné | Sans le correctif 0001 du bot, il faut se reconnecter au bot (les rôles étaient figés dans le jeton) |
| « pas encore exposé par ce bot » (braquages, cooldowns, labos, drogue à vendre) | Correctif 0002 pas appliqué, ou fonction `bot-suivi` pas redéployée |
| Les membres apparaissent comme « Membre …1234 » | Correctif 0002 pas appliqué (`/api/users` ne renvoyait que soi-même) |
