# CI 失败排查清单

这份清单只做一件事：当 GitHub Actions 变红时，帮我们最快定位问题是在前端、后端依赖、还是发布构建链路。

## 1. 先看是哪一个 job 红了

- `Frontend quality` / `Frontend quality gate`
  说明问题大概率在 `frontend/`，优先看 `npm ci`、`npm run lint`、`npm run test:run`、`npm run build`
- `Backend tests` / `Backend pytest gate`
  说明问题大概率在 `backend/` 的 `uv sync --frozen --group dev` 或 `pytest`
- `Build Windows Portable EXE`
  说明前后端基础质量门已经过了，优先看 `uv sync --project backend --frozen --no-default-groups --group build`、smoke test、PyInstaller 打包

## 2. 本地最快复现命令

### 前端红灯

```bash
npm --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend run test:run
npm --prefix frontend run build
```

### 后端测试红灯

```bash
uv lock --check --directory backend
uv sync --project backend --frozen --group dev
npm run test:backend
```

### Windows 发布构建红灯

```bash
uv sync --project backend --frozen --no-default-groups --group build
uv run --project backend --frozen --no-default-groups --group build python scripts/smoke_test_release_backend.py
pwsh -File .\build.ps1 -SkipFrontendInstall -SkipSmokeTest
```

如果要完整验证发布链路，再去掉 `-SkipSmokeTest`。

## 3. 最常见的失败类型

### `uv lock --check` 失败

说明：

- `backend/pyproject.toml` 改了，但 `backend/uv.lock` 没同步

处理：

```bash
uv lock --directory backend --python 3.11
```

然后重新跑：

```bash
uv sync --project backend --frozen --group dev
```

### `uv sync --frozen` 失败

先看报错属于哪一类：

- 依赖解析冲突：通常是 `pyproject.toml` 里的版本范围互相打架
- Python 版本不匹配：通常是本地解释器不是 3.11 主线
- 上游包下载异常：先判断是不是临时网络问题

优先检查：

- [backend/pyproject.toml](/I:/JBCode/AI%20Tools/Elenchus/backend/pyproject.toml)
- [backend/uv.lock](/I:/JBCode/AI%20Tools/Elenchus/backend/uv.lock)
- [backend/.python-version](/I:/JBCode/AI%20Tools/Elenchus/backend/.python-version)

### GitHub Actions 里出现 `No GitHub Actions cache found for key`

说明：

- 这通常不是故障
- 新分支首次运行、`uv.lock` 刚变、或者 cache key 变化时，第一次 miss 是正常的

只有在连续多次运行都 miss，而且安装时间明显异常时，才值得再看缓存配置。

### 后端测试通过，但 `Build Windows Portable EXE` 失败

优先怀疑：

- `build` 组缺依赖
- frontend 产物没生成
- smoke test 通过但 PyInstaller 打包规则没跟上

优先检查：

- `.github/workflows/build-portable-release.yml`
- [build.ps1](/I:/JBCode/AI%20Tools/Elenchus/build.ps1)
- [scripts/build_pyinstaller_release.py](/I:/JBCode/AI%20Tools/Elenchus/scripts/build_pyinstaller_release.py)
- [scripts/smoke_test_release_backend.py](/I:/JBCode/AI%20Tools/Elenchus/scripts/smoke_test_release_backend.py)

## 4. 当日志里出现这些信号时，先看哪里

### `pytest` 找不到测试文件

优先检查调用路径是不是把 `backend/` 前缀重复带进去了。

推荐直接用：

```bash
npm run test:backend
```

或者：

```bash
uv run --project backend --frozen --group dev pytest tests/...
```

### smoke test 报前端资源不存在

优先检查：

```bash
npm --prefix frontend run build
```

确认 `frontend/dist/index.html` 已生成。

### PyInstaller 缺模块

优先检查是不是忘了用 build 组同步：

```bash
uv sync --project backend --frozen --no-default-groups --group build
```

然后再看：

- `packaging/elenchus.spec`
- `scripts/build_pyinstaller_release.py`

## 5. 最小排查顺序

如果你时间很紧，就按这个顺序走：

1. 看红的是前端、后端测试，还是 Windows 构建
2. 先跑对应的本地最短复现命令
3. 如果是后端，先跑 `uv lock --check --directory backend`
4. 如果是发布构建，先跑 build 组同步，再跑 smoke test
5. 只有复现不出来时，再去翻 GitHub Actions 全日志

## 6. 相关入口

- [快速开始](./getting-started.md)
- [开发指南](./development.md)
- [Python 依赖迁移计划](./dependency-migration-plan.md)
