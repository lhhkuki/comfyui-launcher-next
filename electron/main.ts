import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell, type IpcMainEvent } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  BrowserOption,
  CoreVersionInfo,
  DirEntry,
  EnvironmentPackage,
  HistoryItem,
  LauncherConfig,
  LauncherInstance,
  LauncherMode,
  MediaItem,
  ModePreview,
  ModelItem,
  PathReference,
  PreflightCheck,
  PreflightResult,
  PluginInfo,
  QueueStatus,
  RuntimeStatus,
  SystemStats,
  WorkflowAnalysisResult
} from "./types";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let comfyProcess: ChildProcessWithoutNullStreams | null = null;
let logBuffer: string[] = [];
let currentUrl: string | null = null;
let externalComfyPid: number | null = null;
let isQuitting = false;

const userData = () => app.getPath("userData");
const dataPath = () => path.join(userData(), "launcher-next.config.json");
const logsRoot = () => path.join(userData(), "logs");
const backupsRoot = () => path.join(userData(), "backups");

function id(prefix: string) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function normalizeSlashes(value = "") {
  return value.replace(/\//g, path.sep);
}

function activeInstanceFromDisk(): LauncherInstance | null {
  try {
    const raw = fssync.readFileSync(dataPath(), "utf8");
    const config = JSON.parse(raw) as LauncherConfig;
    return config.instances.find((instance) => instance.id === config.currentInstanceId) || config.instances[0] || null;
  } catch {
    return null;
  }
}

function shouldMinimizeToTray() {
  return Boolean(activeInstanceFromDisk()?.minimizeToTray);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  mainWindow.setSkipTaskbar(true);
}

async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirs() {
  await fs.mkdir(logsRoot(), { recursive: true });
  await fs.mkdir(backupsRoot(), { recursive: true });
}

function defaultInstance(): LauncherInstance {
  return {
    id: id("inst"),
    name: "ComfyUI",
    comfyuiPath: "",
    pythonPath: "",
    port: "8188",
    gpu: "",
    proxyEnabled: false,
    proxyAddress: "",
    hfMirrorEnabled: false,
    vramMode: "默认",
    disableXformers: false,
    disableMetadata: false,
    enableManager: false,
    extraArgs: "",
    browserPath: "",
    browserChoice: "default",
    minimizeToTray: false,
    notifyOnComplete: false,
    pathReferences: [],
    advancedArgs: {}
  };
}

function defaultConfig(): LauncherConfig {
  const instance = defaultInstance();
  const mode: LauncherMode = {
    id: id("mode"),
    name: "默认模式",
    enabledPlugins: [],
    disabledPlugins: [],
    applyStrategy: "disabled-list",
    overrides: {}
  };
  return {
    currentInstanceId: instance.id,
    currentModeId: mode.id,
    instances: [instance],
    modes: [mode],
    ui: { activeView: "settings" }
  };
}

async function loadConfig(): Promise<LauncherConfig> {
  await ensureDirs();
  if (!(await exists(dataPath()))) {
    const initial = defaultConfig();
    await saveConfig(initial);
    return initial;
  }
  const config = JSON.parse(await fs.readFile(dataPath(), "utf8")) as LauncherConfig;
  const migrated: LauncherConfig = {
    ...config,
    instances: config.instances.map((instance) => ({
      ...defaultInstance(),
      ...instance,
      name: instance.name.replace(/^旧实例/i, "ComfyUI 环境"),
      pathReferences: instance.pathReferences || [],
      advancedArgs: instance.advancedArgs || {}
    })),
    modes: config.modes.map((mode) => ({
      ...mode,
      enabledPlugins: mode.enabledPlugins || [],
      disabledPlugins: mode.disabledPlugins || [],
      applyStrategy: mode.applyStrategy || "disabled-list"
    }))
  };
  if (JSON.stringify(migrated) !== JSON.stringify(config)) {
    await saveConfig(migrated);
  }
  return migrated;
}

async function saveConfig(config: LauncherConfig) {
  await ensureDirs();
  await fs.writeFile(dataPath(), JSON.stringify(config, null, 2), "utf8");
  return config;
}

function buildArgs(instance: LauncherInstance) {
  const args = ["main.py"];
  const modelConfig = launcherExtraModelConfigPath(instance);
  if (fssync.existsSync(modelConfig)) args.push("--extra-model-paths-config", modelConfig);
  if (instance.port) args.push("--port", instance.port);
  if (instance.gpu) args.push("--cuda-device", instance.gpu);
  if (instance.disableXformers) args.push("--disable-xformers");
  if (instance.disableMetadata) args.push("--disable-metadata");
  if (instance.enableManager) args.push("--enable-manager");
  if (instance.vramMode && instance.vramMode !== "默认") args.push(`--${instance.vramMode}`);
  if (instance.extraArgs.trim()) args.push(...instance.extraArgs.trim().split(/\s+/));
  return args;
}

function launcherExtraModelConfigPath(instance: LauncherInstance) {
  return path.join(instance.comfyuiPath || ".", "launcher_next_extra_model_paths.yaml");
}

async function syncModelPathConfig(instance: LauncherInstance) {
  const modelRefs = (instance.pathReferences || []).filter((ref) => ref.enabled && ref.kind === "models" && ref.path);
  const target = launcherExtraModelConfigPath(instance);
  if (!modelRefs.length) {
    if (await exists(target)) await fs.rm(target, { force: true });
    return "";
  }
  const modelKeys = [
    "checkpoints",
    "text_encoders",
    "clip",
    "clip_vision",
    "configs",
    "controlnet",
    "diffusion_models",
    "embeddings",
    "loras",
    "upscale_models",
    "vae",
    "audio_encoders",
    "model_patches"
  ];
  const lines = ["# Generated by ComfyUI Launcher Next. Safe to delete."];
  modelRefs.forEach((ref, index) => {
    lines.push(`launcher_next_${index}:`);
    lines.push(`  base_path: ${ref.path.replace(/\\/g, "/")}`);
    for (const key of modelKeys) lines.push(`  ${key}: ${key}`);
  });
  await fs.writeFile(target, `${lines.join("\n")}\n`, "utf8");
  return target;
}

async function appendLog(line: string) {
  const stamped = `[${new Date().toLocaleTimeString()}] ${line}`;
  logBuffer = [...logBuffer.slice(-999), stamped];
  mainWindow?.webContents.send("logs:line", stamped);
  await fs.appendFile(path.join(logsRoot(), `${new Date().toISOString().slice(0, 10)}.log`), `${stamped}\n`, "utf8");
}

function runtimeStatus(): RuntimeStatus {
  return {
    running: Boolean(comfyProcess || externalComfyPid),
    pid: comfyProcess?.pid || externalComfyPid,
    url: currentUrl
  };
}

function instanceUrl(instance: LauncherInstance) {
  return `http://127.0.0.1:${instance.port || "8188"}`;
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function portOwner(port: string) {
  const output = await run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Get-NetTCPConnection -LocalPort ${Number(port) || 8188} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`
  ]);
  const pid = Number(output.trim());
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

async function hasComfyApi(instance: LauncherInstance) {
  try {
    await fetchJson(`${instanceUrl(instance)}/system_stats`);
    return true;
  } catch {
    return false;
  }
}

async function preflightComfy(instance: LauncherInstance): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  const comfyExists = Boolean(instance.comfyuiPath) && await exists(instance.comfyuiPath);
  const pythonExists = Boolean(instance.pythonPath) && await exists(instance.pythonPath);
  const mainExists = comfyExists && await exists(path.join(instance.comfyuiPath, "main.py"));
  checks.push({
    id: "comfyui-path",
    label: "ComfyUI 路径",
    status: comfyExists ? "ok" : "bad",
    detail: comfyExists ? instance.comfyuiPath : "未找到 ComfyUI 目录",
    action: comfyExists ? undefined : "open-settings"
  });
  checks.push({
    id: "python-path",
    label: "Python 环境",
    status: pythonExists ? "ok" : "bad",
    detail: pythonExists ? instance.pythonPath : "未找到 Python 可执行文件",
    action: pythonExists ? undefined : "open-settings"
  });
  checks.push({
    id: "main-py",
    label: "启动入口",
    status: mainExists ? "ok" : "bad",
    detail: mainExists ? "main.py 可用" : "当前目录下没有 main.py",
    action: mainExists ? undefined : "open-settings"
  });
  const ownerPid = await portOwner(instance.port || "8188");
  const portHasComfyApi = ownerPid ? await hasComfyApi(instance) : false;
  checks.push({
    id: "port",
    label: `端口 ${instance.port || "8188"}`,
    status: ownerPid ? (portHasComfyApi ? "warn" : "bad") : "ok",
    detail: ownerPid
      ? portHasComfyApi
        ? `已有 ComfyUI 服务在监听，PID ${ownerPid}，可直接接入。`
        : `端口被非 ComfyUI 进程占用，PID ${ownerPid}。`
      : "端口空闲",
    action: ownerPid && !portHasComfyApi ? "release-port" : undefined
  });
  checks.push({
    id: "mode",
    label: "插件模式",
    status: "ok",
    detail: "启动前会按当前模式应用启用/禁用列表。"
  });
  const ready = checks.every((check) => check.status !== "bad");
  return { ready, portOwnerPid: ownerPid, portHasComfyApi, checks };
}

async function releasePort(port: string): Promise<PreflightResult> {
  const ownerPid = await portOwner(port || "8188");
  if (!ownerPid) {
    await appendLog(`端口 ${port || "8188"} 当前没有监听进程。`);
    return {
      ready: true,
      portOwnerPid: null,
      portHasComfyApi: false,
      checks: [{
        id: "port",
        label: `端口 ${port || "8188"}`,
        status: "ok",
        detail: "端口空闲"
      }]
    };
  }
  await run("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${ownerPid} -Force`]);
  await appendLog(`已尝试释放端口 ${port || "8188"}，结束进程 PID ${ownerPid}`);
  return {
    ready: true,
    portOwnerPid: null,
    portHasComfyApi: false,
    checks: [{
      id: "port",
      label: `端口 ${port || "8188"}`,
      status: "ok",
      detail: "已尝试释放端口，请重新执行启动前检查。"
    }]
  };
}

