const roleLabels = {
  proposer: "正方",
  opposer: "反方",
  judge: "裁判",
  group_discussion: "组内讨论",
  consensus_summary: "共识总结",
};

const nonSpeakerRoles = new Set([
  "judge",
  "system",
  "fact_checker",
  "group_discussion",
  "consensus_summary",
  "audience",
  "error",
  "sophistry_round_report",
  "sophistry_final_report",
]);

const state = {
  session: null,
  sourceName: "sample",
  assets: null,
  previewMode: "frame",
  config: null,
  configOrigin: "default",
  configTab: "video",
  scriptStats: null,
  activeTaskId: null,
};

const $ = (id) => document.getElementById(id);

const setStatus = (text, variant = "") => {
  const pill = $("statusPill");
  pill.textContent = text;
  pill.className = "status-pill" + (variant ? ` ${variant}` : "");
};

const LOG_DISPLAY_LIMIT = 40000;
let lastRenderedLog = "";

const isLogNearBottom = () => {
  const output = $("logOutput");
  return output.scrollHeight - output.scrollTop - output.clientHeight < 40;
};

const setLog = (text) => {
  const full = text || "暂无日志。";
  const display =
    full.length > LOG_DISPLAY_LIMIT
      ? `…已省略前面 ${full.length - LOG_DISPLAY_LIMIT} 字符…\n${full.slice(-LOG_DISPLAY_LIMIT)}`
      : full;
  if (display === lastRenderedLog) {
    return;
  }
  lastRenderedLog = display;
  const output = $("logOutput");
  const stick = isLogNearBottom();
  output.textContent = display;
  if (stick) {
    output.scrollTop = output.scrollHeight;
  }
};

const setLogHint = (text) => {
  $("logHint").textContent = text;
};

const roleLabel = (role) => roleLabels[role] || role || "未知";

const stripThinking = (text) => {
  let value = String(text || "");
  while (/^\s*<think\b[^>]*>/i.test(value)) {
    const close = value.search(/<\/think\s*>/i);
    if (close < 0) {
      return value;
    }
    value = value.slice(close).replace(/^<\/think\s*>\s*/i, "");
  }
  return value;
};

const cleanText = (text) =>
  stripThinking(text)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const charCount = (text) => cleanText(text).replace(/\s+/g, "").length;

