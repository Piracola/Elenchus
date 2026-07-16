# Elenchus Video Renderer

本目录是本地视频生成器。它读取 Elenchus 导出的 JSON，先生成 `public/data/video-script.json` 视频脚本和字幕同步层，再把每轮辩论整理为**主副分区**视频画面：

- 左侧 80%：正方 / 反方发言，使用低饱和红绿色区分角色；当前行与前后各一行形成三行柔和阅读焦点，字号和行高保持固定，时间轴轻微错位时也不会打乱排版。
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
segment              时间轴校准与缓存单位，拼接后必须还原 displayContent
TTS chunk            仅用于限制单次语音请求长度，拼接后必须还原 segment
```

默认约 200 字设置一个字幕时间轴校准点。网页控制台的「同步」配置页可以改为约 260 字的宽松同步或约 140 字的精细同步；它不会截断发言或切换画面，只影响长发言的字幕校准和缓存粒度。

## TTS 配音

网页控制台固定使用 Edge TTS，不再包含其他 TTS 服务商或远程兼容接口。Edge TTS 不需要 API Key；双击启动脚本会在 `video/.venv` 创建独立 Python 环境，并按 `requirements.txt` 安装固定版本，避免污染系统 Python。默认朗读开场辩题并为正反方辩手生成配音；标题、裁判评分、旁白和背景内容都可分别控制。

需要手动准备时可以执行：

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

点击「生成配音」后：

1. 字幕时间轴使用约 200 字的校准点；Edge TTS 初始请求按句组合为目标约 260 字、最多 320 字，失败时才继续减半拆小。请求块默认以 50 并发生成，可在控制台设置 1 到 100；生成完成后仍严格按原发言顺序拼接。
2. 每个请求块按文本、音色、语速等参数生成缓存键。失败后会重试并继续拆小，再次点击只补缺失内容。
3. 开场默认朗读“本场辩题：标题”，前后保留静音；开场至少 5 秒，长标题会自动延长。
4. 将同一轮音频拼接为 `public/audio/<scene-id>.mp3`，再按“开场 + 各轮发言”生成整场音频。
5. `session-audio.json` 记录开场音轨、真实毫秒时长、segment cue、chunk cue、脚本哈希和配音配置签名。
6. Remotion 和 Canvas 快速渲染读取同一套逐行时间轴；Canvas 为每个行状态出图，再通过一次 FFmpeg 编码整场快速视频。
7. 配音和正式渲染各自最多运行一个任务，两类任务可以同时运行；重复点击同类任务会返回已有任务，可以在控制台查看进度或停止。
8. 正式渲染结束后会用 FFprobe 检查视频流、音频流和时长是否一致。

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
