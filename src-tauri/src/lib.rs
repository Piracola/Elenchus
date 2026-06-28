use serde::Serialize;
use serde_json::Value;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    fs,
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 8001;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct BackendState {
    child: Mutex<Option<Child>>,
}

#[derive(Clone)]
struct LauncherServerConfig {
    url: String,
    host: String,
    port: u16,
}

enum BackendLaunchTarget {
    PackagedExe {
        executable: PathBuf,
        cwd: PathBuf,
        runtime_root: PathBuf,
    },
    SourceTree {
        root: PathBuf,
        runtime_root: PathBuf,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherStatus {
    state: String,
    title: String,
    detail: String,
    message: String,
    url: String,
    running: bool,
}

fn idle_status(url: &str) -> LauncherStatus {
    LauncherStatus {
        state: "idle".to_string(),
        title: "未启动".to_string(),
        detail: "点击启动后会拉起本地服务。".to_string(),
        message: "后续可在这里加入日志、配置入口和更新状态。".to_string(),
        url: url.to_string(),
        running: false,
    }
}

fn running_status(url: &str) -> LauncherStatus {
    LauncherStatus {
        state: "running".to_string(),
        title: "运行中".to_string(),
        detail: "本地服务已就绪，浏览器界面可用。".to_string(),
        message: "MVP 仅提供启动和退出；服务日志后续可接入这里。".to_string(),
        url: url.to_string(),
        running: true,
    }
}

fn error_status(detail: String, url: &str) -> LauncherStatus {
    LauncherStatus {
        state: "error".to_string(),
        title: "启动失败".to_string(),
        detail,
        message: "请检查 Python 环境、端口占用或后续接入的运行日志。".to_string(),
        url: url.to_string(),
        running: false,
    }
}

fn default_server_config() -> LauncherServerConfig {
    LauncherServerConfig {
        url: format!("http://{}:{}", DEFAULT_HOST, DEFAULT_PORT),
        host: DEFAULT_HOST.to_string(),
        port: DEFAULT_PORT,
    }
}

fn resolve_runtime_root(default_root: PathBuf) -> PathBuf {
    let override_root = std::env::var("ELENCHUS_RUNTIME_DIR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    match override_root {
        Some(path) => PathBuf::from(path),
        None => default_root,
    }
}

fn normalize_browser_host(host: &str) -> String {
    let trimmed = host.trim();
    if trimmed.is_empty() || trimmed == "0.0.0.0" || trimmed == "::" || trimmed == "[::]" {
        DEFAULT_HOST.to_string()
    } else {
        trimmed.to_string()
    }
}

fn load_server_config(runtime_root: &Path) -> LauncherServerConfig {
    let config_path = runtime_root.join("config.json");
    let mut config = default_server_config();

    let raw = match fs::read_to_string(config_path) {
        Ok(raw) => raw,
        Err(_) => return config,
    };
    let value = match serde_json::from_str::<Value>(&raw) {
        Ok(value) => value,
        Err(_) => return config,
    };
    let server = match value.get("server").and_then(Value::as_object) {
        Some(server) => server,
        None => return config,
    };

    if let Some(port) = server.get("port").and_then(Value::as_u64) {
        if let Ok(port) = u16::try_from(port) {
            config.port = port;
        }
    }

    if let Some(host) = server.get("host").and_then(Value::as_str) {
        config.host = normalize_browser_host(host);
    }

    config.url = format!("http://{}:{}", config.host, config.port);
    config
}

fn candidate_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir);
    }

    if let Ok(executable) = std::env::current_exe() {
        if let Some(dir) = executable.parent() {
            candidates.push(dir.to_path_buf());
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.clone());
        if let Some(dir) = resource_dir.parent() {
            candidates.push(dir.to_path_buf());
        }
    }

    candidates
}

fn find_backend_launch_target(app: &AppHandle) -> Result<BackendLaunchTarget, String> {
    let mut checked_locations = Vec::new();
    let current_exe = std::env::current_exe().ok();

    for candidate in candidate_roots(app) {
        let packaged_candidates = [
            candidate.join("elenchus-backend.exe"),
            candidate.join("backend").join("elenchus-backend.exe"),
            candidate.join("elenchus.exe"),
            candidate.join("backend").join("elenchus.exe"),
        ];

        for executable in packaged_candidates {
            checked_locations.push(executable.clone());
            if executable.is_file() && current_exe.as_ref() != Some(&executable) {
                let cwd = executable
                    .parent()
                    .map(Path::to_path_buf)
                    .unwrap_or_else(|| candidate.clone());
                let runtime_root = resolve_runtime_root(cwd.join("runtime"));
                return Ok(BackendLaunchTarget::PackagedExe {
                    executable,
                    cwd,
                    runtime_root,
                });
            }
        }

        let backend_entry = candidate.join("backend").join("run_packaged.py");
        checked_locations.push(backend_entry.clone());
        if backend_entry.is_file() {
            let runtime_root = resolve_runtime_root(candidate.join("runtime"));
            return Ok(BackendLaunchTarget::SourceTree {
                root: candidate,
                runtime_root,
            });
        }
    }

    let checked = checked_locations
        .into_iter()
        .map(|path| format!("- {}", path.display()))
        .collect::<Vec<_>>()
        .join("\n");

    Err(format!(
        "找不到后端启动入口。已检查：\n{}",
        if checked.is_empty() {
            "- (无候选路径)".to_string()
        } else {
            checked
        }
    ))
}

fn python_command() -> Command {
    let python = std::env::var("ELENCHUS_PYTHON").unwrap_or_else(|_| "python".to_string());
    Command::new(python)
}

