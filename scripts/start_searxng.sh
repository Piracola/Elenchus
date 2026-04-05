#!/bin/bash
# SearXNG Management Script for Elenchus
# Handles SearXNG Docker container lifecycle: start, stop, status, health check

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

print_ok() {
    echo -e "${GREEN}[OK]${RESET} $1"
}

print_err() {
    echo -e "${RED}[ERROR]${RESET} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${RESET} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${RESET} $1"
}

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SEARXNG_DIR="$ROOT_DIR/searxng"
DOCKER_COMPOSE_FILE="$SEARXNG_DIR/docker-compose.yml"
SEARXNG_DATA_DIR="$ROOT_DIR/searxng-data"
SEARXNG_URL="http://localhost:8080"

# Default parameters
ACTION="${1:-start}"
HEALTH_CHECK_TIMEOUT=60
HEALTH_CHECK_INTERVAL=3

test_docker_installed() {
    if command -v docker &> /dev/null; then
        return 0
    else
        return 1
    fi
}

test_docker_compose_installed() {
    if docker compose version &> /dev/null 2>&1; then
        return 0
    elif command -v docker-compose &> /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

test_searxng_running() {
    if docker ps --filter "name=elenchus-searxng" --format "{{.Names}}" 2>/dev/null | grep -q "elenchus-searxng"; then
        return 0
    else
        return 1
    fi
}

wait_searxng_healthy() {
    local timeout=${1:-$HEALTH_CHECK_TIMEOUT}
    local interval=${2:-$HEALTH_CHECK_INTERVAL}
    
    print_info "Waiting for SearXNG to become healthy..."
    local start_time=$(date +%s)
    local healthy=false
    
    while [ $(( $(date +%s) - start_time )) -lt $timeout ]; do
        if curl -s -m 2 "$SEARXNG_URL/healthz" &> /dev/null; then
            healthy=true
            break
        fi
        
        sleep $interval
        echo -n "."
    done
    
    echo ""
    
    if [ "$healthy" = true ]; then
        print_ok "SearXNG is healthy and ready at $SEARXNG_URL"
        return 0
    else
        print_err "SearXNG failed to become healthy within ${timeout}s"
        return 1
    fi
}

start_searxng() {
    if ! test_docker_installed; then
        print_err "Docker is not installed or not in PATH"
        echo ""
        print_info "Please install Docker: https://docs.docker.com/engine/install/"
        return 1
    fi
    
    if ! test_docker_compose_installed; then
        print_err "Docker Compose is not available"
        return 1
    fi
    
    if test_searxng_running; then
        print_ok "SearXNG is already running"
        return 0
    fi
    
    print_info "Starting SearXNG container..."
    
    if [ ! -d "$SEARXNG_DATA_DIR" ]; then
        print_info "Creating SearXNG data directory: $SEARXNG_DATA_DIR"
        mkdir -p "$SEARXNG_DATA_DIR"
    fi
    
    cd "$SEARXNG_DIR"
    
    if docker compose -f "$DOCKER_COMPOSE_FILE" up -d 2>&1; then
        print_ok "SearXNG container started"
        wait_searxng_healthy
        return $?
    else
        print_err "Failed to start SearXNG container"
        return 1
    fi
}

stop_searxng() {
    if ! test_searxng_running; then
        print_info "SearXNG is not running"
        return 0
    fi
    
    print_info "Stopping SearXNG container..."
    
    cd "$SEARXNG_DIR"
    
    if docker compose -f "$DOCKER_COMPOSE_FILE" down 2>&1; then
        print_ok "SearXNG container stopped"
        return 0
    else
        print_err "Failed to stop SearXNG container"
        return 1
    fi
}

show_searxng_status() {
    print_info "SearXNG Status:"
    echo ""
    
    if test_searxng_running; then
        print_ok "Status: ${BOLD}RUNNING${RESET}"
        echo "  URL: $SEARXNG_URL"
        
        echo ""
        docker ps --filter "name=elenchus-searxng" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
    else
        print_err "Status: ${BOLD}STOPPED${RESET}"
    fi
    
    echo ""
    echo "Data directory: $SEARXNG_DATA_DIR"
    if [ -d "$SEARXNG_DATA_DIR" ]; then
        local size=$(du -sh "$SEARXNG_DATA_DIR" 2>/dev/null | cut -f1)
        echo "Data size: $size"
    else
        echo "Data size: 0 MB (not created yet)"
    fi
}

test_searxng_health() {
    print_info "Checking SearXNG health..."
    
    if curl -s -m 5 -f "$SEARXNG_URL/healthz" &> /dev/null; then
        print_ok "SearXNG is healthy"
        return 0
    else
        print_err "SearXNG is not reachable"
        return 1
    fi
}

show_searxng_logs() {
    if ! test_searxng_running; then
        print_err "SearXNG is not running"
        return 1
    fi
    
    print_info "Showing SearXNG logs (Ctrl+C to exit)..."
    cd "$SEARXNG_DIR"
    docker compose -f "$DOCKER_COMPOSE_FILE" logs -f --tail=100
}

clean_searxng_data() {
    print_warn "This will remove all SearXNG data in: $SEARXNG_DATA_DIR"
    echo ""
    
    read -p "Are you sure you want to clean SearXNG data? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        print_info "Operation cancelled"
        return
    fi
    
    if test_searxng_running; then
        print_info "Stopping SearXNG first..."
        stop_searxng
    fi
    
    if [ -d "$SEARXNG_DATA_DIR" ]; then
        print_info "Removing data directory..."
        rm -rf "$SEARXNG_DATA_DIR"
        print_ok "SearXNG data cleaned"
    else
        print_info "No data directory found"
    fi
}

# Main execution
echo ""
echo -e "${BOLD}${CYAN}   SearXNG Management - Elenchus${RESET}"
echo ""

case "$ACTION" in
    start)
        start_searxng
        exit $?
        ;;
    stop)
        stop_searxng
        exit $?
        ;;
    restart)
        stop_searxng
        sleep 2
        start_searxng
        exit $?
        ;;
    status)
        show_searxng_status
        ;;
    health)
        test_searxng_health
        exit $?
        ;;
    logs)
        show_searxng_logs
        ;;
    clean)
        clean_searxng_data
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|health|logs|clean}"
        exit 1
        ;;
esac
