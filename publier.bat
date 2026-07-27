@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Publication du site Famille Moni
echo ============================================
echo.

REM ── Generation des pages membres (une page par personnage) ──
REM Necessite Node.js. S'il n'est pas installe, on continue quand meme :
REM les pages deja generees restent en place, elles ne sont juste pas
REM mises a jour. Pour l'installer : https://nodejs.org (version LTS).
where node >nul 2>nul
if %errorlevel%==0 (
  echo Generation des pages membres...
  node outils\generer-passeports.mjs
  if %errorlevel% neq 0 (
    echo.
    echo ATTENTION : la generation des pages membres a echoue.
    echo Le reste du site sera publie normalement.
    echo.
  )
) else (
  echo Node.js non installe : les pages membres ne sont pas regenerees.
  echo   Pour les mettre a jour automatiquement, installe Node.js LTS
  echo   depuis https://nodejs.org puis relance ce fichier.
)
echo.

git add -A

REM Ne commit que s'il y a des changements
git diff --cached --quiet
if %errorlevel%==0 (
  echo Aucune modification a publier.
  echo.
  pause
  exit /b 0
)

git commit -m "Mise a jour du site - %date% %time%"
if %errorlevel% neq 0 (
  echo.
  echo ERREUR lors du commit. Verifiez Git.
  pause
  exit /b 1
)

echo.
echo Envoi vers GitHub...
git push
if %errorlevel% neq 0 (
  echo.
  echo ERREUR lors du push. Verifiez votre connexion / identifiants Git.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Termine ! Le site sera a jour dans ~1 min.
echo ============================================
echo.
pause
