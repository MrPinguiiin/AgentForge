# ============================================================
#  AgentForge (AI Coder) — Uninstaller for Windows
#  Usage: irm https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/uninstall.ps1 | iex
# ============================================================

$ErrorActionPreference = "Stop"

$INSTALL_DIR = "$env:USERPROFILE\.ai-coder"
$BIN_DIR = "$INSTALL_DIR\bin"

function Write-Info($msg)  { Write-Host "[INFO] " -ForegroundColor Blue -NoNewline; Write-Host $msg }
function Write-Ok($msg)    { Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Warn($msg)  { Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $msg }

Write-Host ""
Write-Host "AgentForge (AI Coder) - Uninstaller" -ForegroundColor White
Write-Host ""

# --- Confirm ---

if ($args -notcontains "--yes" -and $args -notcontains "-y") {
    Write-Host "This will remove AgentForge from your system."
    Write-Host "  Install directory: " -NoNewline
    Write-Host $INSTALL_DIR -ForegroundColor Cyan
    Write-Host ""

    $confirm = Read-Host "Are you sure? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Cancelled."
        exit 0
    }
}

Write-Host ""

# --- Remove installation directory ---

if (Test-Path $INSTALL_DIR) {
    Write-Info "Removing installation directory..."
    Remove-Item -Recurse -Force $INSTALL_DIR
    Write-Ok "Removed $INSTALL_DIR"
}
else {
    Write-Warn "Installation directory not found: $INSTALL_DIR"
}

# --- Clean PATH ---

Write-Info "Cleaning PATH..."

$currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")

if ($currentPath -like "*$BIN_DIR*") {
    $pathParts = $currentPath -split ";" | Where-Object { $_ -ne $BIN_DIR -and $_ -ne "" }
    $newPath = $pathParts -join ";"
    [System.Environment]::SetEnvironmentVariable("Path", $newPath, "User")

    # Update current session
    $env:Path = ($env:Path -split ";" | Where-Object { $_ -ne $BIN_DIR -and $_ -ne "" }) -join ";"

    Write-Ok "PATH cleaned"
}
else {
    Write-Ok "PATH was already clean"
}

# --- Done ---

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  AgentForge has been uninstalled" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Restart your terminal to apply PATH changes."
Write-Host ""
Write-Host "  Note: " -ForegroundColor White -NoNewline
Write-Host "Project-level " -NoNewline
Write-Host ".ai-coder\" -ForegroundColor Cyan -NoNewline
Write-Host " directories"
Write-Host "  inside your projects were NOT removed."
Write-Host "  Remove them manually if needed:"
Write-Host "    Remove-Item -Recurse -Force C:\path\to\project\.ai-coder" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Reinstall:" -ForegroundColor White
Write-Host "    irm https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/install.ps1 | iex" -ForegroundColor Yellow
Write-Host ""
