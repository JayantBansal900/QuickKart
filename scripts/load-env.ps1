# Loads the project's .env into the CURRENT PowerShell session, so a service started from this
# terminal (mvn spring-boot:run) gets JWT_SECRET, OTP_HASH_SECRET, SMTP_* and the other settings.
# Spring Boot does not read .env files by itself; Docker Compose does, which is why this is only
# needed when running services outside Docker.
#
# Usage (dot-source it, from anywhere inside the repo):
#   . E:\quickkart-backend\scripts\load-env.ps1
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envFile)) {
    Write-Error "No .env found at $envFile. Copy .env.example to .env first."
    return
}
$count = 0
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        Set-Item -Path "env:$($Matches[1])" -Value $Matches[2]
        $count++
    }
}
Write-Host "Loaded $count settings from .env (values not shown)."
