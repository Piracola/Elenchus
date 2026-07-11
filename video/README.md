# Elenchus Video Renderer

本目录是本地视频生成器。它读取 Elenchus 导出的 JSON，先生成 `public/data/video-script.json` 文案切分层，再把每轮辩论整理为**主副分区**视频画面：

- 左侧 80%：正方 / 反方发言，采用歌词式行级高亮，当前行放大高亮，已读/未读行淡化缩小，按句 snap 切换，便于跟随阅读。
- 右侧 20%：裁判评语摘要（上）与综合评分（下），作为辅助信息静态展示。

## 使用方式

最轻量的操作方式是启动本地网页控制台：

双击：

```text
启动视频生成器.bat
```

或者命令行：

```bash
cd video
npm install
npm run ui
```

然后打开：

```text
http://127.0.0.1:4317
```

网页里可以选择或拖入 Elenchus 导出的 JSON，预览轮次摘要，写入 Remotion 输入文件，并触发 Studio、抽帧检查或 MP4 渲染。

也可以继续用命令行：

```bash
cd video
npm install
npm run prepare:export -- ../path/to/elenchus-export.json
npm run studio
```

渲染 MP4：

```bash
npm run render
```

抽一帧检查布局：

```bash
npm run still
```

## 数据边界

视频渲染器只读取 Elenchus 的导出 JSON，不读取 SQLite 数据库。原始 `dialogue_history` 会完整保留在 `session-export.json`；视频、TTS、抽帧预览优先读取派生出的 `video-script.json`。

文案链路分为四层，每层职责不同：

```text
speech.content       导出 JSON 中的完整原文，不清洗、不截断
speech.displayContent 去掉 Markdown 和思维标签后的画面文本
segment              展示、高亮和配音同步单位，拼接后必须还原 displayContent
TTS chunk            仅用于限制单次语音请求长度，拼接后必须还原 segment
```

默认使用「标准」模式，约 200 字一个辩手片段。网页控制台的「文案」配置页可以切换为「紧凑」或「细致」模式。

## TTS 配音

网页控制台的「TTS」配置页默认使用 Edge TTS。Edge TTS 不需要 API Key；双击启动脚本会在 `video/.venv` 创建独立 Python 环境，并按 `requirements.txt` 安装固定版本，避免污染系统 Python。

需要手动准备时可以执行：

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

点击「生成配音」后：

1. 画面继续使用约 200 字的 segment；TTS 会在内部按句拆成目标约 120 字、最多 180 字的请求块，两种粒度互不影响。
2. 每个请求块按文本、音色、语速等参数生成缓存键。失败后会重试并继续拆小，再次点击只补缺失内容。
3. 将同一轮音频拼接为 `public/audio/<scene-id>.<format>`，并生成整场音频。
4. `session-audio.json` 记录真实毫秒时长、segment cue、chunk cue、脚本哈希和配音配置签名。
5. Remotion 和 Canvas 快速渲染读取同一套文案和 segment 时间轴；Canvas 按 segment 切换快速画面。
6. 配音和正式渲染各自最多运行一个任务，两类任务可以同时运行；重复点击同类任务会返回已有任务，可以在控制台查看进度或停止。
7. 正式渲染结束后会用 FFprobe 检查视频流、音频流和时长是否一致。

没有配音时仍可抽帧预览，时间按字数估算。若视频配置要求保留声音，正式渲染前会要求先成功生成配音，防止误输出无声视频。

## 可靠性验收

修改任务管理或渲染链路后，运行真实进程集成测试：

```bash
npm run test:process
```

完成配音、Canvas 快速渲染和 Remotion 正式渲染后，检查脚本哈希、音频、时间轴、双流 MP4 和关键帧：

```bash
npm run verify:artifacts
```