const formatBytes = (bytes) => {
  if (!bytes) {
    return "未生成";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatTime = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const assetText = (asset) => {
  if (!asset?.exists) {
    return "未生成";
  }
  return [formatBytes(asset.size), formatTime(asset.updatedAt)].filter(Boolean).join(" · ");
};

const defaultConfig = {
  video: {
    preset: "recommended",
    codecProfile: "compatible",
    audioMode: "normal",
    rateControl: "bitrate",
    codec: "h264",
    crf: "28",
    videoBitrate: "2500k",
    audioBitrate: "128k",
    pixelFormat: "yuv420p",
    maxRate: "3500k",
    bufferSize: "7000k",
    concurrency: "100%",
    scale: "1",
    x264Preset: "medium",
    muted: false,
  },
  tts: {
    provider: "edge",
    baseUrl: "",
    apiKey: "",
    model: "",
    voice: "zh-CN-XiaoxiaoNeural",
    format: "mp3",
    sampleRate: "24000",
    speed: "1",
    concurrency: "1",
  },
  script: {
    textPreset: "standard",
  },
};

const videoPresetSettings = {
  tiny: {
    summary: "更小体积：适合快速分享，文字仍能看清，但细节会更压缩。",
    values: {
      rateControl: "bitrate",
      crf: "30",
      videoBitrate: "1200k",
      maxRate: "1800k",
      bufferSize: "3600k",
      concurrency: "100%",
      x264Preset: "medium",
    },
  },
  recommended: {
    summary: "推荐设置：清晰度和体积比较均衡，适合大多数辩论视频先出片。",
    values: {
      rateControl: "bitrate",
      crf: "28",
      videoBitrate: "2500k",
      maxRate: "3500k",
      bufferSize: "7000k",
      concurrency: "100%",
      x264Preset: "medium",
    },
  },
  sharp: {
    summary: "更清晰：文字边缘更稳，适合正式导出，文件体积会明显变大。",
    values: {
      rateControl: "bitrate",
      crf: "24",
      videoBitrate: "4500k",
      maxRate: "6500k",
      bufferSize: "13000k",
      concurrency: "100%",
      x264Preset: "medium",
    },
  },
  custom: {
    summary: "自定义模式：使用高级参数中的具体数值。",
    values: {},
  },
};

const codecProfileSettings = {
  compatible: {
    codec: "h264",
    pixelFormat: "yuv420p",
    summary: "兼容优先：H.264，最适合普通播放器和平台上传。",
  },
  small: {
    codec: "h265",
    pixelFormat: "yuv420p",
    summary: "体积优先：H.265，通常更小，但少数旧设备兼容性差一些。",
  },
};

const audioModeSettings = {
  normal: { audioBitrate: "128k", muted: false, summary: "保留正常音频。" },
  small: { audioBitrate: "96k", muted: false, summary: "压小音频，适合人声。" },
  muted: { audioBitrate: "64k", muted: true, summary: "不输出音频。" },
};

const scriptPresetSettings = {
  standard: "标准切分：约 200 字一段，阅读节奏和 TTS 成功率比较均衡。",
  compact: "紧凑切分：约 260 字一段，视频更短，但单屏文字会更多。",
  detailed: "细致切分：约 140 字一段，高亮更细，TTS 请求次数会更多。",
};

const edgeVoiceOptions = [
  { value: "zh-CN-XiaoxiaoNeural", label: "晓晓（女，普通话，温暖）" },
  { value: "zh-CN-XiaoyiNeural", label: "晓伊（女，普通话，活泼）" },
  { value: "zh-CN-YunjianNeural", label: "云健（男，普通话，激情）" },
  { value: "zh-CN-YunxiNeural", label: "云希（男，普通话，阳光）" },
  { value: "zh-CN-YunxiaNeural", label: "云夏（男，普通话，可爱）" },
  { value: "zh-CN-YunyangNeural", label: "云扬（男，普通话，新闻播报）" },
  { value: "zh-CN-liaoning-XiaobeiNeural", label: "晓北（女，辽宁方言，幽默）" },
  { value: "zh-CN-shaanxi-XiaoniNeural", label: "晓妮（女，陕西方言，明亮）" },
  { value: "zh-HK-HiuGaaiNeural", label: "晓佳（女，香港粤语）" },
  { value: "zh-HK-HiuMaanNeural", label: "晓曼（女，香港粤语）" },
  { value: "zh-HK-WanLungNeural", label: "云龙（男，香港粤语）" },
  { value: "zh-TW-HsiaoChenNeural", label: "晓臻（女，台湾普通话）" },
  { value: "zh-TW-HsiaoYuNeural", label: "晓雨（女，台湾普通话）" },
  { value: "zh-TW-YunJheNeural", label: "云哲（男，台湾普通话）" },
];

const voiceOptionLabel = (option) => `${option.label} - ${option.value}`;

const voiceOptionsForProvider = (provider, currentVoice = "") => {
  if (provider === "edge") {
    return edgeVoiceOptions;
  }
  if (provider === "mimo") {
    return [{ value: "mimo_default", label: "MiMo 默认音色" }];
  }
  const value = currentVoice || "";
  return value ? [{ value, label: "当前自定义音色" }] : [{ value: "", label: "请先选择服务商默认音色" }];
};

const populateVoiceOptions = (provider, currentVoice = "") => {
  const select = $("ttsVoiceInput");
  const options = voiceOptionsForProvider(provider, currentVoice);
  const hasCurrent = options.some((option) => option.value === currentVoice);
  const finalOptions =
    currentVoice && !hasCurrent
      ? [{ value: currentVoice, label: "当前配置音色" }, ...options]
      : options;

  select.innerHTML = "";
  finalOptions.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = provider === "edge" ? voiceOptionLabel(option) : `${option.label}${option.value ? ` - ${option.value}` : ""}`;
    select.appendChild(element);
  });
  select.value = currentVoice && finalOptions.some((option) => option.value === currentVoice) ? currentVoice : finalOptions[0]?.value || "";
};