async function postComfy(instance: LauncherInstance, endpoint: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2200);
  try {
    const response = await fetch(`${instanceUrl(instance)}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return "ok";
  } finally {
    clearTimeout(timer);
  }
}

async function queueStatus(instance: LauncherInstance): Promise<QueueStatus> {
  try {
    const json: any = await fetchJson(`${instanceUrl(instance)}/queue`);
    return {
      running: Array.isArray(json.queue_running) ? json.queue_running.length : 0,
      pending: Array.isArray(json.queue_pending) ? json.queue_pending.length : 0
    };
  } catch {
    return { running: 0, pending: 0 };
  }
}

async function interruptComfy(instance: LauncherInstance) {
  await postComfy(instance, "/interrupt", {});
  await appendLog("已发送中断当前生成请求");
  return queueStatus(instance);
}

async function clearQueue(instance: LauncherInstance) {
  await postComfy(instance, "/queue", { clear: true });
  await appendLog("已清空 ComfyUI 等待队列");
  return queueStatus(instance);
}

async function freeComfyMemory(instance: LauncherInstance) {
  await postComfy(instance, "/free", { unload_models: true, free_memory: true });
  await appendLog("已请求卸载模型并释放内存");
  return systemStats(instance);
}

async function clearComfyHistory(instance: LauncherInstance) {
  await postComfy(instance, "/history", { clear: true });
  await appendLog("已清空 ComfyUI history");
  return comfyHistory(instance);
}

async function systemStats(instance: LauncherInstance): Promise<SystemStats> {
  try {
    const json: any = await fetchJson(`${instanceUrl(instance)}/system_stats`);
    return {
      os: json.system?.os || "",
      python: json.system?.python_version || "",
      pytorch: json.system?.pytorch_version || "",
      devices: (json.devices || []).map((device: any) => ({
        name: device.name || "Unknown device",
        type: device.type || "",
        vramTotal: Number(device.vram_total || 0),
        vramFree: Number(device.vram_free || 0),
        torchVramTotal: Number(device.torch_vram_total || 0),
        torchVramFree: Number(device.torch_vram_free || 0)
      }))
    };
  } catch {
    return { os: "", python: "", pytorch: "", devices: [] };
  }
}

async function startComfy(instance: LauncherInstance) {
  if (comfyProcess) return runtimeStatus();
  if (externalComfyPid && (await hasComfyApi(instance))) return runtimeStatus();
  if (!(await exists(instance.comfyuiPath))) throw new Error("ComfyUI 路径不存在");
  if (!(await exists(instance.pythonPath))) throw new Error("Python 路径不存在");
  if (!(await exists(path.join(instance.comfyuiPath, "main.py")))) throw new Error("ComfyUI 路径中未找到 main.py");
  const ownerPid = await portOwner(instance.port || "8188");
  if (ownerPid) {
    currentUrl = instanceUrl(instance);
    if (await hasComfyApi(instance)) {
      externalComfyPid = ownerPid;
      await appendLog(`检测到端口 ${instance.port || "8188"} 已有 ComfyUI 在运行，已接入现有实例（PID ${ownerPid}）`);
      return runtimeStatus();
    }
    throw new Error(`端口 ${instance.port || "8188"} 已被进程 ${ownerPid} 占用，但不是可识别的 ComfyUI 服务`);
  }
  await syncModelPathConfig(instance);
  currentUrl = instanceUrl(instance);
  externalComfyPid = null;
  const env = { ...process.env };
  if (instance.proxyEnabled && instance.proxyAddress) {
    env.HTTP_PROXY = instance.proxyAddress;
    env.HTTPS_PROXY = instance.proxyAddress;
  }
  if (instance.hfMirrorEnabled) env.HF_ENDPOINT = "https://hf-mirror.com";
  comfyProcess = spawn(instance.pythonPath, buildArgs(instance), {
    cwd: instance.comfyuiPath,
    env,
    windowsHide: true
  });
  await appendLog(`启动: ${instance.pythonPath} ${buildArgs(instance).join(" ")}`);
  comfyProcess.stdout.on("data", (data) => appendLog(String(data).trimEnd()));
  comfyProcess.stderr.on("data", (data) => appendLog(String(data).trimEnd()));
  comfyProcess.on("exit", (code) => {
    appendLog(`ComfyUI 已退出，代码 ${code ?? "unknown"}`);
    comfyProcess = null;
    externalComfyPid = null;
    mainWindow?.webContents.send("comfy:status", runtimeStatus());
  });
  return runtimeStatus();
}

function browserCandidates(): BrowserOption[] {
  const local = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const rows: BrowserOption[] = [
    { id: "default", label: "系统默认", path: "", available: true },
    { id: "edge", label: "Microsoft Edge", path: path.join(programFilesX86, "Microsoft\\Edge\\Application\\msedge.exe"), available: false },
    { id: "chrome", label: "Google Chrome", path: path.join(programFiles, "Google\\Chrome\\Application\\chrome.exe"), available: false },
    { id: "chrome-user", label: "Chrome 用户安装", path: path.join(local, "Google\\Chrome\\Application\\chrome.exe"), available: false },
    { id: "firefox", label: "Firefox", path: path.join(programFiles, "Mozilla Firefox\\firefox.exe"), available: false },
    { id: "custom", label: "自定义路径", path: "", available: true }
  ];
  return rows.map((row) => ({ ...row, available: row.available || fssync.existsSync(row.path) }));
}

function resolveBrowserPath(choice?: string, customPath?: string) {
  if (choice === "custom") return customPath || "";
  return browserCandidates().find((browser) => browser.id === choice)?.path || "";
}

async function openComfyWeb(browserChoice?: string, browserPath?: string) {
  if (!currentUrl) return;
  const resolved = resolveBrowserPath(browserChoice, browserPath);
  if (resolved && await exists(resolved)) {
    const child = spawn(resolved, [currentUrl], { windowsHide: true, detached: true });
    child.unref();
    return;
  }
  await shell.openExternal(currentUrl);
}

async function coreVersionInfo(instance: LauncherInstance): Promise<CoreVersionInfo> {
  const cwd = instance.comfyuiPath;
  return {
    branch: await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    commit: await run("git", ["rev-parse", "--short", "HEAD"], cwd),
    tag: await run("git", ["describe", "--tags", "--exact-match"], cwd),
    remote: await run("git", ["remote", "get-url", "origin"], cwd),
    status: await run("git", ["status", "--short"], cwd)
  };
}

async function updateCore(instance: LauncherInstance) {
  const cwd = instance.comfyuiPath;
  if (!(await exists(path.join(cwd, ".git")))) throw new Error("当前 ComfyUI 目录不是 Git 仓库");
  await appendLog("开始更新 ComfyUI 内核...");
  const outputs = [
    await run("git", ["fetch", "--tags", "origin"], cwd),
    await run("git", ["checkout", "master"], cwd),
    await run("git", ["pull", "--ff-only", "origin", "master"], cwd)
  ].filter(Boolean);
  const text = outputs.join("\n\n") || "ComfyUI 内核更新命令已完成";
  await appendLog(text);
  return text;
}

async function stopComfy() {
  if (comfyProcess) {
    comfyProcess.kill();
    comfyProcess = null;
    await appendLog("已发送停止信号");
  } else if (externalComfyPid) {
    await appendLog(`已断开外部 ComfyUI 实例（PID ${externalComfyPid}）。如需结束该实例，请在任务管理器或原启动窗口中停止。`);
    externalComfyPid = null;
    currentUrl = null;
  }
  return runtimeStatus();
}

function run(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let output = "";
    child.stdout.on("data", (data) => (output += String(data)));
    child.stderr.on("data", (data) => (output += String(data)));
    child.on("close", () => resolve(output.trim()));
    child.on("error", (error) => resolve(error.message));
  });
}

async function scanPlugins(instance: LauncherInstance): Promise<PluginInfo[]> {
  const root = path.join(instance.comfyuiPath, "custom_nodes");
  const disabledRoot = path.join(root, ".disabled");
  const rows: PluginInfo[] = [];
  async function scan(parent: string, enabled: boolean) {
    if (!(await exists(parent))) return;
    const entries = await fs.readdir(parent, { withFileTypes: true });
    const plugins = entries.filter((entry) => entry.isDirectory() && entry.name !== "__pycache__" && entry.name !== ".disabled");
    const scanned = await Promise.all(plugins.map(async (entry) => {
      const pluginPath = path.join(parent, entry.name);
      const isGit = await exists(path.join(pluginPath, ".git"));
      const [branch, remote, commit] = isGit
        ? await Promise.all([
            run("git", ["rev-parse", "--abbrev-ref", "HEAD"], pluginPath),
            run("git", ["remote", "get-url", "origin"], pluginPath),
            run("git", ["rev-parse", "--short", "HEAD"], pluginPath)
          ])
        : ["", "", ""];
      const hasRequirements = await exists(path.join(pluginPath, "requirements.txt"));
      const problems = [
        ...(isGit && branch === "HEAD" ? ["detached HEAD"] : []),
        ...(isGit && !remote ? ["缺少 origin remote"] : [])
      ];
      return {
        name: entry.name,
        path: pluginPath,
        enabled,
        isGit,
        branch,
        commit,
        status: isGit ? "Git 插件" : "本地插件",
        remote,
        hasRequirements,
        health: {
          problems,
          duplicateKeys: [],
          detachedHead: branch === "HEAD",
          missingRemote: isGit && !remote
        }
      } as PluginInfo;
    }));
    rows.push(...scanned.filter(Boolean) as PluginInfo[]);
  }
  await scan(root, true);
  await scan(disabledRoot, false);
  const nameCounts = new Map<string, number>();
  const remoteCounts = new Map<string, number>();
  for (const row of rows) {
    nameCounts.set(row.name.toLowerCase(), (nameCounts.get(row.name.toLowerCase()) || 0) + 1);
    if (row.remote) remoteCounts.set(row.remote, (remoteCounts.get(row.remote) || 0) + 1);
  }
  for (const row of rows) {
    if ((nameCounts.get(row.name.toLowerCase()) || 0) > 1) row.health.duplicateKeys.push("同名插件");
    if (row.remote && (remoteCounts.get(row.remote) || 0) > 1) row.health.duplicateKeys.push("同 Git remote");
    if (row.health.duplicateKeys.length) row.health.problems.push(`重复: ${row.health.duplicateKeys.join(", ")}`);
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function copyDir(from: string, to: string) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true, force: true });
}

async function backupPlugin(pluginPath: string) {
  if (!(await exists(pluginPath))) throw new Error("插件不存在");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupsRoot(), "plugins", `${stamp}_${path.basename(pluginPath)}`);
  await copyDir(pluginPath, target);
  return target;
}

async function listBackups() {
  const root = path.join(backupsRoot(), "plugins");
  if (!(await exists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const rows = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const full = path.join(root, entry.name);
        const stat = await fs.stat(full);
        return {
          name: entry.name,
          path: full,
          type: "directory",
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        } as DirEntry;
      })
  );
  return rows.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

async function restoreBackup(instance: LauncherInstance, backupPath: string) {
  if (!(await exists(backupPath))) throw new Error("备份不存在");
  const pluginName = path.basename(backupPath).replace(/^\d{4}-\d{2}-\d{2}T[^_]+_/, "");
  const target = path.join(instance.comfyuiPath, "custom_nodes", pluginName);
  if (await exists(target)) {
    const previous = path.join(backupsRoot(), "plugins", `${new Date().toISOString().replace(/[:.]/g, "-")}_${pluginName}_before_restore`);
    await copyDir(target, previous);
    await fs.rm(target, { recursive: true, force: true });
  }
  await copyDir(backupPath, target);
  return scanPlugins(instance);
}

async function togglePlugin(instance: LauncherInstance, name: string, enable: boolean) {
  const customNodes = path.join(instance.comfyuiPath, "custom_nodes");
  const enabledPath = path.join(customNodes, name);
  const disabledPath = path.join(customNodes, ".disabled", name);
  await fs.mkdir(path.dirname(disabledPath), { recursive: true });
  if (enable && !(await exists(disabledPath)) && (await exists(enabledPath))) return scanPlugins(instance);
  if (!enable && !(await exists(enabledPath)) && (await exists(disabledPath))) return scanPlugins(instance);
  if (enable) await fs.rename(disabledPath, enabledPath);
  else await fs.rename(enabledPath, disabledPath);
  return scanPlugins(instance);
}

async function tryTogglePlugin(instance: LauncherInstance, name: string, enable: boolean) {
  try {
    await togglePlugin(instance, name, enable);
    return "";
  } catch (error) {
    const action = enable ? "启用" : "禁用";
    const message = error instanceof Error ? error.message : String(error);
    const note = `${action}插件失败：${name}。${message}`;
    await appendLog(note);
    return note;
  }
}

async function previewMode(instance: LauncherInstance, mode: LauncherMode): Promise<ModePreview> {
  const plugins = await scanPlugins(instance);
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  const desiredEnabled = new Set(mode.enabledPlugins || []);
  const disabled = new Set(mode.disabledPlugins || []);
  const enable: string[] = [];
  const disable: string[] = [];
  const unchanged: string[] = [];
  const missing: string[] = [];
  for (const plugin of plugins) {
    const shouldEnable = mode.applyStrategy === "enabled-only" ? desiredEnabled.has(plugin.name) : !disabled.has(plugin.name);
    if (shouldEnable && !plugin.enabled) enable.push(plugin.name);
    else if (!shouldEnable && plugin.enabled) disable.push(plugin.name);
    else unchanged.push(plugin.name);
  }
  for (const name of [...desiredEnabled, ...disabled]) {
    if (!byName.has(name)) missing.push(name);
  }
  return { enable, disable, unchanged, missing };
}

async function applyMode(instance: LauncherInstance, mode: LauncherMode) {
  const preview = await previewMode(instance, mode);
  const failures: string[] = [];
  for (const name of preview.enable) {
    const failure = await tryTogglePlugin(instance, name, true);
    if (failure) failures.push(failure);
  }
  for (const name of preview.disable) {
    const failure = await tryTogglePlugin(instance, name, false);
    if (failure) failures.push(failure);
  }
  if (failures.length) {
    await appendLog(`模式已部分应用，${failures.length} 个插件移动失败。请先停止 ComfyUI 或关闭占用目录的程序后重试。`);
  }
  return scanPlugins(instance);
}

async function duplicateMode(config: LauncherConfig, modeId: string) {
  const source = config.modes.find((mode) => mode.id === modeId);
  if (!source) return config;
  const copy = { ...source, id: id("mode"), name: `${source.name} 副本` };
  return saveConfig({ ...config, currentModeId: copy.id, modes: [...config.modes, copy] });
}

async function deleteMode(config: LauncherConfig, modeId: string) {
  if (config.modes.length <= 1) return config;
  const modes = config.modes.filter((mode) => mode.id !== modeId);
  return saveConfig({ ...config, currentModeId: modes[0].id, modes });
}

async function installPlugin(instance: LauncherInstance, repoUrl: string) {
  const name = repoUrl.split("/").pop()?.replace(/\.git$/, "") || `plugin-${Date.now()}`;
  const target = path.join(instance.comfyuiPath, "custom_nodes", name);
  if (await exists(target)) throw new Error("目标插件目录已存在");
  await appendLog(`安装插件: ${repoUrl}`);
  await run("git", ["clone", repoUrl, target], instance.comfyuiPath);
  return scanPlugins(instance);
}

async function updatePlugin(pluginPath: string) {
  await backupPlugin(pluginPath);
  await appendLog(`更新插件: ${pluginPath}`);
  return run("git", ["pull", "--ff-only"], pluginPath);
}

async function repairGit(pluginPath: string) {
  const outputs = [
    await run("git", ["status"], pluginPath),
    await run("git", ["gc", "--prune=now"], pluginPath),
    await run("git", ["fsck"], pluginPath)
  ];
  return outputs.filter(Boolean).join("\n\n");
}

async function bindRemote(pluginPath: string, remoteUrl: string) {
  const hasOrigin = await run("git", ["remote", "get-url", "origin"], pluginPath);
  if (hasOrigin && !hasOrigin.includes("No such remote")) {
    return run("git", ["remote", "set-url", "origin", remoteUrl], pluginPath);
  }
  return run("git", ["remote", "add", "origin", remoteUrl], pluginPath);
}

async function installPluginRequirements(instance: LauncherInstance, pluginPath: string) {
  const requirements = path.join(pluginPath, "requirements.txt");
  if (!(await exists(requirements))) throw new Error("插件没有 requirements.txt");
  await appendLog(`安装插件依赖: ${requirements}`);
  return run(instance.pythonPath, ["-m", "pip", "install", "-r", requirements]);
}

async function keyPackages(pythonPath: string): Promise<EnvironmentPackage[]> {
  const names = ["torch", "torchvision", "torchaudio", "xformers", "triton", "sageattention", "nunchaku"];
  const script = `import importlib.metadata as m\nfor n in ${JSON.stringify(names)}:\n    try:\n        version = m.version(n)\n        version = version.encode("ascii", "replace").decode("ascii")\n        print(f"{n}=={version}")\n    except Exception:\n        print(f"{n}==not installed")`;
  const output = await run(pythonPath, ["-c", script]);
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, ...rest] = line.split("==");
    const version = rest.join("==") || "unknown";
    return { name, version: version === "not installed" ? "未安装" : version };
  });
}

async function installTool(instance: LauncherInstance, tool: string) {
  const commands: Record<string, string[]> = {
    requirements: ["-m", "pip", "install", "-r", path.join(instance.comfyuiPath, "requirements.txt")],
    xformers: ["-m", "pip", "install", "xformers"],
    SageAttention: ["-m", "pip", "install", "sageattention"],
    Torch: ["-m", "pip", "install", "torch", "torchvision", "torchaudio"],
    Triton: ["-m", "pip", "install", "triton"],
    Nunchaku: ["-m", "pip", "install", "nunchaku"]
  };
  const args = commands[tool];
  if (!args) throw new Error(`未知工具: ${tool}`);
  await appendLog(`安装环境组件: ${tool}`);
  const output = await run(instance.pythonPath, args);
  await appendLog(output || `${tool} 安装命令已结束`);
  return output;
}

async function syncComfyConfig(instance: LauncherInstance) {
  return syncModelPathConfig(instance);
}

async function analyzeWorkflow(instance: LauncherInstance, filePath: string): Promise<WorkflowAnalysisResult> {
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
  const nodeTypes = new Set<string>();
  function visit(value: any) {
    if (!value || typeof value !== "object") return;
    if (typeof value.class_type === "string") nodeTypes.add(value.class_type);
    if (typeof value.type === "string" && value.widgets_values) nodeTypes.add(value.type);
    for (const child of Object.values(value)) visit(child);
  }
  visit(raw);

  const installed = await scanPlugins(instance);
  const pluginNames = new Set(installed.map((plugin) => plugin.name));
  const localMappings: Record<string, string> = {};
  const suggested = new Set<string>();
  const matched = new Set<string>();
  const missing: string[] = [];
  for (const nodeType of nodeTypes) {
    const mapped = localMappings[nodeType];
    if (mapped) {
      suggested.add(mapped);
      if (pluginNames.has(mapped)) matched.add(mapped);
      else missing.push(nodeType);
    } else {
      missing.push(nodeType);
    }
  }
  return {
    filePath,
    nodeTypes: [...nodeTypes].sort(),
    missingNodeTypes: [...new Set(missing)].sort(),
    matchedPlugins: [...matched].sort(),
    suggestedPlugins: [...suggested].sort()
  };
}

const mediaExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov"]);
const videoExtensions = new Set([".mp4", ".webm", ".mov"]);
const modelExtensions = new Set([".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".onnx", ".vae", ".sft"]);

function outputFolders(instance: LauncherInstance) {
  const base = path.join(instance.comfyuiPath, "output");
  const refs = (instance.pathReferences || [])
    .filter((ref) => ref.enabled && ref.kind === "outputs" && ref.path)
    .map((ref) => ref.path);
  return [...new Set([base, ...refs])];
}

async function listMedia(instance: LauncherInstance): Promise<MediaItem[]> {
  const rows: MediaItem[] = [];
  async function walk(folder: string, depth = 0) {
    if (depth > 2 || rows.length >= 220 || !(await exists(folder))) return;
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!mediaExtensions.has(ext)) continue;
      const stat = await fs.stat(full);
      rows.push({
        name: entry.name,
        path: full,
        fileUrl: pathToFileURL(full).toString(),
        type: videoExtensions.has(ext) ? "video" : "image",
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
  }
  for (const folder of outputFolders(instance)) await walk(folder);
  return rows.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 220);
}

function modelFolders(instance: LauncherInstance) {
  const base = path.join(instance.comfyuiPath, "models");
  const refs = (instance.pathReferences || [])
    .filter((ref) => ref.enabled && ref.kind === "models" && ref.path)
    .map((ref) => ref.path);
  return [...new Set([base, ...refs])];
}

async function listModels(instance: LauncherInstance): Promise<ModelItem[]> {
  const rows: ModelItem[] = [];
  async function walk(root: string, folder: string, depth = 0) {
    if (depth > 4 || rows.length >= 1500 || !(await exists(folder))) return;
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        await walk(root, full, depth + 1);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!modelExtensions.has(ext)) continue;
      const stat = await fs.stat(full);
      const relative = path.relative(root, full);
      const category = relative.split(path.sep)[0] || "models";
      rows.push({
        name: entry.name,
        path: full,
        category,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
  }
  for (const folder of modelFolders(instance)) await walk(folder, folder);
  return rows.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

async function deleteMedia(target: string) {
  if (!(await exists(target))) return false;
  await fs.rm(target, { force: true });
  return true;
}

function revealInFolder(target: string) {
  if (!target || !fssync.existsSync(target)) throw new Error("文件不存在，无法在文件夹中显示");
  shell.showItemInFolder(target);
  return true;
}

async function comfyHistory(instance: LauncherInstance): Promise<HistoryItem[]> {
  try {
    const json: any = await fetchJson(`${instanceUrl(instance)}/history`);
    return Object.entries<any>(json)
      .slice(-80)
      .reverse()
      .map(([idValue, item]) => {
        const outputs = item?.outputs && typeof item.outputs === "object" ? Object.values<any>(item.outputs) : [];
        const outputCount = outputs.reduce((count, output) => {
          const images = Array.isArray(output?.images) ? output.images.length : 0;
          const videos = Array.isArray(output?.videos) ? output.videos.length : 0;
          return count + images + videos;
        }, 0);
        const prompt = Array.isArray(item?.prompt) ? item.prompt[2] : null;
        const nodeCount = prompt && typeof prompt === "object" ? Object.keys(prompt).length : 0;
        return { id: idValue, outputCount, nodeCount };
      });
  } catch {
    return [];
  }
}

async function listDir(target: string): Promise<DirEntry[]> {
  if (!(await exists(target))) return [];
  const entries = await fs.readdir(target, { withFileTypes: true });
  const rows = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(target, entry.name);
      const stat = await fs.stat(full);
      return {
        name: entry.name,
        path: full,
        type: entry.isDirectory() ? "directory" : "file",
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      } as DirEntry;
    })
  );
  return rows.sort((a, b) => Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name));
}

async function selectFolder() {
  const options = { properties: ["openDirectory"] as Array<"openDirectory"> };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  return result.canceled ? "" : result.filePaths[0];
}

async function selectFile(filters?: Electron.FileFilter[]) {
  const options = {
    properties: ["openFile"],
    filters: filters || [{ name: "JSON", extensions: ["json"] }, { name: "All files", extensions: ["*"] }]
  } as Electron.OpenDialogOptions;
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  return result.canceled ? "" : result.filePaths[0];
}

async function createWindow() {
  const iconPath = fssync.existsSync(path.join(__dirname, "transparent.ico"))
    ? path.join(__dirname, "transparent.ico")
    : path.join(__dirname, "../electron/transparent.ico");
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 860,
    minWidth: 1320,
    minHeight: 720,
    minimizable: true,
    maximizable: true,
    resizable: true,
    fullscreenable: true,
    skipTaskbar: false,
    title: " ",
    icon: iconPath,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#eef5f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("minimize" as never, (event: Electron.Event) => {
    if (!shouldMinimizeToTray()) return;
    event.preventDefault();
    hideMainWindowToTray();
  });
  mainWindow.on("close", (event) => {
    if (isQuitting || !shouldMinimizeToTray()) return;
    event.preventDefault();
    hideMainWindowToTray();
  });
  createTray(iconPath);
}

function createTray(iconPath: string) {
  if (tray) return;
  tray = new Tray(iconPath);
  tray.setToolTip("Comfy Station Launcher Next");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示窗口", click: showMainWindow },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("click", showMainWindow);
}

app.whenReady().then(async () => {
  app.setName(" ");
  Menu.setApplicationMenu(null);
  await ensureDirs();
  await loadConfig();
  await createWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (comfyProcess) comfyProcess.kill();
});

app.on("window-all-closed", () => {
  if (comfyProcess) comfyProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("config:load", loadConfig);
ipcMain.handle("config:save", (_event, config: LauncherConfig) => saveConfig(config));
function windowFromEvent(event: IpcMainEvent) {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

function nativeMinimize(win: BrowserWindow) {
  if (process.platform !== "win32") return;
  const handle = win.getNativeWindowHandle();
  const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0));
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeWindow {
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
[NativeWindow]::ShowWindow([IntPtr]${hwnd}, 6) | Out-Null
`;
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    windowsHide: true
  });
  child.on("error", (error) => appendLog(`[window] native minimize failed: ${error.message}`));
}

