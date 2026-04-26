#!/bin/bash
set -e

# ============================================================
#  AgentForge (AI Coder) — One Command Installer
#  Supports: Linux, macOS, Termux (Android)
# ============================================================

VERSION="0.1.0"
REPO_URL="https://github.com/MrPinguiiin/AgentForge.git"
INSTALL_DIR="$HOME/.ai-coder"
BIN_DIR="$INSTALL_DIR/bin"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# --- Helper Functions ---

print_banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "    _    ___    ____          _           "
  echo "   / \  |_ _|  / ___|___  __| | ___ _ __ "
  echo "  / _ \  | |  | |   / _ \/ _\` |/ _ \ '__|"
  echo " / ___ \ | |  | |__| (_) | (_| |  __/ |   "
  echo "/_/   \_\___|  \____\___/ \__,_|\___|_|   "
  echo ""
  echo -e "${NC}${BOLD}  AgentForge — AI Coding Orchestrator v${VERSION}${NC}"
  echo ""
}

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

spinner() {
  local pid=$1
  local msg=$2
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i+1) % ${#spin} ))
    printf "\r${BLUE}[${spin:$i:1}]${NC} %s" "$msg"
    sleep 0.1
  done
  printf "\r"
}

# --- Detect Platform ---

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux*)
      if [ -d "/data/data/com.termux" ]; then
        PLATFORM="termux"
      else
        PLATFORM="linux"
      fi
      ;;
    Darwin*)
      PLATFORM="macos"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      error "Windows detected. Please use install.ps1 instead:\n  irm https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/install.ps1 | iex"
      ;;
    *)
      error "Unsupported operating system: $OS"
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64)  ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    armv7l|armv8l) ARCH="arm" ;;
  esac

  success "Platform detected: ${PLATFORM} (${ARCH})"
}

# --- Check Prerequisites ---

check_command() {
  command -v "$1" >/dev/null 2>&1
}

install_bun() {
  info "Installing Bun runtime..."

  if [ "$PLATFORM" = "termux" ]; then
    if check_command npm; then
      npm install -g bun
    else
      error "npm is required to install Bun on Termux.\n  Run: pkg install nodejs"
    fi
  else
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi

  if check_command bun; then
    success "Bun installed: $(bun --version)"
  else
    error "Failed to install Bun. Please install manually: https://bun.sh"
  fi
}

check_prerequisites() {
  info "Checking prerequisites..."

  # Check git
  if ! check_command git; then
    case "$PLATFORM" in
      termux) error "Git is required. Install with: pkg install git" ;;
      macos)  error "Git is required. Install with: xcode-select --install" ;;
      linux)  error "Git is required. Install with: sudo apt install git" ;;
    esac
  fi
  success "Git found: $(git --version | head -1)"

  # Check bun (install if missing)
  if ! check_command bun; then
    warn "Bun not found. Installing automatically..."
    install_bun
  else
    success "Bun found: v$(bun --version)"
  fi

  # Check curl
  if ! check_command curl; then
    error "curl is required. Install with your package manager."
  fi
}

# --- Installation ---

install_from_source() {
  info "Installing AgentForge..."

  # Clone or update
  if [ -d "$INSTALL_DIR/repo/.git" ]; then
    warn "Previous installation found. Updating..."
    cd "$INSTALL_DIR/repo"
    git fetch origin
    git reset --hard origin/master
    success "Repository updated"
  else
    # Clean install
    rm -rf "$INSTALL_DIR/repo"
    mkdir -p "$INSTALL_DIR"
    info "Cloning repository..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR/repo"
    success "Repository cloned"
  fi

  cd "$INSTALL_DIR/repo"

  # Install dependencies
  info "Installing dependencies (this may take a moment)..."
  bun install --frozen-lockfile 2>/dev/null || bun install
  success "Dependencies installed"

  # Build project
  info "Building project..."
  bun run build
  success "Build completed"

  # Setup database
  info "Setting up database..."
  bun run db:generate 2>/dev/null || true
  bun run db:migrate 2>/dev/null || true
  success "Database ready"
}

# --- Create Wrapper Script ---

create_wrapper() {
  info "Creating CLI wrapper..."

  mkdir -p "$BIN_DIR"

  cat > "$BIN_DIR/ai-coder" << 'WRAPPER'
#!/bin/bash
# ============================================
#  AgentForge (AI Coder) CLI Wrapper
# ============================================

INSTALL_DIR="$HOME/.ai-coder"
REPO_DIR="$INSTALL_DIR/repo"

if [ ! -d "$REPO_DIR" ]; then
  echo "Error: AgentForge is not installed."
  echo "Install: curl -sSL https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/install.sh | bash"
  exit 1
fi

# Ensure bun is in PATH
if [ -d "$HOME/.bun/bin" ]; then
  export PATH="$HOME/.bun/bin:$PATH"
fi

# Run the CLI
exec bun run "$REPO_DIR/cli/src/index.ts" "$@"
WRAPPER

  chmod +x "$BIN_DIR/ai-coder"
  success "CLI wrapper created: $BIN_DIR/ai-coder"
}

