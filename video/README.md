# Elenchus Video Renderer

本目录是本地视频生成器。它读取 Elenchus 导出的 JSON，先生成 `public/data/video-script.json` 视频脚本和字幕同步层，再把每轮辩论整理为**主副分区**视频画面：

- 顶部页眉：辩题、`第 N / M 轮` 与轮次进度条（超过 12 轮自动退化为单条进度条），右侧标注时间轴是真实音频还是字数预估。
- 左侧 80%「辩手发言」：提示器式逐行朗读。当前行锁定在阅读区 42% 的焦点位置，越远越淡，上下边缘柔化淡出而不是硬切；当前行有角色色号左侧竖条与浅色底，卡片标题右侧常驻当前发言人（角色色圆点 + `正方 · Proposer`）。字号和行高在所有状态下固定，时间轴轻微错位也不会打乱排版。
- 右上「裁判评议」：`本轮胜方` 胶囊 + 裁判评语，按像素宽度换行并在超长时省略。
- 右下「本轮评分」：正反方综合分左右对峙，中间一条按分数比例分割的胜负条，下方六个维度用镜像条形图对比；若该轮只有单方评分则退化为堆叠卡片。裁判评分被配音朗读时，会额外显示当前朗读一方的总评。
- 底部页脚：整场（含开场与片尾）进度条，带轮次分隔刻度与 `已播放 / 总时长`。
- 开场与片尾：辩题、正反方对阵卡；片尾额外汇总每方的均分与胜出轮数。

Remotion 与 Canvas 共用 `src/scenePresentation.ts` 里的同一套坐标、配色与视图模型，因此改版只需要动这一个文件加两个渲染器的绘制代码；两条链路输出的同帧画面应当逐像素接近。中文排版规则（`visualTextWidth` 宽度度量、标点不出现在行首、开括号不留在行尾、拉丁单词不被拆开）统一定义在 `src/videoScript.ts`，由字幕行切分和渲染层换行共用。

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
speech.displayContent 去掉 Markdown、思维标签和工具引用块后的画面文本
segment              时间轴校准与缓存单位，拼接后必须还原 displayContent
TTS chunk            仅用于限制单次语音请求长度，拼接后必须还原 segment
line                 字幕行，只影响画面换行，不参与 scriptHash 与配音缓存
```

工具引用块指模型残留在正文里的 `【toolu_...】` 这类纯 ASCII id，会在 `markdownToReadableText` 里被剥离，既不上画面也不会被念出来；中文的 `【跨域】`、`「语言」` 不受影响。

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
6. Remotion 和 Canvas 快速渲染读取同一套逐行时间轴；Canvas 为每个行状态出图（取该片段起始帧之后若干帧，让提示器滚动已经停稳），再通过一次 FFmpeg 编码整场快速视频。
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
