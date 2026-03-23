# Elenchus Backend

这个目录包含 Elenchus 的 FastAPI、LangGraph、WebSocket 和运行时编排实现。

## 常用命令

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
pytest
```

## 继续阅读

- [后端开发指南](../docs/guides/backend-development.md)
- [系统架构总览](../docs/architecture.md)
- [运行时与回放](../docs/runtime.md)