const ttsProviderSettings = {
  edge: {
    summary: "Edge TTS 不需要 API Key，中文音色自然。输出会固定为 MP3，适合当前视频流程。",
    defaultVoice: "zh-CN-XiaoxiaoNeural",
    defaultFormat: "mp3",
    defaultConcurrency: "1",
  },
  mimo: {
    summary: "MiMo 作为备用接口保留。需要填写 API 地址、API Key、模型和音色。",
    defaultVoice: "mimo_default",
    defaultFormat: "wav",
    defaultConcurrency: "2",
  },
  custom: {
    summary: "自定义接口会按 OpenAI 兼容格式请求。需要填写 API 地址、API Key、模型和音色。",
    defaultVoice: "",
    defaultFormat: "wav",
    defaultConcurrency: "2",
  },
};

const mergeConfig = (config) => ({
  video: { ...defaultConfig.video, ...(config?.video || {}) },
  tts: { ...defaultConfig.tts, ...(config?.tts || {}) },
  script: { ...defaultConfig.script, ...(config?.script || {}) },
});

const setValue = (id, value) => {
  $(id).value = value ?? "";
};

const readValue = (id) => $(id).value.trim();

const setChecked = (id, value) => {
  $(id).checked = Boolean(value);
};

const renderCodecWarning = () => {
  const codec = readValue("videoCodecInput") || "h264";
  const warning = $("codecWarning");
  if (!warning) {
    return;
  }
  warning.hidden = codec === "h264";
};

const renderVideoPresetSummary = () => {
  const preset = readValue("videoPresetInput") || "recommended";
  const codecProfile = readValue("codecProfileInput") || "compatible";
  const audioMode = readValue("audioModeInput") || "normal";
  const parts = [
    videoPresetSettings[preset]?.summary,
    codecProfileSettings[codecProfile]?.summary,
    audioModeSettings[audioMode]?.summary,
  ].filter(Boolean);
  $("videoPresetSummary").textContent = parts.join(" ");
  renderCodecWarning();
};

const renderScriptPresetSummary = () => {
  const preset = readValue("scriptPresetInput") || "standard";
  $("scriptPresetSummary").textContent = scriptPresetSettings[preset] || scriptPresetSettings.standard;
};

const renderTtsProviderFields = () => {
  const provider = readValue("ttsProviderInput") || "edge";
  const isEdge = provider === "edge";
  const settings = ttsProviderSettings[provider] || ttsProviderSettings.edge;
  const currentVoice = readValue("ttsVoiceInput") || settings.defaultVoice;

  populateVoiceOptions(provider, currentVoice);

  ["ttsBaseUrlField", "ttsApiKeyField", "ttsModelField", "ttsSampleRateField"].forEach((id) => {
    const element = $(id);
    if (element) {
      element.hidden = isEdge;
    }
  });

  $("ttsFormatInput").disabled = isEdge;
  if (isEdge) {
    setValue("ttsFormatInput", "mp3");
    if (!readValue("ttsVoiceInput") || readValue("ttsVoiceInput") === "mimo_default") {
      setValue("ttsVoiceInput", settings.defaultVoice);
    }
    if (!readValue("ttsConcurrencyInput") || Number(readValue("ttsConcurrencyInput")) > 2) {
      setValue("ttsConcurrencyInput", settings.defaultConcurrency);
    }
  }

  $("ttsProviderSummary").textContent = settings.summary;
};

const applyTtsProviderDefaults = () => {
  const provider = readValue("ttsProviderInput") || "edge";
  const settings = ttsProviderSettings[provider] || ttsProviderSettings.edge;
  setValue("ttsFormatInput", settings.defaultFormat);
  populateVoiceOptions(provider, settings.defaultVoice);
  if (!readValue("ttsVoiceInput") || readValue("ttsVoiceInput") === "mimo_default" || provider === "edge") {
    setValue("ttsVoiceInput", settings.defaultVoice);
  }
  if (!readValue("ttsConcurrencyInput") || provider === "edge") {
    setValue("ttsConcurrencyInput", settings.defaultConcurrency);
  }
  renderTtsProviderFields();
};

