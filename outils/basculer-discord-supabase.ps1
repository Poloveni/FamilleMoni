# ─────────────────────────────────────────────────────────────────────────────
#  Bascule le fournisseur Discord de Supabase (bouton « Se connecter avec
#  Discord » de l'espace membre) vers une autre application Discord — par
#  exemple Moni V3, l'application du bot, à la place d'« Oil Roxwood Logs ».
#
#  À lancer dans PowerShell :  .\outils\basculer-discord-supabase.ps1
#
#  Il te demande trois choses (rien n'est enregistré nulle part) :
#   1. un jeton d'accès Supabase : https://supabase.com/dashboard/account/tokens
#      → « Generate new token », n'importe quel nom, copie-le ;
#   2. le Client ID de l'application Discord (Developer Portal → OAuth2) ;
#   3. son Client Secret (même page — « Reset Secret » si tu ne l'as plus ;
#      si c'est l'application du bot, préviens le dev : il doit mettre la
#      même valeur dans DISCORD_CLIENT_SECRET du bot).
#
#  AVANT de lancer : dans le Developer Portal de cette application, OAuth2 →
#  Redirects, la ligne suivante doit exister, sinon Discord refusera :
#      https://prwdtdmdkhzwfyivaepw.supabase.co/auth/v1/callback
#
#  Les comptes existants ne sont pas touchés : Supabase relie un compte à
#  l'identifiant Discord de la personne, pas à l'application utilisée.
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
$projet = 'prwdtdmdkhzwfyivaepw'
$api = "https://api.supabase.com/v1/projects/$projet/config/auth"

function Lire-Secret($invite) {
  $s = Read-Host -Prompt $invite -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

Write-Host ''
Write-Host 'Bascule du fournisseur Discord de Supabase' -ForegroundColor Cyan
Write-Host '(projet famille-moni, ' $projet ')'
Write-Host ''
$jeton = Lire-Secret 'Jeton d''accès Supabase (dashboard → Account → Access Tokens)'
$clientId = (Read-Host -Prompt 'Client ID de l''application Discord').Trim()
$secret = Lire-Secret 'Client Secret de l''application Discord'

if (-not $jeton -or -not $clientId -or -not $secret) { Write-Host 'Une valeur manque, rien n''a été modifié.' -ForegroundColor Yellow; exit 1 }
if ($clientId -notmatch '^\d{17,20}$') { Write-Host "Le Client ID doit être un nombre de 17 à 20 chiffres (reçu : $clientId). Rien n'a été modifié." -ForegroundColor Yellow; exit 1 }

$entetes = @{ Authorization = "Bearer $jeton"; 'Content-Type' = 'application/json' }

# 1. État actuel, pour savoir d'où l'on part
try {
  $actuel = Invoke-RestMethod -Method Get -Uri $api -Headers $entetes
} catch {
  Write-Host "Impossible de lire la configuration : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Vérifie le jeton (il doit venir de https://supabase.com/dashboard/account/tokens).'
  exit 1
}
Write-Host ''
Write-Host ('Fournisseur Discord actuellement : ' + $(if ($actuel.external_discord_enabled) { 'activé' } else { 'désactivé' }) + ', Client ID ' + $actuel.external_discord_client_id)
if ($actuel.external_discord_client_id -eq $clientId) { Write-Host 'C''est déjà ce Client ID : seul le secret sera réécrit.' -ForegroundColor Yellow }

$confirm = Read-Host -Prompt "Remplacer par le Client ID $clientId ? (oui/non)"
if ($confirm -ne 'oui') { Write-Host 'Annulé, rien n''a été modifié.'; exit 0 }

# 2. Bascule
$corps = @{
  external_discord_enabled   = $true
  external_discord_client_id = $clientId
  external_discord_secret    = $secret
} | ConvertTo-Json

try {
  $res = Invoke-RestMethod -Method Patch -Uri $api -Headers $entetes -Body $corps
} catch {
  Write-Host "Échec de la mise à jour : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
$secret = $null; $jeton = $null

Write-Host ''
Write-Host ('Fait. Fournisseur Discord : Client ID ' + $res.external_discord_client_id + ', ' + $(if ($res.external_discord_enabled) { 'activé' } else { 'désactivé' })) -ForegroundColor Green
Write-Host ''
Write-Host 'Pour vérifier : espace membre → Déconnexion → « Se connecter avec Discord ».'
Write-Host 'L''écran d''autorisation doit maintenant porter le nom de la nouvelle application.'