# --- Setup PATH ---

setup_path() {
  info "Setting up PATH..."

  local path_entry='export PATH="$HOME/.ai-coder/bin:$PATH"'
  local marker=".ai-coder/bin"

  # Fish shell uses different syntax
  if [ "$(basename "$SHELL" 2>/dev/null)" = "fish" ]; then
    local fish_config="$HOME/.config/fish/config.fish"
    mkdir -p "$(dirname "$fish_config")"
    if [ -f "$fish_config" ] && grep -q "$marker" "$fish_config" 2>/dev/null; then
      success "PATH already configured (fish)"
    else
      echo "" >> "$fish_config"
      echo "# AgentForge (AI Coder)" >> "$fish_config"
      echo 'set -gx PATH $HOME/.ai-coder/bin $PATH' >> "$fish_config"
      success "PATH added to $fish_config"
    fi
    export PATH="$BIN_DIR:$PATH"
    return
  fi

  # Bash / Zsh / other POSIX shells
  local shell_configs=()

  case "$(basename "$SHELL" 2>/dev/null)" in
    zsh)  shell_configs=("$HOME/.zshrc") ;;
    bash) shell_configs=("$HOME/.bashrc") ;;
    *)    shell_configs=("$HOME/.profile" "$HOME/.bashrc") ;;
  esac

  # Termux always uses .bashrc
  if [ "$PLATFORM" = "termux" ]; then
    shell_configs=("$HOME/.bashrc")
  fi

  for config_file in "${shell_configs[@]}"; do
    if [ -f "$config_file" ] && grep -q "$marker" "$config_file" 2>/dev/null; then
      success "PATH already configured in $config_file"
      continue
    fi

    echo "" >> "$config_file"
    echo "# AgentForge (AI Coder)" >> "$config_file"
    echo "$path_entry" >> "$config_file"
    success "PATH added to $config_file"
  done

  # Apply to current session
  export PATH="$BIN_DIR:$PATH"
}

# --- Verify Installation ---

verify_installation() {
  info "Verifying installation..."

  if [ ! -x "$BIN_DIR/ai-coder" ]; then
    error "Installation verification failed: CLI wrapper not found"
  fi

  success "ai-coder CLI is ready"
}

# --- Post-Install Message ---

print_success() {
  echo ""
  echo -e "${GREEN}${BOLD}================================================${NC}"
  echo -e "${GREEN}${BOLD}  AgentForge installed successfully!${NC}"
  echo -e "${GREEN}${BOLD}================================================${NC}"
  echo ""
  echo -e "  ${BOLD}Quick Start:${NC}"
  echo ""
  echo -e "  ${CYAN}1.${NC} Restart terminal or run:"
  echo -e "     ${YELLOW}source ~/.bashrc${NC}  (or ~/.zshrc)"
  echo ""
  echo -e "  ${CYAN}2.${NC} Go to your project directory:"
  echo -e "     ${YELLOW}cd /path/to/your/project${NC}"
  echo ""
  echo -e "  ${CYAN}3.${NC} Initialize AI Coder:"
  echo -e "     ${YELLOW}ai-coder init${NC}"
  echo ""
  echo -e "  ${CYAN}4.${NC} Start the server:"
  echo -e "     ${YELLOW}ai-coder start${NC}"
  echo ""
  echo -e "  Web UI opens at ${CYAN}http://localhost:3000${NC}"
  echo -e "  (auto-detects available port if 3000 is busy)"
  echo ""
  echo -e "  ${BOLD}All Commands:${NC}"
  echo -e "    ${YELLOW}ai-coder init${NC}              Initialize project"
  echo -e "    ${YELLOW}ai-coder start${NC}             Start server + browser"
  echo -e "    ${YELLOW}ai-coder start -p 8080${NC}     Start on custom port"
  echo -e "    ${YELLOW}ai-coder config --show${NC}     View configuration"
  echo ""
  echo -e "  ${BOLD}Uninstall:${NC}"
  echo -e "    ${YELLOW}curl -sSL https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/uninstall.sh | bash${NC}"
  echo ""
  echo -e "  ${BOLD}Docs:${NC} ${CYAN}https://github.com/MrPinguiiin/AgentForge${NC}"
  echo ""
}

# --- Main ---

main() {
  print_banner
  detect_platform
  check_prerequisites
  install_from_source
  create_wrapper
  setup_path
  verify_installation
  print_success
}

main "$@"
