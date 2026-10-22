# Testes (Pester 3/4) da lógica do atualizador. Rodar: Invoke-Pester .\instalador
# Só carrega as funções do script (dot-source); não baixa nada e não cria atalho.

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $raiz 'Atualizar-VitaZap.ps1')

Describe 'Versao-EhMaior' {
  It 'só é verdadeiro quando a nova é maior' {
    Versao-EhMaior '0.7.1' '0.7.0' | Should Be $true
    Versao-EhMaior '0.10.0' '0.9.9' | Should Be $true
    Versao-EhMaior '1.0' '0.9.9' | Should Be $true
    Versao-EhMaior '0.7.0' '0.7.0' | Should Be $false
    Versao-EhMaior '0.6.4' '0.7.0' | Should Be $false
  }
  It 'versão nova inválida nunca atualiza; versão local inválida conta como zero' {
    Versao-EhMaior 'lixo' '0.7.0' | Should Be $false
    Versao-EhMaior '' '0.7.0' | Should Be $false
    Versao-EhMaior '0.0.1' '' | Should Be $true
  }
}

Describe 'Id-DaChave' {
  It 'a chave do manifest da extensão dá o ID fixo do Vita Zap' {
    $m = Get-Content -LiteralPath (Join-Path $raiz '..\public\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Id-DaChave ([string]$m.key) | Should Be $IdEsperado
  }
  It 'outra chave dá outro ID' {
    $outra = [Convert]::ToBase64String([byte[]](1..64))
    Id-DaChave $outra | Should Not Be $IdEsperado
  }
}

Describe 'Origem-Segura' {
  It 'https sempre; http só em localhost' {
    Origem-Segura 'https://lembretes.salvitarn.com.br' | Should Be $true
    Origem-Segura 'http://localhost:8123' | Should Be $true
    Origem-Segura 'http://127.0.0.1:8123' | Should Be $true
    Origem-Segura 'http://lembretes.salvitarn.com.br' | Should Be $false
    Origem-Segura 'ftp://x' | Should Be $false
    Origem-Segura 'https://x/y' | Should Be $false
  }
}

Describe 'Zip-Seguro' {
  function Novo-Zip($nomes) {
    Add-Type -AssemblyName System.IO.Compression
    $f = Join-Path ([IO.Path]::GetTempPath()) ('pester-' + [guid]::NewGuid().ToString('N') + '.zip')
    $fs = [IO.File]::Create($f)
    $za = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
    foreach ($n in $nomes) { $e = $za.CreateEntry($n); $w = New-Object IO.StreamWriter($e.Open()); $w.Write('x'); $w.Dispose() }
    $za.Dispose(); $fs.Dispose()
    return $f
  }
  It 'aceita arquivos normais' {
    $z = Novo-Zip @('manifest.json', 'assets/a.js')
    Zip-Seguro $z | Should Be $true
    Remove-Item $z
  }
  It 'recusa caminho que sai da pasta' {
    foreach ($ruim in @('../fora.txt', 'a/../../fora.txt', '/abs.txt', 'C:/x.txt')) {
      $z = Novo-Zip @('manifest.json', $ruim)
      Zip-Seguro $z | Should Be $false
      Remove-Item $z
    }
  }
}
