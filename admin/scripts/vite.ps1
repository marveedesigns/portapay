param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ViteArgs
)

$ErrorActionPreference = 'Stop'
$adminRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$repoRoot = Resolve-Path (Join-Path $adminRoot '..')

$esbuildCandidates = @(
  (Join-Path $repoRoot 'node_modules\@esbuild\win32-x64\esbuild.exe'),
  (Join-Path $adminRoot 'node_modules\@esbuild\win32-x64\esbuild.exe')
)
$viteCandidates = @(
  (Join-Path $adminRoot 'node_modules\.bin\vite.cmd'),
  (Join-Path $repoRoot 'node_modules\.bin\vite.cmd')
)

$esbuild = $esbuildCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$vite = $viteCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $esbuild) { throw 'Unable to locate esbuild.exe for Vite.' }
if (-not $vite) { throw 'Unable to locate vite.cmd.' }

$env:ESBUILD_BINARY_PATH = (Resolve-Path -LiteralPath $esbuild).Path
& (Resolve-Path -LiteralPath $vite).Path @ViteArgs --config vite.config.mjs --configLoader native
exit $LASTEXITCODE