const applySimpleVideoSelections = () => {
  const preset = readValue("videoPresetInput") || "recommended";
  if (preset === "custom") {
    syncRateControlFields();
    renderVideoPresetSummary();
    return;
  }

  const values = videoPresetSettings[preset]?.values || videoPresetSettings.recommended.values;
  Object.entries(values).forEach(([key, value]) => {
    const fieldId = {
      rateControl: "rateControlInput",
      crf: "crfInput",
      videoBitrate: "videoBitrateInput",
      maxRate: "maxRateInput",
      bufferSize: "bufferSizeInput",
      concurrency: "renderConcurrencyInput",
      x264Preset: "x264PresetInput",
    }[key];
    if (fieldId) {
      setValue(fieldId, value);
    }
  });

  const codecProfile = codecProfileSettings[readValue("codecProfileInput")] || codecProfileSettings.compatible;
  setValue("videoCodecInput", codecProfile.codec);
  setValue("pixelFormatInput", codecProfile.pixelFormat);

  const audioMode = audioModeSettings[readValue("audioModeInput")] || audioModeSettings.normal;
  setValue("audioBitrateInput", audioMode.audioBitrate);
  setChecked("mutedInput", audioMode.muted);

  syncRateControlFields();
  renderVideoPresetSummary();
};

const markVideoConfigCustom = () => {
  setValue("videoPresetInput", "custom");
  renderVideoPresetSummary();
};

const renderConfig = () => {
  const config = mergeConfig(state.config);
  const video = config.video;
  const tts = config.tts;
  const script = config.script;

  setValue("videoPresetInput", video.preset);
  setValue("codecProfileInput", video.codecProfile);
  setValue("audioModeInput", video.audioMode);
  setValue("videoCodecInput", video.codec);
  setValue("rateControlInput", video.rateControl);
  setValue("crfInput", video.crf);
  setValue("videoBitrateInput", video.videoBitrate);
  setValue("audioBitrateInput", video.audioBitrate);
  setValue("pixelFormatInput", video.pixelFormat);
  setValue("maxRateInput", video.maxRate);
  setValue("bufferSizeInput", video.bufferSize);
  setValue("renderConcurrencyInput", video.concurrency);
  setValue("scaleInput", video.scale);
  setValue("x264PresetInput", video.x264Preset);
  $("mutedInput").checked = Boolean(video.muted);
  applySimpleVideoSelections();

  setValue("ttsProviderInput", tts.provider);
  setValue("ttsBaseUrlInput", tts.baseUrl);
  setValue("ttsApiKeyInput", tts.apiKey);
  setValue("ttsModelInput", tts.model);
  populateVoiceOptions(tts.provider, tts.voice);
  setValue("ttsVoiceInput", tts.voice);
  setValue("ttsFormatInput", tts.format);
  setValue("ttsSampleRateInput", tts.sampleRate);
  setValue("ttsSpeedInput", tts.speed);
  setValue("ttsConcurrencyInput", tts.concurrency);
  renderTtsProviderFields();
  setValue("scriptPresetInput", script.textPreset);
  renderScriptPresetSummary();

  renderConfigStatus();
};

const readConfigForm = () => ({
  video: {
    preset: readValue("videoPresetInput"),
    codecProfile: readValue("codecProfileInput"),
    audioMode: readValue("audioModeInput"),
    rateControl: readValue("rateControlInput"),
    codec: readValue("videoCodecInput"),
    crf: readValue("crfInput"),
    videoBitrate: readValue("videoBitrateInput"),
    audioBitrate: readValue("audioBitrateInput"),
    pixelFormat: readValue("pixelFormatInput"),
    maxRate: readValue("maxRateInput"),
    bufferSize: readValue("bufferSizeInput"),
    concurrency: readValue("renderConcurrencyInput"),
    scale: readValue("scaleInput"),
    x264Preset: readValue("x264PresetInput"),
    muted: $("mutedInput").checked,
  },
  tts: {
    provider: readValue("ttsProviderInput"),
    baseUrl: readValue("ttsBaseUrlInput"),
    apiKey: readValue("ttsApiKeyInput"),
    model: readValue("ttsModelInput"),
    voice: readValue("ttsVoiceInput"),
    format: readValue("ttsFormatInput"),
    sampleRate: readValue("ttsSampleRateInput"),
    speed: readValue("ttsSpeedInput"),
    concurrency: readValue("ttsConcurrencyInput"),
  },
  script: {
    textPreset: readValue("scriptPresetInput"),
  },
});

const syncRateControlFields = () => {
  const mode = readValue("rateControlInput") || "bitrate";
  const isCrf = mode === "crf";
  $("crfInput").disabled = !isCrf;
  $("videoBitrateInput").disabled = isCrf;
  $("maxRateInput").disabled = isCrf;
  $("bufferSizeInput").disabled = isCrf;
};

