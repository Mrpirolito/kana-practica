@echo off
title KanaDojo (cierra esta ventana para apagarlo)
cd /d "%~dp0"
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000/es/kana"
npm run dev
