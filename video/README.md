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

文案切分层按：

```text
round 场景
  speech 发言
    segment 展示 / 高亮 / 配音同步单位
```

默认使用「标准」模式，约 200 字一个辩手片段。网页控制台的「文案」配置页可以切换为「紧凑」或「细致」模式。

## TTS 配音

网页控制台的「TTS」配置页填入服务商地址、API Key、模型、音色等参数后，点击「生成配音」即可：

1. 按 `video-script.json` 中的辩手 segment 逐段调用 MiMo / 自定义 TTS 接口。
2. 将同一轮内的 segment 音频拼接为 `public/audio/<scene-id>.<format>`。
3. 把 `session-audio.json` 写入 `public/data/`，记录 scene 音频、`scriptHash`、segment 级 `startFrame` / `endFrame`。
4. Remotion 和 Canvas 快速渲染都用同一套 segment cue 生成高亮时间轴。
5. 渲染时场景内用 `<Audio>` 对齐播放。

如果未生成配音，视频会使用字数估算的时长作为回退。
