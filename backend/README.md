# Elenchus Backend

后端技术栈：
- FastAPI
- LangGraph
- SQLAlchemy Async + SQLite
- WebSocket

## 本地开发启动

### Windows PowerShell
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### macOS / Linux
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## 运行时数据目录（统一）

后端运行时不再依赖 `backend/.env` 与 `backend/elenchus.db`。
默认统一写入仓库根目录 `runtime/`：

- `runtime/backend/.env`
- `runtime/backend/config.yaml`
- `runtime/elenchus.db`
- `runtime/logs/`
- `runtime/data/log_config.json`

可通过环境变量覆盖：
- `ELENCHUS_RUNTIME_DIR=<自定义目录>`

## 环境变量

模板文件：`backend/.env.example`

常用变量：
```env
ELENCHUS_ENCRYPTION_KEY=
SEARXNG_BASE_URL=http://localhost:8080
TAVILY_API_KEY=
DATABASE_URL=sqlite+aiosqlite:///./elenchus.db
HOST=0.0.0.0
PORT=8001
DEBUG=false
```

说明：
- `ELENCHUS_ENCRYPTION_KEY` 首次启动会自动生成并写入 `runtime/backend/.env`
- `DATABASE_URL` 使用相对 SQLite 路径时，会自动归一化到 `runtime/` 下

## 测试

安装测试依赖：
```bash
pip install -r requirements-dev.txt
```

运行测试：
```bash
pytest
```

## 关键入口

- 应用入口：[backend/app/main.py](./app/main.py)
- 配置加载：[backend/app/config.py](./app/config.py)
- 运行时路径：[backend/app/runtime_paths.py](./app/runtime_paths.py)
- 打包入口：[backend/run_packaged.py](./run_packaged.py)

## 上一轮前端性能优化说明

这一轮优化主要针对前端在**长会话、实时事件流、回放观察器同时存在**时容易出现的卡顿、重渲染过多和历史记录越积越重的问题。整体思路不是只优化某一个组件，而是同时从**状态订阅、事件缓存、聊天渲染、时间线展示、观察器挂载策略**几条链路一起收缩无效工作量。

### 1. 前台优先的 Zustand 订阅，减少后台标签页空转

本轮新增了 `useForegroundDebateSelector`，用于替代直接在多个重组件里订阅完整 Store 的做法。它的策略是：只有文档处于前台可见状态时，才把最新状态推进到组件层；页面被切到后台时，组件不会因为事件流继续到达而持续重渲染。

配合这项改动：

- `debateStore` 新增了 `isDocumentVisible` 与 `visibilityResumeToken`
- `useDebateWebSocket` 统一监听 `visibilitychange` 与 `focus`
- WebSocket 回调统一通过 `useDebateStore.getState()` 读取最新状态，避免闭包陈旧导致 effect 重绑

涉及文件：

- `frontend/src/hooks/useForegroundDebateSelector.ts`
- `frontend/src/hooks/useDebateWebSocket.ts`
- `frontend/src/stores/debateStore.ts`
- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/components/chat/ExecutionTimeline.tsx`
- `frontend/src/components/chat/LiveGraph.tsx`
- `frontend/src/components/chat/MemoryPanel.tsx`

预期收益：

- 页面切到后台后不再持续消耗渲染预算
- 高频运行事件不会把不可见页面也拖进更新链路
- 回到前台后再统一恢复观察视图，长时间挂页更稳

### 2. 运行事件在 Store 层统一裁剪和派生，避免组件重复处理

此前运行事件会不断追加，随着会话拉长，组件层需要反复判断“哪些事件应该显示”“回放焦点落在哪一条”“历史是否还能继续向前加载”。这一轮把这类逻辑前移到 Store 内统一处理。

核心变化包括：

- `debateStore` 新增 `visibleRuntimeEvents`
- `applyRuntimeEvent` 内部完成去重、`seq` 校验、`pong` 忽略与上限裁剪
- 超过 `MAX_RUNTIME_EVENTS` 后只保留最近窗口
- 裁剪后同步修正 `replayCursor`、`focusedRuntimeEventId`、`hasOlderRuntimeEvents`
- 切换 session 时立即清空旧会话的运行时缓存

涉及文件：

- `frontend/src/stores/debateStore.ts`
- `frontend/src/utils/replay.ts`
- `frontend/src/utils/debateStoreHelpers.ts`

预期收益：

- 组件不需要各自维护一套事件切片逻辑
- 长会话下运行时内存增长更可控
- 回放光标与聚焦事件更稳定，不容易在裁剪后失效

### 3. 对话分组逻辑改成可增量复用，降低长聊天历史的重算成本

`ChatPanel` 最重的工作之一，是把 `dialogue_history`、组内讨论、陪审团讨论和回放焦点拼成最终展示行。此前如果每次新增消息都从头整理，随着历史增长，分组本身会逐渐成为额外负担。

这轮改动新增了 `buildTranscriptViewModel()`，把聊天展示需要的过滤、分组、聚焦和附加洞察整理到独立 ViewModel 层；同时把 `groupDialogue()` 扩展成支持增量追加的 `buildDialogueGroupingState()`，当历史只是在尾部增长时，可以复用上一次的分组状态继续往后追加，而不是每次全量重建。

其中：

- 裁判评分与辩手发言的配对改成基于 pending map 的线性处理
- `sophistry_round_report` / `sophistry_final_report` 也走统一匹配通道
- 回放模式下只会对可见事件窗口内的对话历史做过滤和映射

涉及文件：

- `frontend/src/utils/groupDialogue.ts`
- `frontend/src/utils/transcriptViewModel.ts`
- `frontend/src/components/ChatPanel.tsx`

预期收益：

- 会话越长，分组重算的额外成本越低
- 实时消息追加时更接近“增量更新”而不是“全量回放”
- 回放和实时态共享同一套稳定的展示模型

### 4. 聊天区增加历史窗口与可变高度虚拟窗口，控制 DOM 规模

聊天记录本身是最容易随着时间线性膨胀的区域。这一轮在 `ChatPanel` 中同时引入了**历史窗口化**和**可变高度虚拟窗口**两层优化。

具体做法：

- 默认只渲染最近一段历史行，而不是整段会话一次性全挂到 DOM
- 向上滚动接近顶部时，再按批次补入更早的历史内容
- 补入前记录旧 `scrollHeight`，补入后按高度差修正 `scrollTop`，防止视口跳动
- 使用 `computeVariableVirtualWindow()`，只渲染当前视口附近的聊天行
- 真实行高通过 `ResizeObserver` 回填，未测量阶段使用估算高度兜底
- 回放聚焦某个事件时，会自动把对应历史行纳入当前窗口，避免“事件选中了，但消息不在列表里”

涉及文件：

- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/utils/chatHistoryWindow.ts`
- `frontend/src/utils/virtualWindow.ts`