ipcMain.on("window:minimize", (event) => {
  const win = windowFromEvent(event);
  if (!win) return;
  if (shouldMinimizeToTray()) {
    hideMainWindowToTray();
    return;
  }
  win.setSkipTaskbar(false);
  if (win.isFullScreen()) win.setFullScreen(false);
  if (process.platform === "win32") {
    nativeMinimize(win);
    return;
  }
  win.minimize();
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isMinimized()) {
      appendLog("[window] electron minimize did not report minimized; using native fallback");
      nativeMinimize(win);
    }
  }, 120);
});
ipcMain.on("window:toggleMaximize", (event) => {
  const win = windowFromEvent(event);
  if (!win) return;
  if (win.isFullScreen()) {
    win.setFullScreen(false);
    return;
  }
  if (win.isMaximized()) {
    win.unmaximize();
    return;
  }
  win.maximize();
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isMaximized()) {
      appendLog("[window] maximize fallback: entering fullscreen");
      win.setFullScreen(true);
    }
  }, 120);
});
ipcMain.on("window:close", (event) => windowFromEvent(event)?.close());
ipcMain.handle("comfy:start", (_event, instance: LauncherInstance) => startComfy(instance));
ipcMain.handle("comfy:stop", stopComfy);
ipcMain.handle("comfy:status", () => runtimeStatus());
ipcMain.handle("comfy:preflight", (_event, instance: LauncherInstance) => preflightComfy(instance));
ipcMain.handle("comfy:releasePort", (_event, port: string) => releasePort(port));
ipcMain.handle("comfy:openWeb", (_event, browserChoice?: string, browserPath?: string) => openComfyWeb(browserChoice, browserPath));
ipcMain.handle("comfy:coreVersion", (_event, instance: LauncherInstance) => coreVersionInfo(instance));
ipcMain.handle("comfy:updateCore", (_event, instance: LauncherInstance) => updateCore(instance));
ipcMain.handle("comfy:queue", (_event, instance: LauncherInstance) => queueStatus(instance));
ipcMain.handle("comfy:systemStats", (_event, instance: LauncherInstance) => systemStats(instance));
ipcMain.handle("comfy:interrupt", (_event, instance: LauncherInstance) => interruptComfy(instance));
ipcMain.handle("comfy:clearQueue", (_event, instance: LauncherInstance) => clearQueue(instance));
ipcMain.handle("comfy:freeMemory", (_event, instance: LauncherInstance) => freeComfyMemory(instance));
ipcMain.handle("comfy:clearHistory", (_event, instance: LauncherInstance) => clearComfyHistory(instance));
ipcMain.handle("browser:list", () => browserCandidates());
ipcMain.handle("filesystem:openPath", (_event, target: string) => shell.openPath(target));
ipcMain.handle("filesystem:listDir", (_event, target: string) => listDir(target));
ipcMain.handle("filesystem:selectFolder", selectFolder);
ipcMain.handle("filesystem:selectFile", (_event, filters?: Electron.FileFilter[]) => selectFile(filters));
ipcMain.handle("plugins:scan", (_event, instance: LauncherInstance) => scanPlugins(instance));
ipcMain.handle("plugins:enable", (_event, instance: LauncherInstance, name: string) => togglePlugin(instance, name, true));
ipcMain.handle("plugins:disable", (_event, instance: LauncherInstance, name: string) => togglePlugin(instance, name, false));
ipcMain.handle("plugins:installFromGit", (_event, instance: LauncherInstance, repoUrl: string) => installPlugin(instance, repoUrl));
ipcMain.handle("plugins:update", (_event, pluginPath: string) => updatePlugin(pluginPath));
ipcMain.handle("plugins:backup", (_event, pluginPath: string) => backupPlugin(pluginPath));
ipcMain.handle("plugins:listBackups", listBackups);
ipcMain.handle("plugins:restore", (_event, instance: LauncherInstance, backupPath: string) => restoreBackup(instance, backupPath));
ipcMain.handle("plugins:health", (_event, instance: LauncherInstance) => scanPlugins(instance));
ipcMain.handle("plugins:checkDuplicate", (_event, instance: LauncherInstance) => scanPlugins(instance));
ipcMain.handle("plugins:repairGit", (_event, pluginPath: string) => repairGit(pluginPath));
ipcMain.handle("plugins:bindRemote", (_event, pluginPath: string, remoteUrl: string) => bindRemote(pluginPath, remoteUrl));
ipcMain.handle("plugins:installRequirements", (_event, instance: LauncherInstance, pluginPath: string) => installPluginRequirements(instance, pluginPath));
ipcMain.handle("modes:preview", (_event, instance: LauncherInstance, mode: LauncherMode) => previewMode(instance, mode));
ipcMain.handle("modes:apply", (_event, instance: LauncherInstance, mode: LauncherMode) => applyMode(instance, mode));
ipcMain.handle("modes:duplicate", (_event, config: LauncherConfig, modeId: string) => duplicateMode(config, modeId));
ipcMain.handle("modes:delete", (_event, config: LauncherConfig, modeId: string) => deleteMode(config, modeId));
ipcMain.handle("paths:syncComfyConfig", (_event, instance: LauncherInstance) => syncComfyConfig(instance));
ipcMain.handle("paths:list", (_event, instance: LauncherInstance) => instance.pathReferences || []);
ipcMain.handle("paths:open", (_event, target: string) => shell.openPath(target));
ipcMain.handle("workflow:analyze", (_event, instance: LauncherInstance, filePath: string) => analyzeWorkflow(instance, filePath));
ipcMain.handle("media:list", (_event, instance: LauncherInstance) => listMedia(instance));
ipcMain.handle("media:delete", (_event, target: string) => deleteMedia(target));
ipcMain.handle("media:reveal", (_event, target: string) => revealInFolder(target));
ipcMain.handle("models:list", (_event, instance: LauncherInstance) => listModels(instance));
ipcMain.handle("models:reveal", (_event, target: string) => revealInFolder(target));
ipcMain.handle("comfy:history", (_event, instance: LauncherInstance) => comfyHistory(instance));
ipcMain.handle("python:version", (_event, pythonPath: string) => run(pythonPath, ["--version"]));
ipcMain.handle("python:pipList", (_event, pythonPath: string) => run(pythonPath, ["-m", "pip", "list"]));
ipcMain.handle("python:installRequirements", (_event, pythonPath: string, requirementsPath: string) =>
  run(pythonPath, ["-m", "pip", "install", "-r", requirementsPath])
);
ipcMain.handle("environment:keyPackages", (_event, pythonPath: string) => keyPackages(pythonPath));
ipcMain.handle("environment:installTool", (_event, instance: LauncherInstance, tool: string) => installTool(instance, tool));
ipcMain.handle("logs:read", () => logBuffer);
ipcMain.handle("logs:clear", () => {
  logBuffer = [];
  return logBuffer;
});
ipcMain.handle("logs:export", async () => logsRoot());