const setConfigTab = (tab) => {
  state.configTab = tab;
  $("videoConfigTab").classList.toggle("active", tab === "video");
  $("ttsConfigTab").classList.toggle("active", tab === "tts");
  $("scriptConfigTab").classList.toggle("active", tab === "script");
  $("videoConfigSection").hidden = tab !== "video";
  $("ttsConfigSection").hidden = tab !== "tts";
  $("scriptConfigSection").hidden = tab !== "script";
};

const renderConfigStatus = () => {
  const origin = state.configOrigin;
  if (origin === "local") {
    $("configStatus").textContent = "已恢复上次配置";
  } else if (origin === "saved") {
    $("configStatus").textContent = "已保存";
  } else {
    $("configStatus").textContent = "默认配置";
  }
};

const refreshConfig = async () => {
  const data = await fetch("/api/config").then((response) => response.json());
  if (!data.ok) {
    throw new Error(data.message || "读取配置失败");
  }
  state.config = mergeConfig(data.config);
  state.configOrigin = data.origin || "default";
  renderConfig();
};

const saveConfig = async () => {
  setStatus("保存中");
  const data = await postJson("/api/config", { config: readConfigForm() });
  state.config = mergeConfig(data.config);
  state.configOrigin = "saved";
  if (data.scriptStats) {
    state.scriptStats = data.scriptStats;
    renderSummary();
  }
  renderConfig();
  setStatus("已保存", "success");
  setLogHint("配置");
  setLog(["配置已保存到 config.local.json，服务重启后仍会恢复。", data.message, scriptStatsText(data.scriptStats)].filter(Boolean).join("\n"));
};

const resetConfig = async () => {
  if (!confirm("确定要恢复为默认配置吗？当前自定义设置会被覆盖。")) {
    return;
  }
  setStatus("重置中");
  const data = await postJson("/api/config", { config: defaultConfig });
  state.config = mergeConfig(data.config);
  state.configOrigin = "default";
  if (data.scriptStats) {
    state.scriptStats = data.scriptStats;
    renderSummary();
  }
  renderConfig();
  setStatus("已恢复默认", "success");
  setLogHint("配置");
  setLog(["已恢复默认配置。", data.message, scriptStatsText(data.scriptStats)].filter(Boolean).join("\n"));
};

const groupByTurn = (history) => {
  const turns = new Map();
  history.forEach((entry, index) => {
    const turn = Number.isInteger(entry.turn) && entry.turn >= 0 ? entry.turn : 0;
    const items = turns.get(turn) || [];
    items.push({ entry, index });
    turns.set(turn, items);
  });
  return [...turns.entries()].sort((a, b) => a[0] - b[0]);
};

const summarize = (session) => {
  const history = Array.isArray(session?.dialogue_history) ? session.dialogue_history : [];
  const rounds = groupByTurn(history);
  const speeches = history.filter((entry) => !nonSpeakerRoles.has(String(entry.role || "")));
  const judgeEntries = history.filter((entry) => entry.role === "judge");
  const scored = judgeEntries.filter((entry) => entry.scores);
  return { history, rounds, speeches, judgeEntries, scored };
};

const summarizeScript = (script) => {
  const rounds = Array.isArray(script?.rounds) ? script.rounds : [];
  const speakerSegments = rounds.reduce((sum, round) => sum + (round.speakerSegments?.length || 0), 0);
  const judgeSegments = rounds.reduce((sum, round) => sum + (round.judgeSegments?.length || 0), 0);
  const scoreSegments = rounds.reduce((sum, round) => sum + (round.scoreSegments?.length || 0), 0);
  return {
    rounds: rounds.length,
    speakerSegments,
    judgeSegments,
    scoreSegments,
    totalSegments: speakerSegments + judgeSegments + scoreSegments,
    preset: script?.segmentation?.mode || "standard",
  };
};

const scriptStatsText = (stats) => {
  if (!stats) {
    return "";
  }
  return `文案切分：${stats.preset}，辩手 ${stats.speakerSegments} 段，裁判 ${stats.judgeSegments} 段，评分 ${stats.scoreSegments} 段`;
};

