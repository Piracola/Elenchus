const tauriCore = window.__TAURI__?.core;

const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const serviceUrl = document.querySelector("#service-url");
const extensionMessage = document.querySelector("#extension-message");
const startButton = document.querySelector("#start-button");
const exitButton = document.querySelector("#exit-button");

const STATUS_CLASS_NAMES = [
  "status-dot--idle",
  "status-dot--starting",
  "status-dot--running",
  "status-dot--error",
];

function setStatus(status) {
  statusDot.classList.remove(...STATUS_CLASS_NAMES);
  statusDot.classList.add(`status-dot--${status.state}`);
  statusTitle.textContent = status.title;
  statusDetail.textContent = status.detail;
  serviceUrl.textContent = status.url || "http://127.0.0.1:8001";
  extensionMessage.textContent = status.message;
  startButton.textContent = status.running ? "打开界面" : "启动";
  startButton.disabled = status.state === "starting";
}

async function invoke(command) {
  if (!tauriCore?.invoke) {
    throw new Error("Tauri API 未就绪");
  }
  return tauriCore.invoke(command);
}

async function refreshStatus() {
  try {
    const status = await invoke("get_status");
    setStatus(status);
  } catch (error) {
    setStatus({
      state: "error",
      title: "启动器不可用",
      detail: error instanceof Error ? error.message : String(error),
      message: "请从 Tauri 环境运行启动器。",
      url: "http://127.0.0.1:8001",
      running: false,
    });
  }
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  setStatus({
    state: "starting",
    title: "启动中",
    detail: "正在启动本地服务并等待健康检查。",
    message: "服务就绪后会自动打开浏览器。",
    url: serviceUrl.textContent,
    running: false,
  });

  try {
    const status = await invoke("start_backend");
    setStatus(status);
  } catch (error) {
    setStatus({
      state: "error",
      title: "启动失败",
      detail: error instanceof Error ? error.message : String(error),
      message: "请检查终端输出或后续接入的运行日志。",
      url: serviceUrl.textContent,
      running: false,
    });
  }
});

exitButton.addEventListener("click", async () => {
  exitButton.disabled = true;
  try {
    await invoke("exit_app");
  } catch {
    window.close();
  }
});

refreshStatus();
