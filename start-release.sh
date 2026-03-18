#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

SKIP_INSTALL=false
PORT=8001

for arg in "$@"; do
    case $arg in
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --port=*)
            PORT="${arg#*=}"
            shift
            ;;
    esac
done

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

find_free_port() {
    local start_port="$1"
    local candidate
    for offset in {0..9}; do
        candidate=$((start_port + offset))
        if ! lsof -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
FRONTEND_DIST_DIR="$FRONTEND_DIR/dist"
FRONTEND_INDEX="$FRONTEND_DIST_DIR/index.html"
VENV_DIR="$BACKEND_DIR/venv"

echo ""
echo -e "${BOLD}${CYAN}   __                                         ${RESET}"
echo -e "${BOLD}${CYAN}  /  \___  ___  __ _ _   _  ___ _ __   ___ ___ ${RESET}"
echo -e "${BOLD}${CYAN} / /\\ / _ \\/ __|/ _\` | | | |/ _ \\ '_ \\ / __/ _ \\\\${RESET}"
echo -e "${BOLD}${CYAN}/ /_//  __/\\__ \\ (_| | |_| |  __/ | | | (_|  __/${RESET}"
echo -e "${BOLD}${CYAN},___/ \\___||___/\\__, |\\__,_|\\___|_| |_|\\___\\___|${RESET}"
echo -e "${BOLD}${CYAN}                  |_|${RESET}"
echo ""
echo -e "${BOLD}   Release Launcher${RESET}"
echo ""

echo -e "${CYAN}========================================${RESET}"
echo -e "${BOLD}Step 1/4: Environment Check${RESET}"
echo -e "${CYAN}========================================${RESET}"
echo ""

if ! command -v python3 >/dev/null 2>&1; then
    print_error "python3 not found, please install Python 3.10+"
    exit 1
fi
print_success "Python $(python3 --version | awk '{print $2}') installed"

if [[ ! -f "$FRONTEND_INDEX" ]]; then
    print_error "Release frontend bundle not found: $FRONTEND_INDEX"
    echo ""
    echo "For maintainers, build it first with:"
    echo "  npm --prefix frontend run build"
    echo ""
    exit 1
fi
print_success "Frontend release bundle detected"

echo ""
echo -e "${CYAN}========================================${RESET}"
echo -e "${BOLD}Step 2/4: Backend Setup${RESET}"
echo -e "${CYAN}========================================${RESET}"
echo ""

if [[ ! -d "$VENV_DIR" ]]; then
    print_info "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    print_success "Virtual environment created"
else
    print_success "Virtual environment already exists"
fi

PIP_EXE="$VENV_DIR/bin/pip"
PYTHON_EXE="$VENV_DIR/bin/python"

if [[ "$SKIP_INSTALL" != true ]]; then
    print_info "Installing backend dependencies..."
    "$PIP_EXE" install -r "$BACKEND_DIR/requirements.txt"
    print_success "Backend dependencies installed"
else
    print_info "Skipping dependency installation"
fi

if [[ ! -f "$BACKEND_DIR/.env" && -f "$BACKEND_DIR/.env.example" ]]; then
    print_info "Creating .env config file..."
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    print_success ".env file created"
fi

PORT_TO_USE="$(find_free_port "$PORT")"
if [[ "$PORT_TO_USE" != "$PORT" ]]; then
    print_warning "Port $PORT is in use, using port $PORT_TO_USE instead"
fi

echo ""
echo -e "${CYAN}========================================${RESET}"
echo -e "${BOLD}Step 3/4: Starting Elenchus${RESET}"
echo -e "${CYAN}========================================${RESET}"
echo ""

cleanup() {
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
        kill "$BACKEND_PID" >/dev/null 2>&1 || true
    fi
}

trap cleanup EXIT INT TERM

cd "$BACKEND_DIR"
"$PYTHON_EXE" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT_TO_USE" &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

sleep 1
if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    print_error "Backend process exited immediately."
    exit 1
fi

print_info "Waiting for service to be ready..."
BACKEND_READY=false
for _ in {1..30}; do
    if curl -sf "http://localhost:$PORT_TO_USE/health" >/dev/null 2>&1; then
        BACKEND_READY=true
        break
    fi
    sleep 0.5
done

if [[ "$BACKEND_READY" != true ]]; then
    print_error "Backend failed to become ready."
    exit 1
fi

print_success "Elenchus is ready"

echo ""
echo -e "${CYAN}========================================${RESET}"
echo -e "${BOLD}Step 4/4: Open App${RESET}"
echo -e "${CYAN}========================================${RESET}"
echo ""
echo -e "  App URL:      ${BOLD}http://localhost:$PORT_TO_USE${RESET}"
echo -e "  API Docs:     ${BOLD}http://localhost:$PORT_TO_USE/docs${RESET}"
echo ""
print_warning "First time? Add your model provider API Keys in the Settings page."
print_info "Opening browser..."

if [[ "$(uname)" == "Darwin" ]]; then
    open "http://localhost:$PORT_TO_USE" >/dev/null 2>&1 || true
else
    xdg-open "http://localhost:$PORT_TO_USE" >/dev/null 2>&1 || true
fi

echo ""
echo -e "${CYAN}Press Ctrl+C to stop Elenchus${RESET}"
echo ""

wait "$BACKEND_PID"
