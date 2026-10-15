param(
  [switch]$Check
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$esbuild = Join-Path $root 'node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe'
if (-not (Test-Path -LiteralPath $esbuild)) {
  throw "Windows esbuild binary not found: $esbuild"
}
$entry = Join-Path $root 'packages/engine-worker/src/browser-worker.ts'
$outfile = Join-Path $root 'packages/engine-worker/dist/browser/browser-worker.js'
$coreAlias = "@craftaib/core=$(Join-Path $root 'packages/core/src/index.ts')"
$args = @($entry, '--bundle', '--format=esm', '--platform=browser', '--target=es2022', "--outfile=$outfile", "--alias:$coreAlias", '--external:node:*')
& $esbuild @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'browser worker bundled (native Windows esbuild)'
