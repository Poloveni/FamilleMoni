@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Publication du site Famille Moni
echo ============================================
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