const renderSummary = () => {
  const session = state.session;
  const { rounds, speeches, scored } = summarize(session);
  $("topicMetric").textContent = session?.topic || "-";
  $("turnMetric").textContent = rounds.length ? `${rounds.length}` : "-";
  $("speechMetric").textContent = state.scriptStats
    ? `${speeches.length} 条 / ${state.scriptStats.speakerSegments} 段`
    : `${speeches.length} 条`;
  $("scoreMetric").textContent = `${scored.length} 条`;
  $("sourceName").textContent = state.sourceName || "当前数据";
  $("saveButton").disabled = !session;
  renderRounds(rounds);
};

const setPreviewMode = (mode) => {
  state.previewMode = mode;
  $("frameTab").classList.toggle("active", mode === "frame");
  $("videoTab").classList.toggle("active", mode === "video");
  renderAssets();
};

const renderAssetCard = (id, asset) => {
  const card = $(id);
  card.querySelector("strong").textContent = assetText(asset);
};

const renderAssets = () => {
  const frame = state.assets?.frame || { exists: false };
  const video = state.assets?.video || { exists: false };
  const fastVideo = state.assets?.fastVideo || { exists: false };
  const previewVideo = fastVideo.exists ? fastVideo : video;
  const selected = state.previewMode === "video" ? previewVideo : frame;
  const framePreview = $("framePreview");
  const videoPreview = $("videoPreview");
  const emptyPreview = $("emptyPreview");

  renderAssetCard("frameAsset", frame);
  renderAssetCard("videoAsset", video);
  renderAssetCard("fastVideoAsset", fastVideo);

  if (frame.exists && frame.url) {
    framePreview.src = frame.url;
  } else {
    framePreview.removeAttribute("src");
  }

  if (previewVideo.exists && previewVideo.url) {
    videoPreview.src = previewVideo.url;
  } else {
    videoPreview.removeAttribute("src");
  }

  framePreview.hidden = state.previewMode !== "frame" || !frame.exists;
  videoPreview.hidden = state.previewMode !== "video" || !previewVideo.exists;
  emptyPreview.hidden = Boolean(selected?.exists);

  if (!selected?.exists) {
    $("emptyPreviewText").textContent =
      state.previewMode === "video"
        ? "点击“渲染 MP4”或“快速渲染”生成视频。"
        : "点击“抽帧检查”生成截图。";
  }

  const generated = [
    frame.exists ? "截图已生成" : "",
    video.exists ? "视频已生成" : "",
    fastVideo.exists ? "快速视频已生成" : "",
  ].filter(Boolean);
  $("assetMeta").textContent = generated.length ? generated.join(" / ") : "等待生成截图或视频";
};

const refreshAssets = async () => {
  const data = await fetch("/api/assets").then((response) => response.json());
  if (!data.ok) {
    throw new Error(data.message || "读取输出产物失败");
  }
  state.assets = data;
  renderAssets();
  return data;
};

const renderRounds = (rounds) => {
  const list = $("roundList");
  list.innerHTML = "";

  if (!rounds.length) {
    list.innerHTML = '<div class="round-card"><div class="round-text"><strong>暂无轮次</strong><p>请导入 Elenchus 导出 JSON。</p></div></div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  rounds.forEach(([turn, items]) => {
    const speakers = items.filter(({ entry }) => !nonSpeakerRoles.has(String(entry.role || "")));
    const judges = items.filter(({ entry }) => entry.role === "judge");
    const scores = judges.filter(({ entry }) => entry.scores);
    const text = speakers
      .slice(0, 2)
      .map(({ entry }) => `${roleLabel(entry.role)}：${cleanText(entry.content)}`)
      .join(" ");
    const totalChars = items.reduce((sum, { entry }) => sum + charCount(entry.content), 0);

    const card = document.createElement("article");
    card.className = "round-card";
    card.innerHTML = `
      <div class="round-index">第 ${turn + 1} 轮</div>
      <div class="round-text">
        <strong>${speakers.length} 条辩手发言，约 ${totalChars.toLocaleString()} 字</strong>
        <p>${escapeHtml(text || "本轮暂无辩手发言。")}</p>
      </div>
      <div class="round-tags">
        <span class="tag">${speakers.map(({ entry }) => roleLabel(entry.role)).join(" / ") || "无辩手"}</span>
        <span class="tag judge">裁判 ${judges.length}</span>
        <span class="tag score">评分 ${scores.length}</span>
      </div>
    `;
    fragment.appendChild(card);
  });
  list.appendChild(fragment);
};

