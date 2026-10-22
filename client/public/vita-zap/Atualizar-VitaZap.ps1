# Instalador e atualizador do Vita Zap para Windows (PowerShell 5.1, sem admin, sem dependências).
#
# 1ª vez (duplo clique em Instalar-VitaZap.cmd): baixa o zip do CRM, extrai em %LOCALAPPDATA%\VitaZap\extensao,
#   cria um atalho na pasta Inicializar (roda este script oculto a cada logon) e mostra a pasta que você escolhe
#   em chrome://extensions > "Carregar sem compactação".
# Depois (a cada logon, oculto): lê /vita-zap/versao.json e, SÓ se a versão do site for maior que a do
#   manifest.json local, baixa o zip, confere o ID da extensão e troca a pasta (extrai em extensao.novo e renomeia;
#   se algo falhar, a versão antiga continua no lugar). Sem rede = sai em silêncio. Log: atualizador.log.
# O Chrome relê a extensão ao reabrir; o botão de recarregar em chrome://extensions aplica na hora.
#
# Parâmetros: -Origem e -PastaInicializar (só para teste), -Pasta, -Silencioso (modo logon: sem janelas e sem
# mexer no atalho), -SemJanela (sem mensagens, mas age como execução manual).

param(
  [string]$Origem = 'https://lembretes.salvitarn.com.br',
  [string]$Pasta = '',
  [string]$PastaInicializar = '',
  [switch]$Silencioso,
  [switch]$SemJanela
)

$OrigemPadrao = 'https://lembretes.salvitarn.com.br'
$IdEsperado = 'anlifdaoagpcbdjpbflodkcialbdbghh'
$NomeAtalho = 'Vita Zap - atualizador.lnk'
$NomeScript = 'Atualizar-VitaZap.ps1'

# ---- funções puras (testáveis com dot-source) -----------------------------------------------------------------

function Converter-Versao([string]$Texto) {
  if ($Texto -match '^\d+(\.\d+){0,3}$') {
    $p = @($Texto.Split('.'))
    while ($p.Count -lt 4) { $p += '0' }
    return [version]($p -join '.')
  }
  return $null
}

# $true só se a versão nova for válida e MAIOR que a atual (versão atual inválida conta como 0).
function Versao-EhMaior([string]$Nova, [string]$Atual) {
  $n = Converter-Versao $Nova
  if ($null -eq $n) { return $false }
  $a = Converter-Versao $Atual
  if ($null -eq $a) { $a = [version]'0.0.0.0' }
  return ($n -gt $a)
}

# ID da extensão a partir da chave pública do manifest (SHA-256 da chave DER, 16 bytes, hex mapeado de a a p).
function Id-DaChave([string]$ChaveBase64) {
  $der = [Convert]::FromBase64String($ChaveBase64)
  $sha = [Security.Cryptography.SHA256]::Create()
  $h = $sha.ComputeHash($der)
  $sb = New-Object System.Text.StringBuilder
  for ($i = 0; $i -lt 16; $i++) {
    [void]$sb.Append([char](97 + ($h[$i] -shr 4)))
    [void]$sb.Append([char](97 + ($h[$i] -band 15)))
  }
  return $sb.ToString()
}

function Origem-Segura([string]$o) {
  return (($o -match '^https://[^/\s]+$') -or ($o -match '^http://(localhost|127\.0\.0\.1)(:\d+)?$'))
}

