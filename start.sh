#!/bin/bash

#
# Elenchus AI Debate Framework - One-Click Start Script
# For macOS / Linux
#
# Usage:
#   ./start.sh              # Full start
#   ./start.sh --skip-install  # Skip dependency installation
#   ./start.sh --backend-only  # Backend only
#   ./start.sh --frontend-only # Frontend only
set -e

SKIP_INSTALL=false
BACKEND_ONLY=false
FRONTEND_ONLY=false

for arg in "$@"; do
    case $arg in
        --skip-install)
            SKIP_INSTALL=true
            ;;
        --backend-only)
            BACKEND_ONLY=true
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

print_header() {
    echo ""
    echo -e "${CYAN}========================================${RESET}"
    echo -e "${BOLD}$1${RESET}"
    echo -e "${CYAN}========================================${RESET}"
    echo ""
}

print_success() {
    echo -e "${GREEN}[OK]${RESET} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${RESET} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${RESET} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${RESET} $1"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

get_node_version() {
    node --version 2>&1 | sed 's/v//'
}

version_compare() {
    if [[ $1 == $2 ]]; then
        return 0
    fi
    local IFS=.
    local i ver1=($1) ver2=($2)
    for ((i=${#ver1[@]}; i<${#ver2[@]}; i++)); do
        ver1[i]=0
    done
    for ((i=0; i<${#ver1[@]}; i++)); do
        if [[ -z ${ver2[i]} ]]; then
            ver2[i]=0
        fi
        if ((10#${ver1[i]} > 10#${ver2[i]})); then
            return 1
        fi
        if ((10#${ver1[i]} < 10#${ver2[i]})); then
            return 2
        fi
    done
    return 0
}

version_ge() {
    version_compare $1 $2
    result=$?
    [[ $result -eq 0 || $result -eq 1 ]]
}

# Dependency fingerprint helpers (mirrors start.ps1 logic)
get_dependency_fingerprint() {
    local result=""
    for path in "$@"; do
        if [[ ! -f "$path" ]]; then
            result+="missing::$path"$'\n'
            continue
        fi
        local size=$(stat -f%z "$path" 2>/dev/null || stat -c%s "$path" 2>/dev/null || echo "0")
        local hash=$(shasum -a 256 "$path" | awk '{print $1}')
        result+="$path|$size|$hash"$'\n'
    done
    echo -n "$result"
}

test_dependency_refresh_needed() {
    local state_file="$1"
    shift
    if [[ ! -f "$state_file" ]]; then
        return 0  # needs refresh
    fi
    local saved=$(cat "$state_file")
    local current=$(get_dependency_fingerprint "$@")
    [[ "$saved" != "$current" ]]
}

save_dependency_fingerprint() {
    local state_file="$1"
    shift
    local state_dir=$(dirname "$state_file")
    mkdir -p "$state_dir" 2>/dev/null || true
    get_dependency_fingerprint "$@" > "$state_file"
}

# Environment check cache helpers
test_env_cache_valid() {
    local cache_file="$1"
    if [[ ! -f "$cache_file" ]]; then
        return 1
    fi
    # Cache valid for 24 hours
    local cache_mtime=$(stat -f%m "$cache_file" 2>/dev/null || stat -c%Y "$cache_file" 2>/dev/null || echo 0)
    local now=$(date +%s)
    local age=$(( now - cache_mtime ))
    [[ $age -lt 86400 ]]
}

clear
echo ""
echo -e "${BOLD}${CYAN}   __                                         ${RESET}"
echo -e "${BOLD}${CYAN}  /  \___  ___  __ _ _   _  ___ _ __   ___ ___ ${RESET}"
echo -e "${BOLD}${CYAN} / /\ / _ \/ __|/ _\` | | | |/ _ \ '_ \ / __/ _ \\${RESET}"
echo -e "${BOLD}${CYAN}/ /_//  __/\__ \ (_| | |_| |  __/ | | | (_|  __/${RESET}"
echo -e "${BOLD}${CYAN},___/ \___||___/\__, |\__,_|\___|_| |_|\___\___|${RESET}"
echo -e "${BOLD}${CYAN}                  |_|${RESET}"
echo ""
echo -e "${BOLD}   AI Debate Framework - One-Click Start${RESET}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
RUNTIME_DIR="$SCRIPT_DIR/runtime"
INSTALL_STATE_DIR="$RUNTIME_DIR/.install-state"

FRONTEND_STATE_FILE="$INSTALL_STATE_DIR/frontend.txt"
ENV_CACHE_FILE="$INSTALL_STATE_DIR/env-check.txt"

FRONTEND_DEPS=("$FRONTEND_DIR/package.json" "$FRONTEND_DIR/package-lock.json")

PIDS=()

cleanup() {
    echo ""
    print_info "Stopping services..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done

    print_success "Services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# ── Step 1: Environment Check (cached) ──

print_header "Step 1/4: Environment Check"

CHECKS_PASSED=true

if test_env_cache_valid "$ENV_CACHE_FILE"; then
    print_success "Environment check passed (cached)"
    if [[ "$FRONTEND_ONLY" != true ]]; then
        if ! check_command uv; then
            print_error "uv not found, please install uv"
            CHECKS_PASSED=false
        fi
    fi

    if [[ "$BACKEND_ONLY" != true ]]; then
        if ! check_command node; then
            print_error "Node.js not found, please install Node.js 18+"
            CHECKS_PASSED=false
        fi
        if ! check_command npm; then
            print_error "npm not found"
            CHECKS_PASSED=false
        fi
    fi
else
    if [[ "$FRONTEND_ONLY" != true ]]; then
        echo "Checking uv..."
        if check_command uv; then
            print_success "uv installed"
        else
            print_error "uv not found, please install uv"
            CHECKS_PASSED=false
        fi
    fi

    if [[ "$BACKEND_ONLY" != true ]]; then
        echo "Checking Node.js..."
        if check_command node; then
            NODE_VERSION=$(get_node_version)
            if version_ge "$NODE_VERSION" "18.0.0"; then
                print_success "Node.js $NODE_VERSION installed"
            else
                print_warning "Node.js version low ($NODE_VERSION), recommend 18.0+"
            fi
        else
            print_error "Node.js not found, please install Node.js 18+"
            CHECKS_PASSED=false
        fi

        echo "Checking npm..."
        if check_command npm; then
            print_success "npm installed"
        else
            print_error "npm not found"
            CHECKS_PASSED=false
        fi
    fi

    if [[ "$CHECKS_PASSED" == true ]]; then
        mkdir -p "$INSTALL_STATE_DIR" 2>/dev/null || true
        echo "passed" > "$ENV_CACHE_FILE"
    fi
fi

if [[ "$CHECKS_PASSED" != true ]]; then
    echo ""
    print_error "Environment check failed, please install missing dependencies"
    echo ""
    echo "Recommended installation:"
    echo "  uv:      https://docs.astral.sh/uv/getting-started/installation/"
    echo "  Node.js: https://nodejs.org/"
    if [[ "$(uname)" == "Darwin" ]]; then
        echo ""
        echo "  macOS users can use Homebrew:"
        echo "    brew install uv node"
    elif [[ "$(uname)" == "Linux" ]]; then
        echo ""
        echo "  Linux users can install Node.js with package manager and uv from the official installer:"
        echo "    uv:      https://docs.astral.sh/uv/getting-started/installation/"
        echo "    Node.js: https://nodejs.org/"
    fi
    exit 1
fi

# ── Step 2: Backend Setup ──

if [[ "$FRONTEND_ONLY" != true ]]; then
    print_header "Step 2/4: Backend Setup"

    cd "$BACKEND_DIR"

    if [[ "$SKIP_INSTALL" != true ]]; then
        print_info "Synchronizing backend dependencies via uv..."
        uv sync --project "$BACKEND_DIR" --frozen --no-dev
        print_success "Backend dependencies are synchronized"
    else
        print_info "Skipping backend dependency synchronization"
    fi

    print_info "Runtime configuration is loaded from $RUNTIME_DIR/config.json"

    cd "$SCRIPT_DIR"
fi

# ── Step 3: Frontend Setup ──

if [[ "$BACKEND_ONLY" != true ]]; then
    print_header "Step 3/4: Frontend Setup"

    cd "$FRONTEND_DIR"

    if [[ "$SKIP_INSTALL" != true ]]; then
        if [[ ! -d "node_modules" ]] || test_dependency_refresh_needed "$FRONTEND_STATE_FILE" "${FRONTEND_DEPS[@]}"; then
            print_info "Installing frontend dependencies..."
            if ! npm install --silent 2>/dev/null; then
                print_error "Frontend dependency installation failed"
                exit 1
            fi
            save_dependency_fingerprint "$FRONTEND_STATE_FILE" "${FRONTEND_DEPS[@]}"
            print_success "Frontend dependencies installed"
        else
            print_success "Frontend dependencies are up to date"
        fi
    else
        if [[ ! -d "node_modules" ]]; then
            print_error "Frontend dependencies are missing. Run once without --skip-install."
            exit 1
        fi
        print_info "Skipping dependency installation"
    fi

    cd "$SCRIPT_DIR"
fi

# ── Step 4: Starting Services ──

print_header "Step 4/4: Starting Services"

BACKEND_PORT=8001
FRONTEND_URL="http://127.0.0.1:5173"

echo ""
echo -e "${BOLD}${GREEN}  Elenchus Starting...${RESET}"
echo ""
echo -e "  ${CYAN}Service URLs:${RESET}"
if [[ "$FRONTEND_ONLY" != true ]]; then
    echo -e "    Backend API:  ${BOLD}http://localhost:$BACKEND_PORT${RESET}"
    echo -e "    API Docs:     ${BOLD}http://localhost:$BACKEND_PORT/docs${RESET}"
fi
if [[ "$BACKEND_ONLY" != true ]]; then
    echo -e "    Frontend UI:  ${BOLD}$FRONTEND_URL${RESET}"
fi
echo ""

if [[ "$FRONTEND_ONLY" != true ]]; then
    echo -e "  ${YELLOW}Tip: First time? Open the web UI and add your model provider API Keys there${RESET}"
fi
echo ""

if [[ "$BACKEND_ONLY" != true ]]; then
    echo "VITE_BACKEND_PORT=$BACKEND_PORT" > "$FRONTEND_DIR/.env"
    print_success "Frontend .env configured with port $BACKEND_PORT"
fi

echo -e "  ${CYAN}Press Ctrl+C to stop all services${RESET}"
echo ""

cd "$SCRIPT_DIR"

if [[ "$BACKEND_ONLY" == true ]]; then
    node scripts/run-backend-dev.cjs
elif [[ "$FRONTEND_ONLY" == true ]]; then
    node scripts/run-frontend-dev.cjs
else
    node scripts/run-stack.cjs
fi