const escapeHtml = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const loadFile = async (file) => {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.dialogue_history)) {
    throw new Error("缺少 dialogue_history 数组，这不像 Elenchus 导出 JSON。");
  }
  state.session = parsed;
  state.sourceName = file.name;
  $("titleInput").value = parsed.topic || "";
  renderSummary();
  setStatus("写入中", "running");
  setLog(`已读取：${file.name}\n正在写入 Remotion 输入文件...`);
  const data = await postJson("/api/import", {
    session: state.session,
    sourceName: state.sourceName,
    title: $("titleInput").value.trim(),
  });
  state.scriptStats = data.scriptStats || null;
  renderSummary();
  setStatus("已写入", "success");
  setLogHint("导入完成");
  setLog(
    [
      `已载入并写入：${file.name}`,
      `辩题：${parsed.topic || "-"}`,
      `发言条数：${parsed.dialogue_history.length}`,
      data.message,
      scriptStatsText(data.scriptStats),
    ]
      .filter(Boolean)
      .join("\n"),
  );
};

const postJson = async (url, body = {}) => {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    throw new Error(`无法连接到服务（${url}）：${networkError.message}`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`服务返回了非 JSON 响应（HTTP ${response.status}）。`);
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || `请求失败（HTTP ${response.status}）。`);
  }
  return data;
};

const sleep = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

const setRenderBusy = (busy) => {
  $("stillButton").disabled = busy;
  $("renderButton").disabled = busy;
  $("fastRenderButton").disabled = busy;
};

const readTask = async (taskId) => {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "读取任务状态失败");
  }
  return data.task;
};

const pollTask = async (taskId, command) => {
  state.activeTaskId = taskId;
  setRenderBusy(true);

  try {
    while (state.activeTaskId === taskId) {
      const task = await readTask(taskId);
      const running = task.status === "running";
      setStatus(running ? "执行中" : task.status === "finished" ? "完成" : "失败", running ? "running" : task.status === "finished" ? "success" : "error");
      setLogHint(`${command} · ${running ? "运行中" : "已结束"}`);
      setLog([task.message, task.output].filter(Boolean).join("\n\n"));

      if (!running) {
        if (command === "still" || command === "render" || command === "fast-render") {
          await refreshAssets();
          setPreviewMode(command === "still" ? "frame" : "video");
        }
        return task;
      }

      await sleep(1000);
    }
    return null;
  } finally {
    if (state.activeTaskId === taskId) {
      state.activeTaskId = null;
    }
    setRenderBusy(false);
  }
};

const saveCurrent = async () => {
  if (!state.session) {
    return;
  }
  setStatus("写入中", "running");
  const data = await postJson("/api/import", {
    session: state.session,
    sourceName: state.sourceName,
    title: $("titleInput").value.trim(),
  });
  state.scriptStats = data.scriptStats || null;
  renderSummary();
  setStatus("已写入", "success");
  setLogHint("导入完成");
  setLog(`已写入 Remotion 输入文件。\n${data.message}\n${scriptStatsText(data.scriptStats)}\n如修改了标题，下一次渲染会使用新标题。`);
};

const runCommand = async (command) => {
  setStatus("执行中", "running");
  setLogHint(command);
  setLog(`正在执行：${command}\n请稍候...`);
  const data = await postJson("/api/run", { command });
  if (data.task?.id) {
    setLog([data.message, data.task.output].filter(Boolean).join("\n\n"));
    await pollTask(data.task.id, command);
    return;
  }
  setStatus(data.ok ? "完成" : "失败", data.ok ? "success" : "error");
  setLog([data.message, data.studioUrl ? `Studio: ${data.studioUrl}` : "", data.output || ""].filter(Boolean).join("\n\n"));
  if (command === "still" || command === "render" || command === "fast-render") {
    await refreshAssets();
    setPreviewMode(command === "still" ? "frame" : "video");
  }
};

const openOut = async () => {
  const data = await postJson("/api/open-out");
  setStatus("已打开", "success");
  setLogHint("视频目录");
  setLog(`${data.message}\n${data.outDir}`);
};

