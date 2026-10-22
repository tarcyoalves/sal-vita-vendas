@echo off
rem Instala (ou atualiza) o Vita Zap no Chrome do Windows. Duplo clique. Nao precisa de administrador.
rem Se o Atualizar-VitaZap.ps1 estiver ao lado deste arquivo usa ele; senao baixa a versao atual do site do CRM.
setlocal enabledelayedexpansion
set "PS1=%~dp0Atualizar-VitaZap.ps1"
if not exist "!PS1!" (
  set "PS1=%LOCALAPPDATA%\VitaZap\Atualizar-VitaZap.ps1"
  if not exist "%LOCALAPPDATA%\VitaZap" mkdir "%LOCALAPPDATA%\VitaZap"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://lembretes.salvitarn.com.br/vita-zap/Atualizar-VitaZap.ps1' -OutFile '!PS1!'"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "!PS1!"
endlocal
