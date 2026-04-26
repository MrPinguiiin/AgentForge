# ============================================================
#  AgentForge (AI Coder) — One Command Installer for Windows
#  Usage: irm https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/install.ps1 | iex
# ============================================================

$ErrorActionPreference = "Stop"

$VERSION = "0.1.0"
$REPO_URL = "https://github.com/MrPinguiiin/AgentForge.git"
$INSTALL_DIR = "$env:USERPROFILE\.ai-coder"
$BIN_DIR = "$INSTALL_DIR\bin"

# --- Helper Functions ---

function Write-Banner {
    Write-Host ""
    Write-Host "    _    ___    ____          _           " -ForegroundColor Cyan
    Write-Host "   / \  |_ _|  / ___|___  __| | ___ _ __ " -ForegroundColor Cyan
    Write-Host "  / _ \  | |  | |   / _ \/ _`` |/ _ \ '__|" -ForegroundColor Cyan
    Write-Host " / ___ \ | |  | |__| (_) | (_| |  __/ |   " -ForegroundColor Cyan
    Write-Host "/_/   \_\___|  \____\___/ \__,_|\___|_|   " -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  AgentForge - AI Coding Orchestrator v$VERSION" -ForegroundColor White
    Write-Host ""
}

function Write-Info($msg)    { Write-Host "[INFO] " -ForegroundColor Blue -NoNewline; Write-Host $msg }
function Write-Ok($msg)      { Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Warn($msg)    { Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Write-Err($msg)     { Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $msg; exit 1 }

# --- Check Prerequisites ---

function Test-Command($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Install-Bun {
    Write-Info "Installing Bun runtime..."

    try {
        irm https://bun.sh/install.ps1 | iex
    }
    catch {
        Write-Err "Failed to install Bun. Please install manually: https://bun.sh"
    }

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")

    if (Test-Command "bun") {
        Write-Ok "Bun installed: $(bun --version)"
    }
    else {
        Write-Err "Bun installation failed. Please install manually: https://bun.sh"
    }
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."

    # Check git
    if (-not (Test-Command "git")) {
        Write-Err "Git is required. Download from: https://git-scm.com/download/win"
    }
    Write-Ok "Git found: $(git --version)"

    # Check bun
    if (-not (Test-Command "bun")) {
        Write-Warn "Bun not found. Installing automatically..."
        Install-Bun
    }
    else {
        Write-Ok "Bun found: v$(bun --version)"
    }
}

# --- Installation ---

function Install-FromSource {
    Write-Info "Installing AgentForge..."

    $repoDir = "$INSTALL_DIR\repo"

    # Clone or update
    if (Test-Path "$repoDir\.git") {
        Write-Warn "Previous installation found. Updating..."
        Push-Location $repoDir
        git fetch origin
        git reset --hard origin/master
        Pop-Location
        Write-Ok "Repository updated"
    }
    else {
        # Clean install
        if (Test-Path $repoDir) {
            Remove-Item -Recurse -Force $repoDir
        }
        New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
        Write-Info "Cloning repository..."
        git clone --depth 1 $REPO_URL $repoDir
        Write-Ok "Repository cloned"
    }

    Push-Location $repoDir

    # Install dependencies
    Write-Info "Installing dependencies (this may take a moment)..."
    try {
        bun install --frozen-lockfile 2>$null
    }
    catch {
        bun install
    }
    Write-Ok "Dependencies installed"

    # Build project
    Write-Info "Building project..."
    bun run build
    Write-Ok "Build completed"

    # Setup database
    Write-Info "Setting up database..."
    try { bun run db:generate 2>$null } catch {}
    try { bun run db:migrate 2>$null } catch {}
    Write-Ok "Database ready"

    Pop-Location
}

# --- Create Wrapper ---

function New-Wrapper {
    Write-Info "Creating CLI wrapper..."

    New-Item -ItemType Directory -Force -Path $BIN_DIR | Out-Null

    # Create batch wrapper
    $batchContent = @"
@echo off
REM AgentForge (AI Coder) CLI Wrapper

set "INSTALL_DIR=%USERPROFILE%\.ai-coder"
set "REPO_DIR=%INSTALL_DIR%\repo"

if not exist "%REPO_DIR%" (
    echo Error: AgentForge is not installed.
    echo Install: irm https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/install.ps1 ^| iex
    exit /b 1
)

bun run "%REPO_DIR%\cli\src\index.ts" %*
"@

    Set-Content -Path "$BIN_DIR\ai-coder.cmd" -Value $batchContent -Encoding ASCII

    # Create PowerShell wrapper
    $psContent = @'
# AgentForge (AI Coder) CLI Wrapper

$INSTALL_DIR = "$env:USERPROFILE\.ai-coder"
$REPO_DIR = "$INSTALL_DIR\repo"

if (-not (Test-Path $REPO_DIR)) {
    Write-Host "Error: AgentForge is not installed." -ForegroundColor Red
    Write-Host "Install: irm https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/install.ps1 | iex"
    exit 1
}

& bun run "$REPO_DIR\cli\src\index.ts" @args
'@

    Set-Content -Path "$BIN_DIR\ai-coder.ps1" -Value $psContent -Encoding UTF8

    Write-Ok "CLI wrappers created: $BIN_DIR\ai-coder.cmd"
}

# --- Setup PATH ---

function Set-UserPath {
    Write-Info "Setting up PATH..."

    $currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")

    if ($currentPath -like "*$BIN_DIR*") {
        Write-Ok "PATH already configured"
        return
    }

    $newPath = "$BIN_DIR;$currentPath"
    [System.Environment]::SetEnvironmentVariable("Path", $newPath, "User")

    # Update current session
    $env:Path = "$BIN_DIR;$env:Path"

    Write-Ok "PATH updated (added $BIN_DIR)"
}

# --- Verify Installation ---

function Test-Installation {
    Write-Info "Verifying installation..."

    if (-not (Test-Path "$BIN_DIR\ai-coder.cmd")) {
        Write-Err "Installation verification failed: CLI wrapper not found"
    }

    Write-Ok "ai-coder CLI is ready"
}

# --- Post-Install Message ---

function Write-Success {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  AgentForge installed successfully!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Quick Start:" -ForegroundColor White
    Write-Host ""
    Write-Host "  1. " -ForegroundColor Cyan -NoNewline
    Write-Host "Restart your terminal (PowerShell / CMD)"
    Write-Host ""
    Write-Host "  2. " -ForegroundColor Cyan -NoNewline
    Write-Host "Go to your project directory:"
    Write-Host "     cd C:\path\to\your\project" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  3. " -ForegroundColor Cyan -NoNewline
    Write-Host "Initialize AI Coder:"
    Write-Host "     ai-coder init" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  4. " -ForegroundColor Cyan -NoNewline
    Write-Host "Start the server:"
    Write-Host "     ai-coder start" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Web UI opens at " -NoNewline
    Write-Host "http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  (auto-detects available port if 3000 is busy)"
    Write-Host ""
    Write-Host "  All Commands:" -ForegroundColor White
    Write-Host "    ai-coder init              " -ForegroundColor Yellow -NoNewline; Write-Host "Initialize project"
    Write-Host "    ai-coder start             " -ForegroundColor Yellow -NoNewline; Write-Host "Start server + browser"
    Write-Host "    ai-coder start -p 8080     " -ForegroundColor Yellow -NoNewline; Write-Host "Start on custom port"
    Write-Host "    ai-coder config --show     " -ForegroundColor Yellow -NoNewline; Write-Host "View configuration"
    Write-Host ""
    Write-Host "  Uninstall:" -ForegroundColor White
    Write-Host "    irm https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/uninstall.ps1 | iex" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Docs: " -NoNewline
    Write-Host "https://github.com/MrPinguiiin/AgentForge" -ForegroundColor Cyan
    Write-Host ""
}

# --- Main ---

function Main {
    Write-Banner
    Test-Prerequisites
    Install-FromSource
    New-Wrapper
    Set-UserPath
    Test-Installation
    Write-Success
}

Main
