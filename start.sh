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
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

SKIP_INSTALL=false
BACKEND_ONLY=false
FRONTEND_ONLY=false

for arg in "$@"; do
    case $arg in
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
    esac
done

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

get_python_version() {
    python3 --version 2>&1 | awk '{print $2}'
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

clear
echo ""
echo -e "${BOLD}${CYAN}   __                                         ${RESET}"
echo -e "${BOLD}${CYAN}  /  \___  ___  __ _ _   _  ___ _ __   ___ ___ ${RESET}"
echo -e "${BOLD}${CYAN} / /\ / _ \/ __|/ _\` | | | |/ _ \ '_ \ / __/ _ \\${RESET}"
echo -e "${BOLD}${CYAN}/ /_//  __/\__ \ (_| | |_| |  __/ | | | (_|  __/${RESET}"
echo -e "${BOLD}${CYAN},___/ \___||___/\__, |\__,_|\___|_| |_|\___\___|${RESET}"
echo -e "${BOLD}${CYAN}                  |_|${RESET}"
echo ""
echo -e "${BOLD}   AI Debate Framework - One-Click Start Script${RESET}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

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

print_header "Step 1/5: Environment Check"

CHECKS_PASSED=true

echo "Checking Python..."
if check_command python3; then
    PY_VERSION=$(get_python_version)
    if version_ge "$PY_VERSION" "3.10.0"; then
        print_success "Python $PY_VERSION installed"
    else
        print_error "Python version too low ($PY_VERSION), requires 3.10+"
        CHECKS_PASSED=false
    fi
else
    print_error "Python3 not found, please install Python 3.10+"
    CHECKS_PASSED=false
fi

if [[ "$FRONTEND_ONLY" != true ]]; then
    echo "Checking pip..."
    if check_command pip3 || check_command pip; then
        print_success "pip installed"
    else
        print_error "pip not found"
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

if [[ "$CHECKS_PASSED" != true ]]; then
    echo ""
    print_error "Environment check failed, please install missing dependencies"
    echo ""
    echo "Recommended installation:"
    echo "  Python:  https://www.python.org/downloads/"
    echo "  Node.js: https://nodejs.org/"
    if [[ "$(uname)" == "Darwin" ]]; then
        echo ""
        echo "  macOS users can use Homebrew:"
        echo "    brew install python3 node"
    elif [[ "$(uname)" == "Linux" ]]; then
        echo ""
        echo "  Linux users can use package manager:"
        echo "    Ubuntu/Debian: sudo apt install python3 python3-pip nodejs npm"
        echo "    CentOS/RHEL:   sudo yum install python3 python3-pip nodejs npm"
    fi
    exit 1
fi

if [[ "$FRONTEND_ONLY" != true ]]; then
    print_header "Step 2/5: Backend Setup"

    cd "$BACKEND_DIR"

    if [[ ! -d "$VENV_DIR" ]]; then
        print_info "Creating Python virtual environment..."
        python3 -m venv "$VENV_DIR"
        print_success "Virtual environment created"
    else
        print_success "Virtual environment already exists"
    fi

    print_info "Activating virtual environment..."
    source "$VENV_DIR/bin/activate"

    if [[ "$SKIP_INSTALL" != true ]]; then
        print_info "Installing backend dependencies..."
        pip install -r requirements.txt --quiet 2>/dev/null || true
        print_success "Backend dependencies installed"
    else
        print_info "Skipping dependency installation"
    fi

    ENV_FILE="$BACKEND_DIR/.env"
    ENV_EXAMPLE="$BACKEND_DIR/.env.example"
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$ENV_EXAMPLE" ]]; then
            print_info "Creating .env config file..."
            cp "$ENV_EXAMPLE" "$ENV_FILE"
            print_success ".env file created"
            print_warning "Please edit backend/.env to configure your API Keys"
        fi
    else
        print_success ".env config file already exists"
    fi

    cd "$SCRIPT_DIR"
fi

if [[ "$BACKEND_ONLY" != true ]]; then
    print_header "Step 3/5: Frontend Setup"

    cd "$FRONTEND_DIR"

    if [[ ! -d "node_modules" ]] || [[ "$SKIP_INSTALL" != true ]]; then
        if [[ "$SKIP_INSTALL" != true ]]; then
            print_info "Installing frontend dependencies..."
            npm install --silent 2>/dev/null || true
            print_success "Frontend dependencies installed"
        else
            print_info "Skipping dependency installation"
        fi
    else
        print_success "node_modules already exists"
    fi

    cd "$SCRIPT_DIR"
fi

print_header "Step 4/5: Installing Process Manager"

cd "$SCRIPT_DIR"

if [[ ! -d "node_modules" ]]; then
    print_info "Installing concurrently for unified process management..."
    npm install --silent 2>/dev/null || true
    print_success "Process manager installed"
else
    print_success "Process manager already installed"
fi

BACKEND_PORT=8001

print_header "Step 5/5: Starting Services"

echo ""
echo -e "${BOLD}${GREEN}  Elenchus Starting...${RESET}"
echo ""
echo -e "  ${CYAN}Service URLs:${RESET}"
if [[ "$FRONTEND_ONLY" != true ]]; then
    echo -e "    Backend API:  ${BOLD}http://localhost:$BACKEND_PORT${RESET}"
    echo -e "    API Docs:     ${BOLD}http://localhost:$BACKEND_PORT/docs${RESET}"
fi
if [[ "$BACKEND_ONLY" != true ]]; then
    echo -e "    Frontend UI:  ${BOLD}http://localhost:5173${RESET}"
fi
echo ""

if [[ "$FRONTEND_ONLY" != true ]]; then
    echo -e "  ${YELLOW}Tip: First time? Configure API Keys in backend/.env${RESET}"
fi
echo ""

if [[ "$BACKEND_ONLY" != true ]]; then
    echo "VITE_BACKEND_PORT=$BACKEND_PORT" > "$FRONTEND_DIR/.env"
    print_success "Frontend .env configured with port $BACKEND_PORT"
    print_info "Opening browser..."
    sleep 5
    if [[ "$(uname)" == "Darwin" ]]; then
        open "http://localhost:5173" 2>/dev/null || true
    elif [[ "$(uname)" == "Linux" ]]; then
        xdg-open "http://localhost:5173" 2>/dev/null || true
    fi
fi

echo ""
echo -e "  ${CYAN}Press Ctrl+C to stop all services${RESET}"
echo ""

cd "$SCRIPT_DIR"

if [[ "$BACKEND_ONLY" == true ]]; then
    npm run dev:backend:unix
elif [[ "$FRONTEND_ONLY" == true ]]; then
    npm run dev:frontend
else
    npm run dev
fi
