import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell, Notification, nativeImage, type IpcMainEvent } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  BrowserOption,
  AppUpdateInfo,
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
import * as domain from "./domain";
import * as comfyApi from "./comfyApi";
import { createConfigWriter } from "./configWriter";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let comfyProcess: ChildProcessWithoutNullStreams | null = null;
let logBuffer: string[] = [];
let currentUrl: string | null = null;
let externalComfyPid: number | null = null;
let isQuitting = false;
const appIconFallbackDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAADGElEQVR4nE2TS2hdVRSG/7X2Po977r1Jrkn12sZaIh1IhIai+Bo4qRZBHAnFiaKCtOCgOBDtpDqQoOigAakKOnOiE0Er2IHQiVUhFK4vqmkxlRpj0jTpfZznXkv2uSouOHuwz/o2//73+gknlfEaydzRtbtajc5hcUWrLEsSYTCjLhGAWRAEgTLbYda/cfaXD7o9z5JvmH9h8zkOW0t5xYkokISERkQY/wX8Xloo0lxBBERWUlTD498vTb9Pdx6/Nm9getupYVfl1VRCUADDTFG58QGB9RCxNaCdkTgyse00ReHcgrXGPFYi4crtVN2OtVEUYpABU5GCDcOLyEtg94zbDgOqrq7LzOZOVpU8ZUPuP26ZNAFBk5j52OGouG9O/uinogETjEofAI8gEz9v2WuF2PjDM/1mp22i0l+MNLFComyUClG9bVrdjz9cOkEuWA7Sis/fHT3DTss3z/Opty8O9i8e3ffGZ0lmf9pI9rdbCnKili0gBGROkRZiD85Mrp+9p/XI1SK7v3Dl5Vyw69Unw5MPrARftIz0HeFW3zthAH8/rl1iwBh48+T3G0PuBPbbQ2i+tc9Ev47UBSOV4W/X0yovVJlB7GFPMmD9QjxW0WlZ9+cmP3z53dXVTWfKK3fQQ7fHJp7tjb5aKcr59lPhLapZQYZqxhts6wNM/dGnFwr37L03H9qzxxnnQE/PTUyvro3Wtx4sX1qI2PQu7VxZ2ZC9ccMD/yhgBhwBSQT5eDlPPvq62G0NXKfJeu6EnXznGw0++a7KA6MsytMT7UYXmjsykeHKKzAgYlGwYrLFJm20uwdmDZaOxE4V5etHburs7abB6XMlJhNCkecQ/4Ks6lnLJCkMkZ8FTwSU68U14In3MnJOI2NI01w0tkBZer/Ij2oNM9GIC3VnAozUxJF1qpUypFTIxkB0K1X5ayA6qiDgOlPie0wU2pAyVOo+r+NycHHjeY6apwrH8Xj6AfKp+V+p+oSMKzSaaTF4cfnlXafp3zgvLK4fiKLmo86VLaCCau3zf1UL95YFwSBNt7/svTJ7wbN/A1aBiPfimrfmAAAAAElFTkSuQmCC";

if (process.env.COMFY_STATION_USER_DATA) {
  app.setPath("userData", process.env.COMFY_STATION_USER_DATA);
}

