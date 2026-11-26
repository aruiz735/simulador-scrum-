@echo off
chcp 65001 > nul
title UNAB Simulador Scrum Live Multijugador
echo ======================================================================
echo    UNIVERSIDAD AUTÓNOMA DE BUCARAMANGA (UNAB)
echo    SIMULADOR MULTIJUGADOR EN TIEMPO REAL - PSM I / SCRUM 2020
echo ======================================================================
echo.
echo Iniciando el Simulador en tu navegador web predeterminado...
echo.
start "" "%~dp0index.html"
echo [OK] Simulador abierto con éxito.
echo.
echo - Para proyectar en el salón: Abre "Iniciar como Moderador (Host)"
echo - Para probar desde otra pestaña: Abre "Unirse como Participante (Player)"
echo.
pause
