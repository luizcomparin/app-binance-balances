@echo off
rem Sobe o server e abre a página no navegador. Fechar esta janela desliga o server.
cd /d "%~dp0"
title Binance Balances

if not exist .env (
  echo Arquivo .env nao encontrado. Copie o .env.example para .env e preencha a PORT.
  pause
  exit /b 1
)

rem pega só a PORT do .env
for /f "tokens=1,* delims==" %%a in ('findstr /b "PORT=" .env') do set PORT=%%b

rem abre o navegador depois de 2s, enquanto o server sobe
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/site"

npm start
pause
