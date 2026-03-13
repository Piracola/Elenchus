#!/bin/bash

#
# Elenchus AI Debate Framework - 一键启动脚本
# 适用于 macOS / Linux
#
# 用法:
#   ./start.sh              # 完整启动
#   ./start.sh --skip-install  # 跳过依赖安装
#   ./start.sh --backend-only  # 仅启动后端
#   ./start.sh --frontend-only # 仅启动前端
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
echo -e "${BOLD}   AI Debate Framework - 一键启动脚本${RESET}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

PIDS=()

cleanup() {
    echo ""
    print_info "正在停止服务..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    print_success "服务已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM

print_header "Step 1/5: 环境检查"

CHECKS_PASSED=true

echo "检查 Python..."
if check_command python3; then
    PY_VERSION=$(get_python_version)
    if version_ge "$PY_VERSION" "3.10.0"; then
        print_success "Python $PY_VERSION 已安装"
    else
        print_error "Python 版本过低 ($PY_VERSION)，需要 3.10+"
        CHECKS_PASSED=false
    fi
else
    print_error "未找到 Python3，请先安装 Python 3.10+"
    CHECKS_PASSED=false
fi

if [[ "$FRONTEND_ONLY" != true ]]; then
    echo "检查 pip..."
    if check_command pip3 || check_command pip; then
        print_success "pip 已安装"
    else
        print_error "未找到 pip"
        CHECKS_PASSED=false
    fi
fi

if [[ "$BACKEND_ONLY" != true ]]; then
    echo "检查 Node.js..."
    if check_command node; then
        NODE_VERSION=$(get_node_version)
        if version_ge "$NODE_VERSION" "18.0.0"; then
            print_success "Node.js $NODE_VERSION 已安装"
        else
            print_warning "Node.js 版本较低 ($NODE_VERSION)，建议 18.0+"
        fi
    else
        print_error "未找到 Node.js，请先安装 Node.js 18+"
        CHECKS_PASSED=false
    fi

    echo "检查 npm..."
    if check_command npm; then
        print_success "npm 已安装"
    else
        print_error "未找到 npm"
        CHECKS_PASSED=false
    fi
fi

if [[ "$CHECKS_PASSED" != true ]]; then
    echo ""
    print_error "环境检查失败，请安装缺失的依赖后重试"
    echo ""
    echo "推荐安装方式："
    echo "  Python:  https://www.python.org/downloads/"
    echo "  Node.js: https://nodejs.org/"
    if [[ "$(uname)" == "Darwin" ]]; then
        echo ""
        echo "  macOS 用户可使用 Homebrew:"
        echo "    brew install python3 node"
    elif [[ "$(uname)" == "Linux" ]]; then
        echo ""
        echo "  Linux 用户可使用包管理器:"
        echo "    Ubuntu/Debian: sudo apt install python3 python3-pip nodejs npm"
        echo "    CentOS/RHEL:   sudo yum install python3 python3-pip nodejs npm"
    fi
    echo ""
    read -p "按 Enter 键退出"
    exit 1
fi

print_success "所有环境检查通过"

if [[ "$FRONTEND_ONLY" != true ]]; then
    print_header "Step 2/5: 后端环境配置"

    cd "$BACKEND_DIR"

    if [[ ! -d "$VENV_DIR" ]]; then
        print_info "创建 Python 虚拟环境..."
        python3 -m venv venv
        if [[ $? -eq 0 ]]; then
            print_success "虚拟环境创建成功"
        else
            print_error "虚拟环境创建失败"
            exit 1
        fi
    else
        print_success "虚拟环境已存在"
    fi

    print_info "激活虚拟环境..."
    source "$VENV_DIR/bin/activate"

    if [[ "$SKIP_INSTALL" != true ]]; then
        print_info "安装后端依赖..."
        pip install -r requirements.txt --quiet --disable-pip-version-check 2>/dev/null || true
        print_success "后端依赖安装完成"
    else
        print_info "跳过依赖安装"
    fi

    ENV_FILE="$BACKEND_DIR/.env"
    ENV_EXAMPLE="$BACKEND_DIR/.env.example"
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$ENV_EXAMPLE" ]]; then
            print_info "创建 .env 配置文件..."
            cp "$ENV_EXAMPLE" "$ENV_FILE"
            print_success ".env 文件已创建"
            print_warning "请编辑 backend/.env 文件配置您的 API Keys"
        fi
    else
        print_success ".env 配置文件已存在"
    fi

    # ── Encryption key setup ──────────────────────────────────────────
    if ! grep -q "^PROVIDERS_ENCRYPTION_KEY=" "$ENV_FILE" 2>/dev/null || \
       grep -q "^PROVIDERS_ENCRYPTION_KEY=your-generated-fernet-key-here" "$ENV_FILE" 2>/dev/null; then
        print_info "生成 Provider 加密主密钥..."
        FERNET_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
        if grep -q "^PROVIDERS_ENCRYPTION_KEY=" "$ENV_FILE" 2>/dev/null; then
            sed -i "s|^PROVIDERS_ENCRYPTION_KEY=.*|PROVIDERS_ENCRYPTION_KEY=$FERNET_KEY|" "$ENV_FILE"
        else
            echo "PROVIDERS_ENCRYPTION_KEY=$FERNET_KEY" >> "$ENV_FILE"
        fi
        print_success "加密主密钥已写入 .env"
    else
        print_success "加密主密钥已配置"
    fi

    # ── Migrate existing plaintext keys ──────────────────────────────
    PROVIDERS_JSON="$BACKEND_DIR/data/providers.json"
    if [[ -f "$PROVIDERS_JSON" ]]; then
        print_info "检查并加密 providers.json 中的明文密钥..."
        python3 "$BACKEND_DIR/migrate_encrypt_providers.py" 2>/dev/null && \
            print_success "providers.json 密钥加密完成" || \
            print_warning "providers.json 迁移跳过（可能已加密）"
    fi

    cd "$SCRIPT_DIR"
fi

if [[ "$BACKEND_ONLY" != true ]]; then
    print_header "Step 3/5: 前端依赖配置"

    cd "$FRONTEND_DIR"

    if [[ ! -d "node_modules" ]] || [[ "$SKIP_INSTALL" != true ]]; then
        if [[ "$SKIP_INSTALL" != true ]]; then
            print_info "安装前端依赖..."
            npm install --silent 2>/dev/null || true
            print_success "前端依赖安装完成"
        else
            print_info "跳过依赖安装"
        fi
    else
        print_success "node_modules 已存在"
    fi

    cd "$SCRIPT_DIR"
fi

print_header "Step 4/5: 启动服务"

if [[ "$FRONTEND_ONLY" != true ]]; then
    print_info "启动后端服务 (端口 8000)..."
    cd "$BACKEND_DIR"
    source "$VENV_DIR/bin/activate"
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!
    PIDS+=($BACKEND_PID)
    cd "$SCRIPT_DIR"
    sleep 2
    print_success "后端服务已启动 (PID: $BACKEND_PID)"
fi

if [[ "$BACKEND_ONLY" != true ]]; then
    print_info "启动前端服务 (端口 5173)..."
    cd "$FRONTEND_DIR"
    npm run dev &
    FRONTEND_PID=$!
    PIDS+=($FRONTEND_PID)
    cd "$SCRIPT_DIR"
    sleep 2
    print_success "前端服务已启动 (PID: $FRONTEND_PID)"
fi

print_header "Step 5/5: 启动完成"

echo ""
echo -e "${BOLD}${GREEN}  Elenchus 已成功启动！${RESET}"
echo ""
echo -e "  ${CYAN}服务地址:${RESET}"
if [[ "$FRONTEND_ONLY" != true ]]; then
    echo -e "    后端 API:  ${BOLD}http://localhost:8000${RESET}"
    echo -e "    API 文档:  ${BOLD}http://localhost:8000/docs${RESET}"
fi
if [[ "$BACKEND_ONLY" != true ]]; then
    echo -e "    前端界面:  ${BOLD}http://localhost:5173${RESET}"
fi
echo ""

if [[ "$FRONTEND_ONLY" != true ]]; then
    echo -e "  ${YELLOW}提示: 首次使用请配置 backend/.env 文件中的 API Keys${RESET}"
fi
echo ""

if [[ "$BACKEND_ONLY" != true ]]; then
    print_info "正在打开浏览器..."
    sleep 3
    if [[ "$(uname)" == "Darwin" ]]; then
        open "http://localhost:5173" 2>/dev/null || true
    elif [[ "$(uname)" == "Linux" ]]; then
        xdg-open "http://localhost:5173" 2>/dev/null || true
    fi
fi

echo ""
echo -e "  ${CYAN}按 Ctrl+C 停止所有服务${RESET}"
echo ""

wait