fn apply_backend_environment(command: &mut Command, runtime_root: &Path) {
    command.env("ELENCHUS_OPEN_BROWSER", "0");
    command.env("ELENCHUS_RUNTIME_DIR", runtime_root);
}

#[cfg(target_os = "windows")]
fn hide_child_console(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_child_console(_command: &mut Command) {}

fn spawn_packaged_backend(
    executable: &Path,
    cwd: &Path,
    runtime_root: &Path,
) -> Result<Child, String> {
    let mut command = Command::new(executable);
    command
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    apply_backend_environment(&mut command, runtime_root);
    hide_child_console(&mut command);

    command
        .spawn()
        .map_err(|error| format!("无法启动打包后端：{error}"))
}

fn spawn_source_backend(root: &Path, runtime_root: &Path) -> Result<Child, String> {
    let backend_entry = root.join("backend").join("run_packaged.py");
    let mut command = python_command();
    command
        .arg(backend_entry)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    apply_backend_environment(&mut command, runtime_root);
    hide_child_console(&mut command);

    command
        .spawn()
        .map_err(|error| format!("无法启动源码后端进程：{error}"))
}

fn spawn_backend(app: &AppHandle) -> Result<Child, String> {
    match find_backend_launch_target(app)? {
        BackendLaunchTarget::PackagedExe {
            executable,
            cwd,
            runtime_root,
        } => spawn_packaged_backend(&executable, &cwd, &runtime_root),
        BackendLaunchTarget::SourceTree { root, runtime_root } => {
            spawn_source_backend(&root, &runtime_root)
        }
    }
}

fn read_server_config(app: &AppHandle) -> LauncherServerConfig {
    match find_backend_launch_target(app) {
        Ok(BackendLaunchTarget::PackagedExe { runtime_root, .. })
        | Ok(BackendLaunchTarget::SourceTree { runtime_root, .. }) => {
            load_server_config(&runtime_root)
        }
        Err(_) => default_server_config(),
    }
}

fn health_check(server: &LauncherServerConfig) -> bool {
    let address = match (server.host.as_str(), server.port).to_socket_addrs() {
        Ok(mut addresses) => match addresses.next() {
            Some(address) => address,
            None => return false,
        },
        Err(_) => return false,
    };

    let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(250)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let request = b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn wait_until_ready(timeout: Duration, server: &LauncherServerConfig) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if health_check(server) {
            return true;
        }
        thread::sleep(Duration::from_millis(350));
    }
    false
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd");
        command
            .args(["/C", "start", "", url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_child_console(&mut command);
        command
            .spawn()
            .map_err(|error| format!("无法打开浏览器：{error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("无法打开浏览器：{error}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("无法打开浏览器：{error}"))?;
        return Ok(());
    }
}

fn backend_running(state: &BackendState) -> bool {
    let mut guard = match state.child.lock() {
        Ok(guard) => guard,
        Err(_) => return false,
    };

    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
                false
            }
            Ok(None) => true,
            Err(_) => {
                *guard = None;
                false
            }
        }
    } else {
        false
    }
}

#[tauri::command]
fn get_status(app: AppHandle, state: State<'_, BackendState>) -> LauncherStatus {
    let server = read_server_config(&app);
    if backend_running(&state) || health_check(&server) {
        running_status(&server.url)
    } else {
        idle_status(&server.url)
    }
}

#[tauri::command]
fn start_backend(app: AppHandle, state: State<'_, BackendState>) -> LauncherStatus {
    let server = read_server_config(&app);

    if backend_running(&state) || health_check(&server) {
        if let Err(error) = open_browser(&server.url) {
            return error_status(error, &server.url);
        }
        return running_status(&server.url);
    }

    let child = match spawn_backend(&app) {
        Ok(child) => child,
        Err(error) => return error_status(error, &server.url),
    };

    if let Ok(mut guard) = state.child.lock() {
        *guard = Some(child);
    } else {
        return error_status("启动器状态锁异常。".to_string(), &server.url);
    }

    if !wait_until_ready(Duration::from_secs(25), &server) {
        return error_status("后端启动超时，健康检查未通过。".to_string(), &server.url);
    }

    if let Err(error) = open_browser(&server.url) {
        return error_status(error, &server.url);
    }

    running_status(&server.url)
}

#[tauri::command]
fn exit_app(app: AppHandle, state: State<'_, BackendState>) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }

    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .manage(BackendState {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_backend,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Elenchus launcher");
}

#[cfg(test)]
mod tests {
    use super::{load_server_config, DEFAULT_HOST, DEFAULT_PORT};
    use std::{
        env, fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn make_temp_runtime_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        let root = env::temp_dir().join(format!("elenchus-launcher-test-{unique}"));
        fs::create_dir_all(&root).expect("create temp runtime root");
        root
    }

    #[test]
    fn load_server_config_uses_custom_port_and_loopback_browser_host() {
        let runtime_root = make_temp_runtime_root();
        fs::write(
            runtime_root.join("config.json"),
            r#"{"server":{"host":"0.0.0.0","port":19191}}"#,
        )
        .expect("write config");

        let config = load_server_config(&runtime_root);

        assert_eq!(config.host, DEFAULT_HOST);
        assert_eq!(config.port, 19191);
        assert_eq!(config.url, "http://127.0.0.1:19191");

        fs::remove_dir_all(runtime_root).ok();
    }

    #[test]
    fn load_server_config_falls_back_to_defaults_for_missing_file() {
        let runtime_root = make_temp_runtime_root();

        let config = load_server_config(&runtime_root);

        assert_eq!(config.host, DEFAULT_HOST);
        assert_eq!(config.port, DEFAULT_PORT);
        assert_eq!(config.url, "http://127.0.0.1:8001");

        fs::remove_dir_all(runtime_root).ok();
    }
}
