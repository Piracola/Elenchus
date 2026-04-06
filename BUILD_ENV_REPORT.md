# CI 构建与发行版构建环境对比报告

## 📊 环境对比

### CI 工作流 (ci.yml)

| 组件 | CI 环境 | 本地环境 | 状态 |
|------|---------|---------|------|
| **操作系统** | Ubuntu 24.04 LTS | Windows 10/11 | ⚠️ 不同 |
| **Node.js** | 20.x | 24.14.1 | ⚠️ 不同 (本地更新) |
| **npm** | (随Node 20) | 11.11.0 | ✅ 兼容 |
| **Python** | 3.11.x | 3.13.12 | ⚠️ 不同 (本地更新) |
| **pip** | (随Python 3.11) | 25.3 | ✅ 兼容 |

### 发行版构建工作流 (build-portable-release.yml)

| 组件 | CI 环境 | 本地环境 | 状态 |
|------|---------|---------|------|
| **操作系统** | Windows Latest (Server 2022) | Windows 10/11 | ✅ 相同 |
| **Node.js** | 20.x | 24.14.1 | ⚠️ 不同 (本地更新) |
| **Python** | 3.11.x | 3.13.12 | ⚠️ 不同 (本地更新) |

---

## ⚠️ 潜在风险

### 1. Node.js 版本差异 (20 → 24)

**影响**: 
- Node.js 24 是最新版本，可能包含 breaking changes
- CI 使用的 actions (checkout@v4, setup-node@v4) 在 Node 20 上运行
- **2026年6月2日**后，GitHub Actions 将强制使用 Node.js 24
- **2026年9月16日**后，Runner 将移除 Node.js 20

**建议**: 
```yaml
# 在 CI 工作流中添加环境变量升级到 Node 24
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
```

### 2. Python 版本差异 (3.11 → 3.13)

**影响**:
- Python 3.13 移除了部分已弃用的 API
- 某些依赖包可能尚未完全支持 3.13
- 发行版构建使用 PyInstaller，版本兼容性需验证

**建议**:
- 在本地安装 Python 3.11 用于测试
- 或使用 pyenv-win 管理多版本 Python

### 3. 操作系统差异 (Linux CI vs Windows 本地)

**影响**:
- CI 在 Ubuntu 上运行前端/后端测试
- 发行版构建在 Windows 上运行
- 路径分隔符、行尾符可能不同
- 某些依赖可能有平台特定行为

---

## ✅ 当前构建状态

### CI 工作流
- ✅ **前端质量检查**: 通过 (46s)
  - Lint: ✅
  - 测试: ✅ (136 tests)
  - 构建: ✅
- ✅ **后端测试**: 通过 (45s)

### 发行版构建工作流
- 最近一次运行: 未知 (需要检查 GitHub Releases)
- 构建步骤:
  1. 安装前端依赖 → 构建前端
  2. 安装后端依赖 + PyInstaller
  3. 冒烟测试 (smoke_test_release_backend.py)
  4. 打包便携式 EXE (build_pyinstaller_release.py)
  5. 上传到 GitHub Release

---

## 🔧 建议的改进

### 1. 更新 CI 工作流到 Node.js 24

```yaml
# .github/workflows/ci.yml
- name: Set up Node.js
  uses: actions/setup-node@v4
  with:
    node-version: "24"  # 从 20 升级到 24
    cache: npm
    cache-dependency-path: frontend/package-lock.json
```

### 2. 统一 Python 版本

**选项 A**: 更新 CI 使用 Python 3.13
```yaml
# .github/workflows/ci.yml
- name: Set up Python
  uses: actions/setup-python@v5
  with:
    python-version: "3.13"  # 从 3.11 升级到 3.13
```

**选项 B**: 本地降级到 Python 3.11
- 安装 Python 3.11 用于项目测试
- 使用虚拟环境隔离

### 3. 添加本地构建验证脚本

创建 `scripts/validate-local-build.sh`:
```bash
#!/bin/bash
# 验证本地构建是否与 CI 一致

echo "检查 Node.js 版本..."
node_version=$(node -v | cut -d'.' -f1 | cut -d'v' -f2)
if [ "$node_version" != "20" ]; then
  echo "⚠️ 警告: CI 使用 Node.js 20，当前使用 Node.js $(node -v)"
fi

echo "检查 Python 版本..."
python_version=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
if [ "$python_version" != "3.11" ]; then
  echo "⚠️ 警告: CI 使用 Python 3.11，当前使用 Python $python_version"
fi

echo "运行前端测试..."
cd frontend && npm run test:run

echo "运行后端测试..."
cd ../backend && pytest tests
```

---

## 📝 结论

当前构建状态:
- ✅ CI 构建成功 (使用 Node 20 + Python 3.11 on Ubuntu)
- ⚠️ 本地环境使用更新的版本 (Node 24 + Python 3.13)
- ⚠️ 建议在 CI 移除 Node 20 前升级工作流配置
- ⚠️ 建议在本地测试时尽量使用与 CI 一致的版本

**优先级行动项**:
1. [ ] 升级 CI 工作流到 Node.js 24 (截止日期: 2026年6月2日)
2. [ ] 验证 Python 3.13 与所有后端依赖的兼容性
3. [ ] 考虑在发行版构建中也更新到 Python 3.13
4. [ ] 添加自动化检查以防止版本不匹配导致的构建失败
