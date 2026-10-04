# One-time: connect this folder to https://github.com/jatintop/anavrin and push everything.
# Run in PowerShell from the project folder:  .\setup-github\push-to-github.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# The GitHub Actions workflow that tests and publishes the app on every push
New-Item -ItemType Directory -Force .github\workflows | Out-Null
Copy-Item -Force setup-github\deploy.yml .github\workflows\deploy.yml

if (-not (Test-Path .git)) {
  git init -b main
  git remote add origin https://github.com/jatintop/anavrin.git
  git fetch origin
  git reset --soft origin/main     # build on top of the README commit already on GitHub
}
if (-not (git config user.name))  { git config user.name  "Jatin" }
if (-not (git config user.email)) { git config user.email "jatintopakaricloud@gmail.com" }

git add -A
git reset -q setup-github          # helper files stay local
Write-Host "`nFiles going to GitHub:" -ForegroundColor Cyan
git status --short
if (git status --short | Select-String 'golden/images/.*\.(png|jpg)') { throw 'Bill photos are staged - stop. They must stay private.' }

git commit -m "Anavrin app: bill scanning, saree IDs, pricing, Google Sheet sync, auto-deploy"
git push -u origin main
Write-Host "`nDone. Now: GitHub repo -> Settings -> Pages -> Source: GitHub Actions" -ForegroundColor Green