const userData = () => app.getPath("userData");
const dataPath = () => path.join(userData(), "launcher-next.config.json");
let configWriter: ReturnType<typeof createConfigWriter> | undefined;
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
    name: "ComfyUI 环境",
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
  const normalizeVram = (value: string) => value === "榛樿" || value === "??" || !value ? "默认" : value;
  const cleanName = (value: string, fallback: string) => /榛|鏃|鎺|绛|鐜|妯|鎻|璺|濯|鍚|鏈|鍦|\?{2,}/.test(value || "") ? fallback : value || fallback;
  const migrated: LauncherConfig = {
    ...config,
    instances: config.instances.map((instance) => ({
      ...defaultInstance(),
      ...instance,
      name: cleanName(instance.name, "ComfyUI 环境"),
      vramMode: normalizeVram(instance.vramMode) as LauncherInstance["vramMode"],
      pathReferences: instance.pathReferences || [],
      advancedArgs: instance.advancedArgs || {}
    })),
    modes: config.modes.map((mode) => ({
      ...mode,
      name: cleanName(mode.name, "默认模式"),
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
  configWriter ||= createConfigWriter(dataPath());
  await configWriter(config);
  return config;
}

async function exportConfig() {
  await ensureDirs();
  const targetName = `comfy-station-config-${new Date().toISOString().slice(0, 10)}.json`;
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: "导出配置",
        defaultPath: targetName,
        filters: [{ name: "JSON", extensions: ["json"] }]
      })
    : await dialog.showSaveDialog({
        title: "导出配置",
        defaultPath: targetName,
        filters: [{ name: "JSON", extensions: ["json"] }]
      });
  if (result.canceled || !result.filePath) return "";
  await fs.copyFile(dataPath(), result.filePath);
  return result.filePath;
}

async function importConfig() {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, {
        title: "导入配置",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }]
      })
    : await dialog.showOpenDialog({
        title: "导入配置",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }]
      });
  if (result.canceled || !result.filePaths[0]) return null;
  const parsed = JSON.parse(await fs.readFile(result.filePaths[0], "utf8")) as LauncherConfig;
  if (!Array.isArray(parsed.instances) || !Array.isArray(parsed.modes)) {
    throw new Error("配置文件格式不正确");
  }
  return saveConfig(parsed);
}

async function resetConfig() {
  const next = defaultConfig();
  await saveConfig(next);
  return next;
}

async function exportLogs() {
  await ensureDirs();
  const today = new Date().toISOString().slice(0, 10);
  const defaultPath = `comfy-station-logs-${today}.log`;
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: "导出日志",
        defaultPath,
        filters: [{ name: "Log", extensions: ["log", "txt"] }]
      })
    : await dialog.showSaveDialog({
        title: "导出日志",
        defaultPath,
        filters: [{ name: "Log", extensions: ["log", "txt"] }]
      });
  if (result.canceled || !result.filePath) return "";

  let content = logBuffer.join("\n");
  if (!content) {
    const dailyLog = path.join(logsRoot(), `${today}.log`);
    if (await exists(dailyLog)) content = await fs.readFile(dailyLog, "utf8");
  }
  await fs.writeFile(result.filePath, content ? `${content.trimEnd()}\n` : "", "utf8");
  return result.filePath;
}

function buildArgs(instance: LauncherInstance) {
  return domain.buildArgs(instance);
}

function launcherExtraModelConfigPath(instance: LauncherInstance) {
  return domain.launcherExtraModelConfigPath(instance);
}

async function syncModelPathConfig(instance: LauncherInstance) {
  return domain.syncModelPathConfig(instance);
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

function showNotification(title: string, body: string) {
  if (!Notification.isSupported()) return false;
  new Notification({ title, body }).show();
  return true;
}

function compareVersions(a: string, b: string) {
  const left = String(a || "").replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10));
  const right = String(b || "").replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10));
  if (left.some(Number.isNaN) || right.some(Number.isNaN)) return 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) return diff;
  }
  return 0;
}

async function checkAppUpdate(): Promise<AppUpdateInfo> {
  const currentVersion = app.getVersion();
  const response = await fetch("https://api.github.com/repos/lhhkuki/comfyui-launcher-next/releases/latest", {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `Comfy-Station/${currentVersion}`
    }
  });
  if (!response.ok) throw new Error(`检查更新失败：${response.status} ${response.statusText}`);
  const release: any = await response.json();
  const latestVersion = String(release.tag_name || release.name || "").replace(/^v/i, "") || currentVersion;
  const releaseUrl = String(release.html_url || "https://github.com/lhhkuki/comfyui-launcher-next/releases");
  return {
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl,
    releaseName: String(release.name || release.tag_name || latestVersion),
    publishedAt: String(release.published_at || "")
  };
}

async function openExternalSafe(url: string) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("只允许打开 http/https 链接");
  await shell.openExternal(parsed.toString());
}

function instanceUrl(instance: LauncherInstance) {
  return comfyApi.instanceUrl(instance);
}

async function fetchJson(url: string) {
  return comfyApi.fetchJson(url);
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
  return comfyApi.postComfy(instance, endpoint, body);
}