const boot = async () => {
  try {
    const current = await fetch("/api/current").then((response) => response.json());
    if (current.session) {
      state.session = current.session;
      state.sourceName = current.props?.sourceName || "当前 Remotion 输入";
      state.scriptStats = current.script ? summarizeScript(current.script) : null;
      $("titleInput").value = current.props?.title || current.session.topic || "";
      setStatus("当前数据", "success");
      renderSummary();
    }
    await refreshAssets();
    await refreshConfig();
  } catch (error) {
    setLog(`读取当前数据失败：${error.message}`);
  }

  const fileInput = $("fileInput");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      await loadFile(file);
    } catch (error) {
      setStatus("导入失败", "error");
      setLog(error.message);
    }
  });

  const dropZone = $("dropZone");
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }
    try {
      await loadFile(file);
    } catch (error) {
      setStatus("导入失败", "error");
      setLog(error.message);
    }
  });

  $("saveButton").addEventListener("click", () => saveCurrent().catch((error) => {
    setStatus("写入失败", "error");
    setLog(error.message);
  }));
  $("studioButton").addEventListener("click", () => runCommand("studio").catch((error) => {
    setStatus("失败", "error");
    setLog(error.message);
  }));
  $("stillButton").addEventListener("click", () => runCommand("still").catch((error) => {
    setStatus("失败", "error");
    setLog(error.message);
  }));
  $("renderButton").addEventListener("click", () => runCommand("render").catch((error) => {
    setStatus("失败", "error");
    setLog(error.message);
  }));
  $("fastRenderButton").addEventListener("click", () => runCommand("fast-render").catch((error) => {
    setStatus("失败", "error");
    setLog(error.message);
  }));
  $("openOutButton").addEventListener("click", () => openOut().catch((error) => {
    setStatus("失败", "error");
    setLog(error.message);
  }));
  $("refreshAssetsButton").addEventListener("click", () => refreshAssets().then(() => {
    setStatus("已刷新", "success");
    setLogHint("预览刷新");
  }).catch((error) => {
    setStatus("失败", "error");
    setLog(error.message);
  }));
  $("frameTab").addEventListener("click", () => setPreviewMode("frame"));
  $("videoTab").addEventListener("click", () => setPreviewMode("video"));
  $("videoConfigTab").addEventListener("click", () => setConfigTab("video"));
  $("ttsConfigTab").addEventListener("click", () => setConfigTab("tts"));
  $("scriptConfigTab").addEventListener("click", () => setConfigTab("script"));
  $("scriptPresetInput").addEventListener("change", renderScriptPresetSummary);
  $("ttsProviderInput").addEventListener("change", applyTtsProviderDefaults);
  ["videoPresetInput", "codecProfileInput", "audioModeInput", "scaleInput"].forEach((id) => {
    $(id).addEventListener("change", applySimpleVideoSelections);
  });
  [
    "rateControlInput",
    "crfInput",
    "videoBitrateInput",
    "audioBitrateInput",
    "maxRateInput",
    "bufferSizeInput",
    "renderConcurrencyInput",
    "pixelFormatInput",
    "x264PresetInput",
    "mutedInput",
  ].forEach((id) => {
    $(id).addEventListener("change", () => {
      syncRateControlFields();
      markVideoConfigCustom();
    });
  });
  $("videoCodecInput").addEventListener("change", () => {
    syncRateControlFields();
    markVideoConfigCustom();
    renderCodecWarning();
  });
  $("saveConfigButton").addEventListener("click", () => saveConfig().catch((error) => {
    $("configStatus").textContent = "保存失败";
    setStatus("失败", "error");
    setLog(error.message);
  }));
  $("resetConfigButton").addEventListener("click", () => resetConfig().catch((error) => {
    $("configStatus").textContent = "重置失败";
    setStatus("失败", "error");
    setLog(error.message);
  }));
  $("generateTtsButton").addEventListener("click", async () => {
    setStatus("生成配音中", "running");
    setLogHint("TTS");
    setLog(`正在调用 ${readValue("ttsProviderInput") === "edge" ? "Edge TTS" : "TTS"} 生成每轮配音，请稍候...`);
    try {
      const data = await postJson("/api/generate-tts");
      setStatus(data.ok ? "配音已生成" : "失败", data.ok ? "success" : "error");
      setLog([data.message, data.failed?.length ? `失败：${data.failed.map((s) => `${s.id}: ${s.error}`).join("；")}` : ""].filter(Boolean).join("\n\n"));
    } catch (error) {
      setStatus("失败", "error");
      setLog(error.message);
    }
  });
};

boot();
