$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

docker build -t pm .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker rm -f pm *> $null
New-Item -ItemType Directory -Force data | Out-Null
docker run -d --name pm --env-file .env -p 8000:8000 -v "${root}\data:/app/data" pm
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Running at http://localhost:8000"
