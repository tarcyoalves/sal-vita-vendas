$src = Join-Path $PSScriptRoot "..\dist\*"
$dests = @(
  "C:\Users\Tarcyo Alves\Downloads\vita-zap",
  "C:\Users\Tarcyo Alves\Downloads\vita-zap (1)",
  "C:\Users\Tarcyo Alves\Downloads\vita-zap (2)",
  "C:\Users\Tarcyo Alves\Downloads\vita-zap-0.6.0",
  "C:\Users\Tarcyo Alves\AppData\Local\VitaZap\extensao",
  (Join-Path $PSScriptRoot "..\..\..\vita-zap")
)

foreach ($d in $dests) {
  if (Test-Path $d) {
    Copy-Item -Path $src -Destination $d -Recurse -Force
    Write-Host "Sincronizado: $d"
  } else {
    Write-Host "Ignorado: $d"
  }
}