function Ler-Manifest([string]$Dir) {
  $f = Join-Path $Dir 'manifest.json'
  if (-not (Test-Path -LiteralPath $f)) { return $null }
  try { return (Get-Content -LiteralPath $f -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

# Nenhum arquivo do zip pode sair da pasta de destino.
function Zip-Seguro([string]$Zip) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $z = [IO.Compression.ZipFile]::OpenRead($Zip)
  try {
    foreach ($e in $z.Entries) {
      if ($e.FullName -match '(^|[\\/])\.\.([\\/]|$)' -or $e.FullName -match '^[\\/]' -or $e.FullName -match ':') { return $false }
    }
    return ($z.Entries.Count -gt 0)
  } finally { $z.Dispose() }
}

# Quando o arquivo é carregado com "." (dot-source) só as funções acima ficam disponíveis (testes).
if ($MyInvocation.InvocationName -eq '.') { return }

# ---- execução ------------------------------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

if ($Pasta -eq '') { $Pasta = Join-Path $env:LOCALAPPDATA 'VitaZap' }
if ($PastaInicializar -eq '') { $PastaInicializar = [Environment]::GetFolderPath('Startup') }
$Origem = $Origem.TrimEnd('/')
$Ext = Join-Path $Pasta 'extensao'
$Log = Join-Path $Pasta 'atualizador.log'

function Escrever-Log([string]$Texto) {
  try {
    if (-not (Test-Path -LiteralPath $Pasta)) { New-Item -ItemType Directory -Path $Pasta -Force | Out-Null }
    if ((Test-Path -LiteralPath $Log) -and ((Get-Item -LiteralPath $Log).Length -gt 200KB)) { Remove-Item -LiteralPath $Log -Force }
    Add-Content -LiteralPath $Log -Value ((Get-Date -Format 's') + ' ' + $Texto) -Encoding UTF8
  } catch { }
}

function Avisar([string]$Texto, [string]$Icone) {
  if ($Silencioso -or $SemJanela) { return }
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($Texto, 'Vita Zap', 'OK', $Icone)
  } catch { }
}

function Baixar([string]$Url, [string]$Destino) {
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destino -TimeoutSec 60
}

# Baixa, confere e troca a pasta. Devolve a versão instalada. Em qualquer falha a pasta antiga fica como estava.
function Instalar-Zip {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $tmpZip = Join-Path ([IO.Path]::GetTempPath()) ('vitazap-' + [guid]::NewGuid().ToString('N') + '.zip')
  $novo = $Ext + '.novo'
  $velha = $Ext + '.velha'
  $nomeExt = Split-Path $Ext -Leaf
  try {
    Baixar ($Origem + '/vita-zap/vita-zap.zip') $tmpZip
    if (-not (Zip-Seguro $tmpZip)) { throw 'zip vazio ou com caminhos suspeitos' }
    if (Test-Path -LiteralPath $novo) { Remove-Item -LiteralPath $novo -Recurse -Force }
    New-Item -ItemType Directory -Path $novo -Force | Out-Null
    [IO.Compression.ZipFile]::ExtractToDirectory($tmpZip, $novo)
    $m = Ler-Manifest $novo
    if ($null -eq $m -or -not $m.key -or -not $m.version) { throw 'o zip não tem um manifest.json válido' }
    if ((Id-DaChave ([string]$m.key)) -ne $IdEsperado) { throw 'o zip é de outra extensão (ID diferente do Vita Zap)' }

    if (Test-Path -LiteralPath $velha) { Remove-Item -LiteralPath $velha -Recurse -Force }
    $tinha = Test-Path -LiteralPath $Ext
    if ($tinha) { Rename-Item -LiteralPath $Ext -NewName (Split-Path $velha -Leaf) }
    try {
      Rename-Item -LiteralPath $novo -NewName $nomeExt
    } catch {
      if ($tinha) { Rename-Item -LiteralPath $velha -NewName $nomeExt }
      throw
    }
    if ($tinha) { try { Remove-Item -LiteralPath $velha -Recurse -Force } catch { Escrever-Log ('não consegui apagar a pasta antiga: ' + $_.Exception.Message) } }
    return [string]$m.version
  } finally {
    if (Test-Path -LiteralPath $tmpZip) { Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $novo) { Remove-Item -LiteralPath $novo -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function Criar-Atalho {
  $copia = Join-Path $Pasta $NomeScript
  if ($PSCommandPath -and ($PSCommandPath -ne $copia)) { Copy-Item -LiteralPath $PSCommandPath -Destination $copia -Force }
  if (-not (Test-Path -LiteralPath $PastaInicializar)) { New-Item -ItemType Directory -Path $PastaInicializar -Force | Out-Null }
  $argumentos = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $copia + '" -Silencioso'
  if ($Origem -ne $OrigemPadrao) { $argumentos += ' -Origem "' + $Origem + '"' }
  if ($Pasta -ne (Join-Path $env:LOCALAPPDATA 'VitaZap')) { $argumentos += ' -Pasta "' + $Pasta + '"' }
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut((Join-Path $PastaInicializar $NomeAtalho))
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $lnk.Arguments = $argumentos
  $lnk.WindowStyle = 7
  $lnk.Description = 'Atualiza o Vita Zap (extensão do Chrome) a cada logon'
  $lnk.Save()
}

if (-not (Origem-Segura $Origem)) {
  Escrever-Log ('origem recusada: ' + $Origem)
  Avisar 'Endereço do CRM inválido (só https).' 'Error'
  exit 1
}

$local = Ler-Manifest $Ext
$primeira = ($null -eq $local)
$versaoLocal = ''
if (-not $primeira) { $versaoLocal = [string]$local.version }

# Execução manual (duplo clique): deixa o logon automático pronto, antes de depender da rede.
if (-not $Silencioso) {
  try {
    if (-not (Test-Path -LiteralPath $Pasta)) { New-Item -ItemType Directory -Path $Pasta -Force | Out-Null }
    Criar-Atalho
    Escrever-Log ('atalho de inicialização em ' + $PastaInicializar)
  } catch { Escrever-Log ('não consegui criar o atalho: ' + $_.Exception.Message) }
}

$nl = [Environment]::NewLine
$precisa = $primeira
if (-not $primeira) {
  try {
    $info = Invoke-RestMethod -UseBasicParsing -Uri ($Origem + '/vita-zap/versao.json') -TimeoutSec 20
    $versaoSite = [string]$info.versao
  } catch {
    Escrever-Log ('sem rede ou versao.json indisponível (' + $_.Exception.Message + ')')
    exit 0
  }
  $precisa = Versao-EhMaior $versaoSite $versaoLocal
  if (-not $precisa) {
    Escrever-Log ('já está na última versão (local ' + $versaoLocal + ', site ' + $versaoSite + ')')
    Avisar ('O Vita Zap já está atualizado (versão ' + $versaoLocal + ').' + $nl + $nl + 'Pasta da extensão:' + $nl + $Ext) 'Information'
    exit 0
  }
}

try {
  $instalada = Instalar-Zip
  if ($primeira) { Escrever-Log ('instalado: ' + $instalada) } else { Escrever-Log ('atualizado de ' + $versaoLocal + ' para ' + $instalada) }
} catch {
  Escrever-Log ('falhou, a versão anterior foi mantida: ' + $_.Exception.Message)
  Avisar ('Não consegui baixar o Vita Zap agora. Confira a internet e tente de novo.' + $nl + $nl + $_.Exception.Message) 'Warning'
  exit 1
}

if (-not $Silencioso -and -not $SemJanela) {
  try { Set-Clipboard -Value $Ext } catch { }
}
if ($primeira) {
  Avisar ('Vita Zap ' + $instalada + ' baixado em:' + $nl + $nl + $Ext + $nl + $nl + '(o caminho foi copiado: basta colar)' + $nl + $nl + 'Agora, no Chrome:' + $nl + '1. Abra chrome://extensions' + $nl + '2. Ligue o Modo do desenvolvedor' + $nl + '3. Clique em Carregar sem compactação e escolha a pasta acima' + $nl + $nl + 'Daí para frente ele se atualiza sozinho a cada vez que você liga o computador.') 'Information'
} else {
  Avisar ('Vita Zap atualizado para a versão ' + $instalada + '.' + $nl + $nl + 'Feche e abra o Chrome (ou clique em recarregar em chrome://extensions) para aplicar.') 'Information'
}
exit 0
