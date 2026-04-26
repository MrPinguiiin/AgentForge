#!/bin/bash
set -e

# ============================================================
#  AgentForge (AI Coder) — Uninstaller
#  Supports: Linux, macOS, Termux (Android)
# ============================================================

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

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo -e "${BOLD}AgentForge (AI Coder) — Uninstaller${NC}"
echo ""

# --- Confirm ---

if [ "${1}" != "--yes" ] && [ "${1}" != "-y" ]; then
  echo -e "This will remove AgentForge from your system."
  echo -e "  Install directory: ${CYAN}$INSTALL_DIR${NC}"
  echo ""
  read -p "Are you sure? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

echo ""

# --- Remove installation directory ---

if [ -d "$INSTALL_DIR" ]; then
  info "Removing installation directory..."
  rm -rf "$INSTALL_DIR"
  success "Removed $INSTALL_DIR"
else
  warn "Installation directory not found: $INSTALL_DIR"
fi

# --- Clean PATH from shell configs ---

clean_shell_config() {
  local config_file="$1"

  if [ ! -f "$config_file" ]; then
    return
  fi

  if grep -q ".ai-coder" "$config_file" 2>/dev/null; then
    # Remove lines containing .ai-coder and the comment above it
    local tmp_file
    tmp_file=$(mktemp)
    grep -v ".ai-coder" "$config_file" | grep -v "# AgentForge" > "$tmp_file" || true

    # Remove trailing empty lines that were left behind
    sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$tmp_file" > "$config_file" 2>/dev/null || mv "$tmp_file" "$config_file"
    rm -f "$tmp_file"

    success "Cleaned PATH from $config_file"
  fi
}

info "Cleaning shell configuration..."

clean_shell_config "$HOME/.bashrc"
clean_shell_config "$HOME/.bash_profile"
clean_shell_config "$HOME/.zshrc"
clean_shell_config "$HOME/.profile"

# Fish shell
fish_config="$HOME/.config/fish/config.fish"
if [ -f "$fish_config" ] && grep -q ".ai-coder" "$fish_config" 2>/dev/null; then
  tmp_file=$(mktemp)
  grep -v ".ai-coder" "$fish_config" | grep -v "# AgentForge" > "$tmp_file" || true
  mv "$tmp_file" "$fish_config"
  success "Cleaned PATH from $fish_config"
fi

# --- Done ---

echo ""
echo -e "${GREEN}${BOLD}================================================${NC}"
echo -e "${GREEN}${BOLD}  AgentForge has been uninstalled${NC}"
echo -e "${GREEN}${BOLD}================================================${NC}"
echo ""
echo -e "  Restart your terminal to apply PATH changes."
echo ""
echo -e "  ${BOLD}Note:${NC} Project-level ${CYAN}.ai-coder/${NC} directories"
echo -e "  inside your projects were NOT removed."
echo -e "  Remove them manually if needed:"
echo -e "    ${YELLOW}rm -rf /path/to/project/.ai-coder${NC}"
echo ""
echo -e "  ${BOLD}Reinstall:${NC}"
echo -e "    ${YELLOW}curl -sSL https://raw.githubusercontent.com/MrPinguiiin/AgentForge/master/scripts/install.sh | bash${NC}"
echo ""