预期收益：

- 长对话下首屏压力更小
- 滚动更加平滑，尤其是往上追历史时不容易卡顿或跳屏
- DOM 节点数量不会随着历史长度无限线性增长

### 5. 执行时间线改成延迟搜索、分页尾窗和按需补历史

`ExecutionTimeline` 既要承担实时观察，也要承担回放入口。当事件数量上来以后，搜索、选中与滚动同步都可能变成额外开销。这轮的处理重点是把时间线从“完整列表直接渲染”改成“索引 + 延迟过滤 + 尾部分页窗口”的模式。

关键改动包括：

- 搜索词通过 `useDeferredValue` 延迟消费，优先保证输入框响应
- 先建立搜索索引，再做类型过滤与关键字过滤
- 最终只渲染最近分页窗口，而不是把所有匹配项一次性挂载
- “加载更早事件”先扩本地分页窗口，本地不够时再调用后端 `beforeSeq` 分页接口
- 选中事件、回放游标、聚焦事件三者之间的同步逻辑做了统一

涉及文件：

- `frontend/src/components/chat/ExecutionTimeline.tsx`
- `frontend/src/utils/timelineWindow.ts`
- `frontend/src/stores/debateStore.ts`

预期收益：

- 大事件集下搜索输入更跟手
- 时间线渲染成本更可控
- 回放和历史加载时不需要一次性把完整事件列表都压到页面上

### 6. 运行观察器改成“当前标签页按需挂载”，隐藏面板不继续算图

运行观察器本身集成了时间线、流程图和记忆面板，这三个区域都属于相对重的 UI。如果在折叠状态或标签页不可见时依然持续计算，会和主聊天区争抢同一帧的计算预算。

因此本轮改动把观察器拆成更明确的按需挂载模式：

- `RuntimeInspector` 同一时间只挂载当前激活 tab
- 未展开状态下只显示轻量摘要信息
- 页面不可见时，不挂载活动 tab 的完整内容
- `LiveGraph` 在折叠时直接跳过节点热度、最近事件、活跃边等计算
- `MemoryPanel` 只有在面板激活时才构建 writes、summary、graph 和节点映射

涉及文件：

- `frontend/src/components/chat/RuntimeInspector.tsx`
- `frontend/src/components/chat/LiveGraph.tsx`
- `frontend/src/components/chat/MemoryPanel.tsx`

预期收益：

- 观察器收起时对主界面的干扰显著下降
- 图形计算只发生在用户真正查看对应面板的时候
- 回放过程中不会同时为多个隐藏观察视图持续付出计算成本

### 7. 行级 memo 与洞察折叠，减少富文本和评分卡片的重复渲染

聊天列表中，真正昂贵的不只是“有多少行”，还包括每一行里可能包含 Markdown、评分卡片、组内讨论和陪审团评议。对此，这轮做了两类收缩：

第一类是**组件级 memo**：

- `MessageRow` 改为 `memo` 导出
- 配合上层 `useMemo` 和 ViewModel，让未变化的消息行尽量留在局部更新范围

第二类是**默认折叠次级信息**：

- `RoundInsights` 新增 section 级折叠状态
- 组内讨论与陪审团评议默认收起
- `RoundInsights` 本身也使用 `memo` 与自定义比较逻辑，仅在 section 结构或 entry 引用变化时重新渲染

涉及文件：

- `frontend/src/components/chat/MessageRow.tsx`
- `frontend/src/components/chat/RoundInsights.tsx`
- `frontend/src/components/ChatPanel.tsx`

预期收益：

- 高频事件到来时，不会反复重绘整段聊天历史
- Markdown 和评分区只在真正需要的时候才展开计算
- 长会话下的滚动和局部更新更加稳定

### 8. 这轮性能优化的总体结论

如果把这轮改动总结成一句话，就是：**尽量把“无意义的更新”挡在真正渲染之前。**

具体体现在三条原则上：

1. **能不算就不算**：后台标签页、折叠观察器、未激活 tab 不参与重计算。
2. **能少渲染就少渲染**：聊天历史窗口化、虚拟窗口、时间线分页、洞察默认折叠。
3. **能增量就不全量**：对话分组复用上次状态、运行事件在 Store 层统一派生、回放只处理当前可见事件窗口。

从体验上看，这些优化主要会反映在以下几个方面：

- 长会话打开后更稳，页面不容易越用越沉
- 聊天区滚动更顺，向上追历史时更少跳动
- 时间线搜索和回放控制更灵敏
- 运行观察器展开/收起时，对主对话区的影响更小
- 在持续流式事件输入时，整页无关组件被连带刷新的概率明显下降
