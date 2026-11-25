@echo off
rem Sobe o server; a URL do site aparece no terminal quando ele termina de carregar. Fechar esta janela desliga o server.
cd /d "%~dp0"
title Binance Balances

if not exist .env (
  echo Arquivo .env nao encontrado. Copie o .env.example para .env e preencha a PORT.
  pause
  exit /b 1
)

npm start
pause
