param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is required.'
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm 11 is required.'
}

if (-not $SkipInstall) {
  pnpm install --recursive
}

git submodule update --init --recursive
Write-Host 'CraftAIB bootstrap complete.'