async function queueStatus(instance: LauncherInstance): Promise<QueueStatus> {
  return comfyApi.queueStatus(instance);
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
  return comfyApi.systemStats(instance);
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
    updateTrayMenu();
    mainWindow?.webContents.send("comfy:status", runtimeStatus());
  });
  updateTrayMenu();
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
  const inspect = (args: string[]) => runChecked("git", args, cwd).catch(() => "");
  return {
    branch: await inspect(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: await inspect(["rev-parse", "--short", "HEAD"]),
    tag: await inspect(["describe", "--tags", "--exact-match"]),
    remote: await inspect(["remote", "get-url", "origin"]),
    status: await inspect(["status", "--short"])
  };
}

async function updateCore(instance: LauncherInstance) {
  const cwd = instance.comfyuiPath;
  if (!(await exists(path.join(cwd, ".git")))) throw new Error("当前 ComfyUI 目录不是 Git 仓库");
  const status = await run("git", ["status", "--short"], cwd);
  if (status.trim()) {
    throw new Error(`ComfyUI 目录存在本地改动，已取消更新：\n${status}`);
  }
  await appendLog("开始更新 ComfyUI 内核...");
  const outputs = [
    await runChecked("git", ["fetch", "--tags", "origin"], cwd),
    await runChecked("git", ["checkout", "master"], cwd),
    await runChecked("git", ["pull", "--ff-only", "origin", "master"], cwd)
  ].filter(Boolean);
  const text = outputs.join("\n\n") || "ComfyUI 内核更新完成";
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
  updateTrayMenu();
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

function runChecked(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let output = "";
    child.stdout.on("data", (data) => (output += String(data)));
    child.stderr.on("data", (data) => (output += String(data)));
    child.on("close", (code) => {
      const text = output.trim();
      if (code === 0) resolve(text);
      else reject(new Error(text || `${command} ${args.join(" ")} failed with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function scanPlugins(instance: LauncherInstance): Promise<PluginInfo[]> {
  return domain.scanPlugins(instance, (args: string[], cwd?: string) => run("git", args, cwd));
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
  return domain.togglePlugin(instance, name, enable);
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
  return domain.previewMode(instance, mode);
}

async function applyMode(instance: LauncherInstance, mode: LauncherMode) {
  return domain.applyMode(instance, mode, appendLog);
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
  await runChecked("git", ["clone", repoUrl, target], instance.comfyuiPath);
  return scanPlugins(instance);
}

async function updatePlugin(pluginPath: string) {
  await backupPlugin(pluginPath);
  await appendLog(`更新插件: ${pluginPath}`);
  return runChecked("git", ["pull", "--ff-only"], pluginPath);
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
    return runChecked("git", ["remote", "set-url", "origin", remoteUrl], pluginPath);
  }
  return runChecked("git", ["remote", "add", "origin", remoteUrl], pluginPath);
}

async function installPluginRequirements(instance: LauncherInstance, pluginPath: string) {
  const requirements = path.join(pluginPath, "requirements.txt");
  if (!(await exists(requirements))) throw new Error("插件没有 requirements.txt");
  await appendLog(`安装插件依赖: ${requirements}`);
  return runChecked(instance.pythonPath, ["-m", "pip", "install", "-r", requirements]);
}

async function keyPackages(pythonPath: string): Promise<EnvironmentPackage[]> {
  const names = ["torch", "torchvision", "torchaudio", "xformers", "triton", "sageattention", "nunchaku"];
  const unknownPackages = () => names.map((name) => ({ name, version: "未检测" }));
  if (!pythonPath || !(await exists(pythonPath))) return unknownPackages();

  const script = `import importlib.metadata as m\nfor n in ${JSON.stringify(names)}:\n    try:\n        version = m.version(n)\n        version = version.encode("ascii", "replace").decode("ascii")\n        print(f"{n}=={version}")\n    except Exception:\n        print(f"{n}==not installed")`;
  const output = await run(pythonPath, ["-c", script]);
  const parsed = output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, ...rest] = line.split("==");
    if (!names.includes(name) || !rest.length) return null;
    const version = rest.join("==") || "unknown";
    return { name, version: version === "not installed" ? "未安装" : version };
  }).filter((item): item is EnvironmentPackage => Boolean(item));

  if (!parsed.length) {
    await appendLog("Python 关键包检测失败：请检查 Python 路径是否指向 ComfyUI 使用的 python.exe");
    return unknownPackages();
  }

  const byName = new Map(parsed.map((pkg) => [pkg.name, pkg.version]));
  return names.map((name) => ({ name, version: byName.get(name) || "未检测" }));
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
  const output = await runChecked(instance.pythonPath, args);
  await appendLog(output || `${tool} 安装命令已结束`);
  return output;
}

async function syncComfyConfig(instance: LauncherInstance) {
  return syncModelPathConfig(instance);
}

async function loadWorkflowMappings(instance: LauncherInstance) {
  return domain.loadWorkflowMappings(instance, appendLog);
}

async function analyzeWorkflow(instance: LauncherInstance, filePath: string): Promise<WorkflowAnalysisResult> {
  return domain.analyzeWorkflow(instance, filePath, appendLog);
}

function outputFolders(instance: LauncherInstance) {
  return domain.outputFolders(instance);
}

async function listMedia(instance: LauncherInstance): Promise<MediaItem[]> {
  return domain.listMedia(instance);
}

function modelFolders(instance: LauncherInstance) {
  return domain.modelFolders(instance);
}

async function listModels(instance: LauncherInstance): Promise<ModelItem[]> {
  return domain.listModels(instance);
}

async function deleteMedia(target: string) {
  return domain.deleteMedia(target);
}

function revealInFolder(target: string) {
  if (!target || !fssync.existsSync(target)) throw new Error("文件不存在，无法在文件夹中显示");
  shell.showItemInFolder(target);
  return true;
}

async function comfyHistory(instance: LauncherInstance): Promise<HistoryItem[]> {
  return comfyApi.comfyHistory(instance);
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
  const localIconPath = path.join(__dirname, "app-icon.ico");
  const packagedIconPath = path.join(__dirname, "../electron/app-icon.ico");
  const legacyIconPath = path.join(__dirname, "../electron/transparent.ico");
  const iconPath = fssync.existsSync(localIconPath)
    ? localIconPath
    : fssync.existsSync(packagedIconPath)
      ? packagedIconPath
      : fssync.existsSync(legacyIconPath)
        ? legacyIconPath
        : undefined;
  mainWindow = new BrowserWindow({
    width: process.env.COMFY_STATION_SMOKE ? Number(process.env.COMFY_STATION_SMOKE_WIDTH || 1500) : 1500,
    height: process.env.COMFY_STATION_SMOKE ? Number(process.env.COMFY_STATION_SMOKE_HEIGHT || 860) : 860,
    minWidth: 1120,
    minHeight: 680,
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
  if (process.env.COMFY_STATION_SMOKE) {
    mainWindow.setBounds({ x: 0, y: 0, width: Number(process.env.COMFY_STATION_SMOKE_WIDTH || 1500), height: Number(process.env.COMFY_STATION_SMOKE_HEIGHT || 860) });
  }
  mainWindow.webContents.once("did-finish-load", async () => {
    if (!process.env.COMFY_STATION_SMOKE) return;
    const config = await loadConfig();
    const reportPath = path.join(userData(), "smoke-report.json");
    const screenshotPath = path.join(userData(), "smoke-screenshot.png");
    let screenshotBuffer: Uint8Array = Buffer.alloc(0);
    mainWindow?.show();
    mainWindow?.focus();
    await mainWindow?.webContents.executeJavaScript(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
    ).catch(() => undefined);
    const smokeDelay = Math.max(0, Number(process.env.COMFY_STATION_SMOKE_DELAY_MS || 3500));
    if (smokeDelay) await new Promise((resolve) => setTimeout(resolve, smokeDelay));
    if (process.env.COMFY_STATION_SMOKE_SCENARIO === "tasks") {
      await mainWindow?.webContents.executeJavaScript(`(async () => {
        document.querySelector('button[title="保存配置"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 700));
        document.querySelector('.task-trigger')?.click();
        await new Promise(resolve => setTimeout(resolve, 200));
      })()`);
    }
    if (process.env.COMFY_STATION_SMOKE_WORKFLOW) {
      await mainWindow?.webContents.executeJavaScript(`(async () => {
        const input = document.querySelector('.workflow-panel input');
        if (!input) throw new Error('Workflow input not found');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(process.env.COMFY_STATION_SMOKE_WORKFLOW)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 100));
        document.querySelector('.workflow-panel .primary')?.click();
        for (let i = 0; i < 100; i++) {
          if (document.querySelector('.workflow-models')) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('Workflow analysis timed out');
      })()`);
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const screenshot = await mainWindow?.webContents.capturePage();
      if (screenshot && !screenshot.isEmpty()) {
        screenshotBuffer = screenshot.toPNG();
        if (screenshotBuffer.byteLength > 0) break;
      }
    }
    const bodyText = await mainWindow?.webContents.executeJavaScript(
      "document.body ? document.body.innerText.slice(0, 2000) : ''"
    ).catch(() => "");
    const layout = await mainWindow?.webContents.executeJavaScript(`(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      return { viewport: { width: innerWidth, height: innerHeight },
        center: rect('.center'), models: rect('.model-table'), categories: rect('.model-cats'),
        actions: rect('.env-actions'), environment: rect('.env-main'),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        pluginOverflow: [...document.querySelectorAll('.plugin-row')].some(row => row.scrollHeight > row.clientHeight + 2)
      };
    })()`);
    await fs.writeFile(screenshotPath, screenshotBuffer);
    await fs.writeFile(reportPath, JSON.stringify({
      loaded: true,
      title: mainWindow?.getTitle() || "",
      bounds: mainWindow?.getBounds(),
      layout,
      smokeDelay,
      screenshotPath,
      screenshotBytes: screenshotBuffer.byteLength,
      uiActiveView: config.ui?.activeView || "",
      bodyText,
      configExists: fssync.existsSync(dataPath()),
      instances: config.instances.length,
      modes: config.modes.length,
      firstInstanceName: config.instances[0]?.name || "",
      firstInstancePath: config.instances[0]?.comfyuiPath || "",
      firstModeName: config.modes[0]?.name || ""
    }, null, 2), "utf8");
    if (process.env.COMFY_STATION_SMOKE_EXIT !== "0") {
      isQuitting = true;
      app.quit();
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

function createTray(iconPath?: string) {
  if (tray) return;
  let image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (image.isEmpty()) image = nativeImage.createFromDataURL(appIconFallbackDataUrl);
  tray = new Tray(image);
  tray.setToolTip("Comfy Station Launcher Next");
  updateTrayMenu();
  tray.on("click", showMainWindow);
}

function updateTrayMenu() {
  if (!tray) return;
  const instance = activeInstanceFromDisk();
  const status = runtimeStatus();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status.running ? "ComfyUI \u8fd0\u884c\u4e2d " + (currentUrl || "") : "ComfyUI \u672a\u542f\u52a8", enabled: false },
    { type: "separator" },
    { label: "\u663e\u793a\u7a97\u53e3", click: showMainWindow },
    { label: "\u6253\u5f00\u7f51\u9875", enabled: Boolean(currentUrl), click: () => openComfyWeb(instance?.browserChoice, instance?.browserPath) },
    {
      label: status.running ? "\u505c\u6b62 ComfyUI" : "\u542f\u52a8 ComfyUI",
      enabled: Boolean(instance?.comfyuiPath && instance?.pythonPath),
      click: async () => {
        try {
          if (runtimeStatus().running) await stopComfy();
          else if (instance) await startComfy(instance);
          updateTrayMenu();
        } catch (error) {
          await appendLog(error instanceof Error ? error.message : String(error));
        }
      }
    },
    { type: "separator" },
    {
      label: "\u9000\u51fa",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
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
ipcMain.handle("config:export", exportConfig);
ipcMain.handle("config:import", importConfig);
ipcMain.handle("config:reset", resetConfig);
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
ipcMain.handle("app:checkUpdate", checkAppUpdate);
ipcMain.handle("app:openExternal", (_event, url: string) => openExternalSafe(url));
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
ipcMain.handle("filesystem:exists", (_event, target: string) => exists(target));
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
ipcMain.handle("logs:export", exportLogs);
ipcMain.handle("notifications:show", (_event, title: string, body: string) => showNotification(title, body));
