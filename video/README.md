# Elenchus Video Renderer

本目录是本地视频生成器，主仓库已通过 `.gitignore` 忽略 `video/`。它读取 Elenchus 导出的 JSON，把每轮辩论整理为**主副分区**视频画面：

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

视频渲染器只读取 Elenchus 的导出 JSON，不读取 SQLite 数据库。当前模板会优先使用 `dialogue_history` 中每条裁判消息携带的 `scores` 字段；如果某轮没有逐轮评分，会回退到导出中的 `current_scores`。

## TTS 配音

网页控制台的「TTS」配置页填入服务商地址、API Key、模型、音色等参数后，点击「生成配音」即可：

1. 按场景拼接所有辩手发言文本，调用 MiMo / 自定义 TTS 接口。
2. 将音频保存到 `public/audio/<scene-id>.mp3`，并用 `music-metadata` 读取真实时长。
3. 把 `session-audio.json` 写入 `public/data/`，同时在 `render-props.json` 中声明 `audioManifest`。
4. Remotion 在 `calculateMetadata` 中用真实音频时长决定每个场景长度，并按字数比例把时长分配到每一行高亮。
5. 渲染时场景内用 `<Audio>` 对齐播放。

如果未生成配音，视频会使用字数估算的时长作为回退。
