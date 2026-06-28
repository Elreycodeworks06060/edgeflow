@echo off
title EdgeFlow Platform
echo.
echo  ================================================
echo  EDGEFLOW PLATFORM - Starting up...
echo  ================================================
echo.
echo  [1/3] Starting Backend API...
start "EdgeFlow Backend" cmd /k "cd /d C:\Users\itsse\Desktop\edgeflow\backend && python -m uvicorn main:app --reload"
timeout /t 3 /nobreak > nul
echo  [2/3] Starting ngrok tunnel...
start "EdgeFlow ngrok" powershell -NoExit -Command "ngrok http 8000"
timeout /t 3 /nobreak > nul
echo  [3/3] Starting Frontend Dashboard...
start "EdgeFlow Frontend" cmd /k "cd /d C:\Users\itsse\Desktop\edgeflow\frontend\edgeflow-dashboard && npm run dev"
timeout /t 3 /nobreak > nul
echo.
echo  ================================================
echo  EdgeFlow is running!
echo  Dashboard:  http://localhost:5173
echo  API:        http://127.0.0.1:8000
echo  Public URL: https://agility-cloak-liqueur.ngrok-free.dev
echo  ================================================
echo.
start "" "http://localhost:5173"
pause
