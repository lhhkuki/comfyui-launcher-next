import { useEffect, useMemo, useRef, useState } from "react";
import { diagnoseLogs } from "./logDiagnostics";
import { TaskCenter } from "./TaskCenter";
import { readTasks, retainTasks, TASK_HISTORY_KEY, type TaskRecord } from "./taskHistory";
import type {
  AppUpdateInfo,
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
  PathReferenceKind,
  PluginInfo,
  PreflightResult,
  QueueStatus,
  RuntimeStatus,
  SystemStats,
  WorkflowAnalysisResult
} from "../types";
import {
  blankInstance,
  blankMode,
  defaultConfig,
  guessPythonPath,
  normalizeConfig,
  normalizeInstance,
  normalizeMode,
  normalizeView,
  pathKindLabels,
  pluginNameFromUrl,
  pythonPathCandidates,
  selectConfigInstance,
  selectConfigMode,
  uid
} from "./appModel";
import type { LaunchPhase, LogFilter, PluginFilter, ToolView } from "./appModel";
import { Onboarding, Sidebar, TopBar, WindowControls, type SetupCheck } from "./shell";
import {
  ConsoleView,
  EnvironmentView,
  LogsView,
  MediaView,
  ModelsView,
  PathsView,
  PluginsView,
  SettingsView,
  WorkflowView
} from "./views";

export function App() {
  const logBoxRef = useRef<HTMLPreElement | null>(null);
  const queueWasBusyRef = useRef(false);
  const lastNotifiedHistoryRef = useRef("");
  const [config, setConfig] = useState<LauncherConfig>(defaultConfig);
  const [view, setView] = useState<ToolView>("settings");
  const [status, setStatus] = useState<RuntimeStatus>({ running: false, pid: null, url: null });
  const [queue, setQueue] = useState<QueueStatus>({ running: 0, pending: 0 });
  const [systemStats, setSystemStats] = useState<SystemStats>({ os: "", python: "", pytorch: "", devices: [] });
  const [logs, setLogs] = useState<string[]>([]);
  const [followLogs, setFollowLogs] = useState(true);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [modelDirs, setModelDirs] = useState<DirEntry[]>([]);
  const [modelItems, setModelItems] = useState<ModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [backups, setBackups] = useState<DirEntry[]>([]);
  const [packages, setPackages] = useState<EnvironmentPackage[]>([]);
  const [browsers, setBrowsers] = useState<BrowserOption[]>([]);
  const [coreInfo, setCoreInfo] = useState<CoreVersionInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [modePreview, setModePreview] = useState<ModePreview>({ enable: [], disable: [], unchanged: [], missing: [] });
  const [workflow, setWorkflow] = useState<WorkflowAnalysisResult | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>(readTasks);
  const [tasksOpen, setTasksOpen] = useState(false);
  const busy = tasks.some((task) => task.state === "running");
  const [launchPhase, setLaunchPhase] = useState<LaunchPhase>("idle");
  const [lastPreflight, setLastPreflight] = useState<PreflightResult | null>(null);
  const [lastLaunchError, setLastLaunchError] = useState("");
  const [message, setMessage] = useState("已加载本地配置");
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginFilter, setPluginFilter] = useState<PluginFilter>("all");
  const [modelSearch, setModelSearch] = useState("");
  const [mediaSearch, setMediaSearch] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [workflowPath, setWorkflowPath] = useState("");
  const workflowPathRef = useRef(workflowPath);
  workflowPathRef.current = workflowPath;
  const [newPath, setNewPath] = useState("");
  const [newPathKind, setNewPathKind] = useState<PathReferenceKind>("models");
  const [setupChecks, setSetupChecks] = useState<SetupCheck[]>([]);

  useEffect(() => {
    try { localStorage.setItem(TASK_HISTORY_KEY, JSON.stringify(tasks)); }
    catch { /* Task feedback remains available when local storage is full. */ }
  }, [tasks]);

  const activeInstance = useMemo(() => normalizeInstance(config.instances.find((item) => item.id === config.currentInstanceId) || config.instances[0]), [config]);
  const activeMode = useMemo(() => normalizeMode(config.modes.find((item) => item.id === config.currentModeId) || config.modes[0]), [config]);
  const activeDataKey = JSON.stringify([activeInstance.id, activeInstance.comfyuiPath, activeInstance.pythonPath, activeInstance.port]);
  const activeDataKeyRef = useRef(activeDataKey);
  activeDataKeyRef.current = activeDataKey;
  const needsOnboarding = !activeInstance.comfyuiPath || !activeInstance.pythonPath;
  const enabledCount = plugins.filter((plugin) => plugin.enabled).length;
  const issueCount = plugins.filter((plugin) => plugin.health?.problems?.length).length;
  const requirementCount = plugins.filter((plugin) => plugin.hasRequirements).length;
  const errors = logs.filter((line) => /error|failed|traceback|exception|ModuleNotFoundError|ImportError|错误|失败/i.test(line)).length;
  const warnings = logs.filter((line) => /warn|warning|警告/i.test(line)).length;

  const filteredPlugins = plugins.filter((plugin) => {
    const matchesSearch = plugin.name.toLowerCase().includes(pluginSearch.toLowerCase());
    const matchesFilter =
      pluginFilter === "all" ||
      (pluginFilter === "issues" && !!plugin.health?.problems?.length) ||
      (pluginFilter === "disabled" && !plugin.enabled) ||
      (pluginFilter === "requirements" && plugin.hasRequirements) ||
      (pluginFilter === "git" && plugin.isGit);
    return matchesSearch && matchesFilter;
  });

  const filteredModels = modelItems.filter((item) => `${item.category} ${item.name}`.toLowerCase().includes(modelSearch.toLowerCase()));
  const filteredMedia = mediaItems.filter((item) => item.name.toLowerCase().includes(mediaSearch.toLowerCase()));
  const modelCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of modelItems) counts.set(item.category, (counts.get(item.category) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [modelItems]);
  const activePluginNames = useMemo(() => new Set(plugins.map((plugin) => plugin.name)), [plugins]);

  const launchArgs = [
    activeInstance.proxyEnabled && activeInstance.proxyAddress ? `HTTP_PROXY=${activeInstance.proxyAddress}` : "",
    activeInstance.proxyEnabled && activeInstance.proxyAddress ? `HTTPS_PROXY=${activeInstance.proxyAddress}` : "",
    activeInstance.hfMirrorEnabled ? "HF_ENDPOINT=https://hf-mirror.com" : "",
    "main.py",
    activeInstance.port ? `--port ${activeInstance.port}` : "",
    activeInstance.gpu ? `--cuda-device ${activeInstance.gpu}` : "",
    activeInstance.vramMode !== "默认" ? `--${activeInstance.vramMode}` : "",
    activeInstance.disableXformers ? "--disable-xformers" : "",
    activeInstance.disableMetadata ? "--disable-metadata" : "",
    activeInstance.enableManager ? "--enable-manager" : "",
    activeInstance.extraArgs
  ].filter(Boolean).join(" ");

  const visibleLogs = useMemo(() => {
    if (logFilter === "errors") return logs.filter((line) => /error|failed|traceback|exception|ModuleNotFoundError|ImportError|错误|失败/i.test(line));
    if (logFilter === "warnings") return logs.filter((line) => /warn|warning|警告/i.test(line));
    return logs;
  }, [logs, logFilter]);

  const diagnostics = useMemo(() => {
    return diagnoseLogs(logs);
  }, [logs]);

  useEffect(() => {
    let disposed = false;
    async function boot() {
      const loaded = normalizeConfig(await window.launcher.config.load());
      if (disposed) return;
      setConfig(loaded);
      setView(needsConfiguredView(loaded));
      setLogs(await window.launcher.logs.read());
      setBrowsers(await window.launcher.browser.list());
      const runtime = await window.launcher.comfy.status() as RuntimeStatus;
      setStatus(runtime);
    }
    boot().catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    const offLine = window.launcher.logs.onLine((line) => setLogs((rows) => [...rows.slice(-999), line]));
    const offStatus = window.launcher.comfy.onStatus((next) => setStatus(next as RuntimeStatus));
    return () => {
      disposed = true;
      offLine();
      offStatus();
    };
  }, []);

  useEffect(() => {
    if (!followLogs) return;
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [visibleLogs, followLogs, view]);

  useEffect(() => {
    if (!activeInstance.comfyuiPath) return;
    setWorkflow(null);
    void refreshLightData().catch((error) => setMessage(`加载环境失败：${String(error)}`));
  }, [activeDataKey]);

  useEffect(() => {
    queueWasBusyRef.current = false;
    lastNotifiedHistoryRef.current = "";
  }, [activeInstance.id]);

  useEffect(() => {
    if (!activeInstance.comfyuiPath) return;
    refreshModePreview();
  }, [activeInstance.id, activeMode.id, activeMode.enabledPlugins.join("|"), activeMode.disabledPlugins.join("|"), activeMode.applyStrategy, plugins.length]);

  useEffect(() => {
    if (!activeInstance.comfyuiPath) return;
    const timer = window.setInterval(() => {
      void refreshRuntime().catch((error) => setMessage(`刷新运行状态失败：${String(error)}`));
    }, status.running ? 2500 : 6000);
    return () => window.clearInterval(timer);
  }, [activeInstance.id, activeInstance.port, status.running]);

  useEffect(() => {
    let disposed = false;
    async function inspectSetup() {
      const root = activeInstance.comfyuiPath;
      const python = activeInstance.pythonPath;
      const dirs = ["models", "custom_nodes", "input", "output", "user"];
      const checks: SetupCheck[] = [];
      const rootExists = Boolean(root) && await window.launcher.filesystem.exists(root);
      checks.push({ id: "root", label: "ComfyUI 根目录", ok: rootExists, detail: root ? (rootExists ? "已找到" : "路径不存在") : "未选择" });
      const mainExists = rootExists && await window.launcher.filesystem.exists(`${root}\\main.py`);
      checks.push({ id: "main", label: "main.py", ok: mainExists, detail: mainExists ? "已找到" : "缺少 main.py" });
      const pythonExists = Boolean(python) && await window.launcher.filesystem.exists(python);
      checks.push({ id: "python", label: "Python", ok: pythonExists, detail: python ? (pythonExists ? "已找到" : "路径不存在") : "未选择" });
      const dirChecks = await Promise.all(dirs.map(async (name) => {
        const ok = rootExists && await window.launcher.filesystem.exists(`${root}\\${name}`);
        return { id: name, label: name, ok, detail: ok ? "已找到" : "未找到" };
      }));
      if (!disposed) setSetupChecks([...checks, ...dirChecks]);
    }
    inspectSetup().catch(() => {
      if (!disposed) setSetupChecks([]);
    });
    return () => {
      disposed = true;
    };
  }, [activeInstance.comfyuiPath, activeInstance.pythonPath]);

  function needsConfiguredView(nextConfig: LauncherConfig): ToolView {
    const instance = nextConfig.instances.find((item) => item.id === nextConfig.currentInstanceId) || nextConfig.instances[0];
    if (!instance.comfyuiPath || !instance.pythonPath) return "settings";
    return normalizeView(nextConfig.ui.activeView);
  }

  async function guarded<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    const id = uid("task");
    const task: TaskRecord = { id, label, environment: activeInstance.name, startedAt: Date.now(), state: "running", detail: "正在执行，详细输出可在日志控制台查看。" };
    setTasks((rows) => retainTasks([task, ...rows]));
    const finish = (state: "success" | "failed", detail: string) => setTasks((rows) => retainTasks(rows.map((row) => row.id === id ? { ...row, state, detail, finishedAt: Date.now() } : row)));
    setMessage(`${label}...`);
    try {
      const result = await fn();
      finish("success", result === null || result === false ? "操作结束，未产生变更或返回结果。" : `${label}完成。`);
      setMessage(`${label}完成`);
      return result;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      finish("failed", text);
      setMessage(`${label}失败：${text}`);
      setLastLaunchError(text);
      return null;
    }
  }

  function setAndPersist(next: LauncherConfig) {
    const normalized = normalizeConfig(next);
    setConfig(normalized);
    window.launcher.config.save(normalized).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }

  function patchInstance(patch: Partial<LauncherInstance>) {
    const instances = config.instances.map((item) => item.id === activeInstance.id ? normalizeInstance({ ...item, ...patch }) : item);
    setConfig({ ...config, instances });
  }

  function patchMode(patch: Partial<LauncherMode>) {
    const modes = config.modes.map((item) => item.id === activeMode.id ? normalizeMode({ ...item, ...patch }) : item);
    setConfig({ ...config, modes });
  }

  async function save(nextView = view) {
    const normalized = normalizeConfig({ ...config, ui: { activeView: nextView } });
    const saved = await guarded("保存配置", () => window.launcher.config.save(normalized));
    if (saved) setConfig(normalizeConfig(saved));
  }

  async function exportConfigFile() {
    const path = await guarded("导出配置", () => window.launcher.config.export());
    if (path) setMessage(`已导出配置：${path}`);
  }

  async function checkAppUpdate() {
    const info = await guarded("检查软件更新", () => window.launcher.app.checkUpdate());
    if (info) {
      setUpdateInfo(info);
      setMessage(info.updateAvailable ? `发现新版本 ${info.latestVersion}` : `当前已是最新版本 ${info.currentVersion}`);
    }
  }

  async function openUpdateRelease() {
    if (!updateInfo?.releaseUrl) return;
    await guarded("打开 Release 页面", () => window.launcher.app.openExternal(updateInfo.releaseUrl));
  }

  async function importConfigFile() {
    if (!window.confirm("导入配置会覆盖当前软件配置，但不会删除 ComfyUI 文件。继续？")) return;
    const next = await guarded("导入配置", () => window.launcher.config.import());
    if (next) {
      const normalized = normalizeConfig(next);
      setConfig(normalized);
      setView(needsConfiguredView(normalized));
    }
  }

  async function resetConfigFile() {
    if (!window.confirm("重置本软件配置？不会删除 ComfyUI 文件，但当前环境和模式配置会被清空。")) return;
    const next = await guarded("重置配置", () => window.launcher.config.reset());
    if (next) {
      const normalized = normalizeConfig(next);
      setConfig(normalized);
      setView("settings");
    }
  }

  function switchView(nextView: ToolView) {
    setView(nextView);
    const next = normalizeConfig({ ...config, ui: { activeView: nextView } });
    setConfig(next);
    window.launcher.config.save(next).catch(() => undefined);
  }

  function selectInstance(id: string) {
    if (id === activeInstance.id) return;
    setPlugins([]);
    setModelDirs([]);
    setModelItems([]);
    setMediaItems([]);
    setHistoryItems([]);
    setPackages([]);
    setCoreInfo(null);
    setModePreview({ enable: [], disable: [], unchanged: [], missing: [] });
    setLastPreflight(null);
    setLastLaunchError("");
    const next = selectConfigInstance(config, id);
    setAndPersist(next);
    setView(needsConfiguredView(next));
  }

  function selectMode(id: string) {
    if (id === activeMode.id) return;
    setAndPersist(selectConfigMode(config, id));
  }

  async function selectComfyFolder() {
    const folder = await window.launcher.filesystem.selectFolder();
    if (!folder) return;
    let pythonPath = activeInstance.pythonPath || "";
    if (!pythonPath) {
      for (const candidate of pythonPathCandidates(folder)) {
        if (await window.launcher.filesystem.exists(candidate)) {
          pythonPath = candidate;
          break;
        }
      }
    }
    patchInstance({ comfyuiPath: folder, pythonPath: pythonPath || guessPythonPath(folder), name: activeInstance.name || "ComfyUI 环境" });
    setMessage("已选择 ComfyUI 路径，请保存配置后开始检测。");
  }

  function addInstance() {
    const instance = blankInstance({ name: `ComfyUI 环境 ${config.instances.length + 1}` });
    setAndPersist({ ...config, currentInstanceId: instance.id, instances: [...config.instances, instance], ui: { activeView: "settings" } });
    setView("settings");
  }

  function deleteInstance(id: string) {
    if (config.instances.length <= 1) return;
    if (!window.confirm("只删除本软件里的环境配置，不会删除 ComfyUI 文件。继续？")) return;
    const instances = config.instances.filter((item) => item.id !== id);
    setAndPersist({ ...config, currentInstanceId: instances[0].id, instances });
  }

  function duplicateInstance() {
    const copy = blankInstance({ ...activeInstance, id: uid("inst"), name: `${activeInstance.name} 副本` });
    setAndPersist({ ...config, currentInstanceId: copy.id, instances: [...config.instances, copy] });
  }

  function addMode() {
    const mode = blankMode(`模式 ${config.modes.length + 1}`);
    setAndPersist({ ...config, currentModeId: mode.id, modes: [...config.modes, mode] });
  }

  function deleteModeById(id: string) {
    if (config.modes.length <= 1) return;
    if (!window.confirm("删除该模式？不会移动任何插件目录。")) return;
    const modes = config.modes.filter((item) => item.id !== id);
    setAndPersist({ ...config, currentModeId: modes[0].id, modes });
  }

  async function duplicateMode() {
    const next = await guarded("复制模式", () => window.launcher.modes.duplicate(config, activeMode.id));
    if (next) setConfig(normalizeConfig(next));
  }

  function updateModePlugin(pluginName: string, list: "enabledPlugins" | "disabledPlugins", checked: boolean) {
    const current = new Set(activeMode[list]);
    if (checked) current.add(pluginName);
    else current.delete(pluginName);
    patchMode({ [list]: [...current].sort() } as Partial<LauncherMode>);
  }

  async function refreshLightData() {
    await Promise.all([
      refreshRuntime(),
      refreshPlugins(),
      refreshModels(),
      refreshMedia(),
      refreshPackages(),
      refreshCoreInfo()
    ]);
  }

  async function refreshRuntime() {
    const key = activeDataKey;
    const runtime = await window.launcher.comfy.status() as RuntimeStatus;
    if (activeDataKeyRef.current !== key) return;
    setStatus(runtime);
    const [nextQueue, stats, history] = await Promise.all([
      window.launcher.comfy.queue(activeInstance),
      window.launcher.comfy.systemStats(activeInstance),
      window.launcher.comfy.history(activeInstance)
    ]);
    if (activeDataKeyRef.current !== key) return;
    const queueIsBusy = nextQueue.running + nextQueue.pending > 0;
    const latestHistoryId = history[0]?.id || "";
    if (
      activeInstance.notifyOnComplete &&
      queueWasBusyRef.current &&
      !queueIsBusy &&
      latestHistoryId &&
      latestHistoryId !== lastNotifiedHistoryRef.current
    ) {
      lastNotifiedHistoryRef.current = latestHistoryId;
      void window.launcher.notifications.show("ComfyUI 任务完成", `${activeInstance.name} 的队列已清空。`);
    }
    queueWasBusyRef.current = queueIsBusy;
    setQueue(nextQueue);
    setSystemStats(stats);
    setHistoryItems(history);
  }

  async function refreshPlugins() {
    if (!activeInstance.comfyuiPath) return;
    const key = activeDataKey;
    const [rows, backupRows] = await Promise.all([
      window.launcher.plugins.scan(activeInstance), window.launcher.plugins.listBackups()
    ]);
    if (activeDataKeyRef.current !== key) return;
    setPlugins(rows as PluginInfo[]);
    setBackups(backupRows as DirEntry[]);
  }

  async function refreshModels() {
    if (!activeInstance.comfyuiPath) return;
    const key = activeDataKey;
    setModelsLoading(true);
    try {
      const [dirs, rows] = await Promise.all([
        window.launcher.filesystem.listDir(`${activeInstance.comfyuiPath}\\models`),
        window.launcher.models.list(activeInstance)
      ]);
      if (activeDataKeyRef.current !== key) return;
      setModelDirs(dirs as DirEntry[]);
      setModelItems(rows);
    } finally {
      if (activeDataKeyRef.current === key) setModelsLoading(false);
    }
  }

  async function refreshMedia() {
    if (!activeInstance.comfyuiPath) return;
    const key = activeDataKey;
    const [media, history] = await Promise.all([
      window.launcher.media.list(activeInstance), window.launcher.comfy.history(activeInstance)
    ]);
    if (activeDataKeyRef.current !== key) return;
    setMediaItems(media);
    setHistoryItems(history);
  }

  async function refreshPackages() {
    if (!activeInstance.pythonPath) return;
    const key = activeDataKey;
    const rows = await window.launcher.environment.keyPackages(activeInstance.pythonPath);
    if (activeDataKeyRef.current === key) setPackages(rows);
  }

  async function refreshCoreInfo() {
    if (!activeInstance.comfyuiPath) return;
    const key = activeDataKey;
    const info = await window.launcher.comfy.coreVersion(activeInstance);
    if (activeDataKeyRef.current === key) setCoreInfo(info);
  }

  async function refreshModePreview() {
    if (!activeInstance.comfyuiPath) return;
    const preview = await window.launcher.modes.preview(activeInstance, activeMode);
    setModePreview(preview);
  }

  async function startWithMode() {
    setLaunchPhase("checking");
    setLastLaunchError("");
    const preflight = await guarded("启动前检查", () => window.launcher.comfy.preflight(activeInstance));
    if (!preflight) {
      setLaunchPhase("failed");
      switchView("logs");
      return;
    }
    setLastPreflight(preflight);
    if (!preflight.ready) {
      setLaunchPhase("failed");
      return;
    }
    setLaunchPhase("applying-mode");
    const applied = await guarded("应用插件模式", () => window.launcher.modes.apply(activeInstance, activeMode));
    if (applied) setPlugins(applied as PluginInfo[]);
    setLaunchPhase("starting");
    const runtime = await guarded("启动 ComfyUI", () => window.launcher.comfy.start(activeInstance));
    if (runtime) {
      setStatus(runtime as RuntimeStatus);
      setLaunchPhase("running");
      switchView("logs");
      refreshRuntime();
    } else {
      setLaunchPhase("failed");
      switchView("logs");
    }
  }

  async function stopComfy() {
    setLaunchPhase("stopping");
    const runtime = await guarded("停止 ComfyUI", () => window.launcher.comfy.stop());
    if (runtime) setStatus(runtime as RuntimeStatus);
    setLaunchPhase("idle");
  }

  async function restartComfy() {
    await stopComfy();
    await startWithMode();
  }

  async function releaseBlockedPort() {
    const result = await guarded("释放端口", () => window.launcher.comfy.releasePort(activeInstance.port));
    if (result) setLastPreflight(result);
  }

  async function interruptGeneration() {
    const next = await guarded("中断生成", () => window.launcher.comfy.interrupt(activeInstance));
    if (next) setQueue(next);
  }

  async function clearQueueNow() {
    const next = await guarded("清空队列", () => window.launcher.comfy.clearQueue(activeInstance));
    if (next) setQueue(next);
  }

  async function freeMemoryNow() {
    const next = await guarded("释放内存", () => window.launcher.comfy.freeMemory(activeInstance));
    if (next) setSystemStats(next);
  }

  async function clearHistoryNow() {
    if (!window.confirm("清理 ComfyUI history？不会删除输出文件。")) return;
    const next = await guarded("清理 history", () => window.launcher.comfy.clearHistory(activeInstance));
    if (next) setHistoryItems(next);
  }

  async function exportLogsNow() {
    const target = await guarded("导出日志", () => window.launcher.logs.export());
    if (target) setMessage(`已导出日志：${target}`);
  }

  async function installPlugin() {
    const url = repoUrl.trim();
    if (!url) return;
    const rows = await guarded("安装插件", () => window.launcher.plugins.installFromGit(activeInstance, url));
    if (!rows) return;
    const nextRows = rows as PluginInfo[];
    setPlugins(nextRows);
    setRepoUrl("");
    const expected = pluginNameFromUrl(url).toLowerCase();
    const installed = nextRows.find((plugin) => plugin.name.toLowerCase() === expected || plugin.path.toLowerCase().includes(expected));
    if (installed?.hasRequirements && window.confirm(`插件「${installed.name}」包含 requirements.txt，是否现在安装依赖？`)) {
      const text = await guarded("安装插件依赖", () => window.launcher.plugins.installRequirements(activeInstance, installed.path));
      if (text) {
        setLogs(String(text).split("\n"));
        switchView("logs");
      }
    }
  }

  async function togglePlugin(plugin: PluginInfo) {
    const rows = await guarded(plugin.enabled ? "禁用插件" : "启用插件", () =>
      plugin.enabled ? window.launcher.plugins.disable(activeInstance, plugin.name) : window.launcher.plugins.enable(activeInstance, plugin.name)
    );
    if (rows) setPlugins(rows as PluginInfo[]);
  }

  async function updatePlugin(plugin: PluginInfo) {
    if (!window.confirm("更新前会自动备份该插件，继续？")) return;
    const text = await guarded("更新插件", () => window.launcher.plugins.update(plugin.path));
    if (text) {
      setLogs(String(text).split("\n"));
      switchView("logs");
      refreshPlugins();
    }
  }

  async function bindRemote(plugin: PluginInfo) {
    if (!remoteUrl.trim()) return;
    const text = await guarded("绑定 Git remote", () => window.launcher.plugins.bindRemote(plugin.path, remoteUrl.trim()));
    if (text !== null) refreshPlugins();
  }

  async function installPluginRequirements(plugin: PluginInfo) {
    if (!window.confirm(`使用当前 Python 安装「${plugin.name}」的 requirements.txt？`)) return;
    const text = await guarded("安装插件依赖", () => window.launcher.plugins.installRequirements(activeInstance, plugin.path));
    if (text) {
      setLogs(String(text).split("\n"));
      switchView("logs");
    }
  }

  function addPathReference() {
    if (!newPath.trim()) return;
    const ref: PathReference = {
      id: uid("path"),
      kind: newPathKind,
      label: `${pathKindLabels[newPathKind]}目录`,
      path: newPath.trim(),
      enabled: true
    };
    patchInstance({ pathReferences: [...activeInstance.pathReferences, ref] });
    setNewPath("");
  }

  function updatePathReference(id: string, patch: Partial<PathReference>) {
    patchInstance({ pathReferences: activeInstance.pathReferences.map((ref) => ref.id === id ? { ...ref, ...patch } : ref) });
  }

  function removePathReference(id: string) {
    patchInstance({ pathReferences: activeInstance.pathReferences.filter((ref) => ref.id !== id) });
  }

  async function analyzeWorkflow() {
    if (!workflowPath.trim()) return;
    const key = activeDataKey;
    const analyzedPath = workflowPath;
    const result = await guarded("分析工作流", () => window.launcher.workflow.analyze(activeInstance, workflowPath.trim()));
    if (result && activeDataKeyRef.current === key && workflowPathRef.current === analyzedPath) setWorkflow(result);
  }

  function applyWorkflowMode() {
    if (!workflow) return;
    const incomplete = !!(workflow.missingNodeTypes.length || workflow.unverifiedNodeTypes?.length);
    if (incomplete && !window.confirm("节点分析尚不完整。将生成保守模式：启用已匹配插件，保留其他插件，不会自动禁用它们。继续？")) return;
    const mode = blankMode(`工作流临时模式 ${new Date().toLocaleTimeString()}`);
    mode.applyStrategy = incomplete ? "disabled-list" : "enabled-only";
    mode.enabledPlugins = workflow.matchedPlugins.filter((name) => activePluginNames.has(name));
    if (incomplete) mode.disabledPlugins = plugins.filter((plugin) => !plugin.enabled && !mode.enabledPlugins.includes(plugin.name)).map((plugin) => plugin.name);
    setAndPersist({ ...config, currentModeId: mode.id, modes: [...config.modes, mode], ui: { activeView: "console" } });
    setView("console");
  }

  async function copyWorkflowReport() {
    if (!workflow) return;
    await navigator.clipboard.writeText([
      `Workflow: ${workflow.filePath}`,
      `Node types: ${workflow.nodeTypes.length}`,
      `Matched plugins: ${workflow.matchedPlugins.join(", ") || "无"}`,
      `Missing node types: ${workflow.missingNodeTypes.join(", ") || "无"}`,
      `Suggested plugins: ${workflow.suggestedPlugins.join(", ") || "无"}`,
      `Unverified nodes: ${workflow.unverifiedNodeTypes?.join(", ") || "无"}`,
      `Model candidates: ${workflow.modelCandidates?.map((model) => `${model.name} (${model.found ? "有同名文件" : "扫描未找到"})`).join(", ") || "无"}`
    ].join("\n"));
    setMessage("已复制工作流诊断");
  }

  async function revealMedia(path: string, event?: React.MouseEvent) {
    event?.stopPropagation();
    await guarded("打开文件位置", () => window.launcher.media.reveal(path));
  }

  async function deleteMediaItem(item: MediaItem, event?: React.MouseEvent) {
    event?.stopPropagation();
    if (!window.confirm(`删除输出文件「${item.name}」？此操作会删除文件。`)) return;
    const ok = await guarded("删除输出文件", () => window.launcher.media.delete(item.path));
    if (ok) refreshMedia();
  }

  async function installEnvironmentTool(tool: string) {
    if (!window.confirm(`将使用当前 Python 执行 ${tool} 安装命令。继续？`)) return;
    const text = await guarded(`安装 ${tool}`, () => window.launcher.environment.installTool(activeInstance, tool));
    if (text) {
      setLogs(String(text).split("\n"));
      switchView("logs");
      refreshPackages();
    }
  }

  const effectivePhase: LaunchPhase = status.running ? "running" : launchPhase;

  return (
    <div className="workstation">
      <WindowControls />
      <Sidebar
        config={config}
        activeInstance={activeInstance}
        activeMode={activeMode}
        view={view}
        onAddInstance={addInstance}
        onDeleteInstance={deleteInstance}
        onAddMode={addMode}
        onDeleteMode={deleteModeById}
        onSelectInstance={selectInstance}
        onSelectMode={selectMode}
        onView={switchView}
      />

      <main className="center">
        <TopBar
          instance={activeInstance}
          status={status}
          phase={effectivePhase}
          busy={busy}
          onOpenFolder={() => window.launcher.filesystem.openPath(activeInstance.comfyuiPath)}
          onSave={() => save()}
          onOpenWeb={() => window.launcher.comfy.openWeb(activeInstance.browserChoice, activeInstance.browserPath)}
          onRestart={restartComfy}
          onStart={startWithMode}
          onStop={stopComfy}
        />

        {needsOnboarding && (
          <Onboarding
            instance={activeInstance}
            checks={setupChecks}
            onSelectFolder={selectComfyFolder}
            onPatch={patchInstance}
            onSave={() => save("settings")}
          />
        )}

        {!needsOnboarding && view === "console" && (
          <ConsoleView
            instance={activeInstance}
            mode={activeMode}
            status={status}
            queue={queue}
            stats={systemStats}
            modelDirs={modelDirs}
            preview={modePreview}
            issueCount={issueCount}
            launchArgs={launchArgs}
            preflight={lastPreflight}
            error={lastLaunchError}
            media={mediaItems}
            browsers={browsers}
            onPatchInstance={patchInstance}
            onPatchMode={patchMode}
            onDuplicateMode={duplicateMode}
            onDeleteMode={() => deleteModeById(activeMode.id)}
            onReleasePort={releaseBlockedPort}
            onOpenLogs={() => switchView("logs")}
          />
        )}

        {!needsOnboarding && view === "logs" && (
          <LogsView
            status={status}
            queue={queue}
            logs={visibleLogs}
            allLogs={logs}
            diagnostics={diagnostics}
            errors={errors}
            warnings={warnings}
            filter={logFilter}
            follow={followLogs}
            logBoxRef={logBoxRef}
            onFilter={setLogFilter}
            onFollow={setFollowLogs}
            onOpenWeb={() => window.launcher.comfy.openWeb(activeInstance.browserChoice, activeInstance.browserPath)}
            onInterrupt={interruptGeneration}
            onClearQueue={clearQueueNow}
            onFreeMemory={freeMemoryNow}
            onExportLogs={exportLogsNow}
            onClearLogs={async () => setLogs(await window.launcher.logs.clear())}
          />
        )}

        {!needsOnboarding && view === "plugins" && (
          <PluginsView
            plugins={filteredPlugins}
            allPlugins={plugins}
            mode={activeMode}
            filter={pluginFilter}
            search={pluginSearch}
            repoUrl={repoUrl}
            remoteUrl={remoteUrl}
            backups={backups}
            enabledCount={enabledCount}
            issueCount={issueCount}
            requirementCount={requirementCount}
            onSearch={setPluginSearch}
            onFilter={setPluginFilter}
            onRepoUrl={setRepoUrl}
            onRemoteUrl={setRemoteUrl}
            onInstall={installPlugin}
            onRefresh={() => guarded("扫描插件", refreshPlugins)}
            onToggle={togglePlugin}
            onUpdate={updatePlugin}
            onBackup={(plugin) => guarded("备份插件", () => window.launcher.plugins.backup(plugin.path)).then(refreshPlugins)}
            onRepair={(plugin) => guarded("修复 Git", () => window.launcher.plugins.repairGit(plugin.path)).then(refreshPlugins)}
            onBind={bindRemote}
            onInstallRequirements={installPluginRequirements}
            onModePlugin={updateModePlugin}
            onRestore={(backupPath) => window.confirm("确认恢复备份？当前插件会先备份。") && guarded("恢复备份", () => window.launcher.plugins.restore(activeInstance, backupPath)).then((rows) => rows && setPlugins(rows as PluginInfo[]))}
          />
        )}

        {!needsOnboarding && view === "paths" && (
          <PathsView
            instance={activeInstance}
            newPath={newPath}
            newPathKind={newPathKind}
            onNewPath={setNewPath}
            onNewPathKind={setNewPathKind}
            onAdd={addPathReference}
            onUpdate={updatePathReference}
            onRemove={removePathReference}
            onSelectFolder={() => window.launcher.filesystem.selectFolder().then((folder) => folder && setNewPath(folder))}
            onOpen={(path) => window.launcher.paths.open(path)}
            onSync={() => guarded("同步模型路径", () => window.launcher.paths.syncComfyConfig(activeInstance))}
          />
        )}

        {!needsOnboarding && view === "workflow" && (
          <WorkflowView
            path={workflowPath}
            workflow={workflow}
            activePluginNames={activePluginNames}
            onPath={(value) => { setWorkflowPath(value); setWorkflow(null); }}
            onSelect={() => window.launcher.filesystem.selectFile().then((file) => { if (file) { setWorkflowPath(file); setWorkflow(null); } })}
            onAnalyze={analyzeWorkflow}
            onApply={applyWorkflowMode}
            onCopy={copyWorkflowReport}
            onReview={(name) => { setPluginSearch(name); switchView("plugins"); }}
            onModels={(name) => { setModelSearch(name); switchView("models"); }}
            onConsole={() => switchView("console")}
            busy={busy}
          />
        )}

        {!needsOnboarding && view === "models" && (
          <ModelsView
            loading={modelsLoading}
            items={filteredModels}
            categories={modelCategories}
            search={modelSearch}
            referenceCount={activeInstance.pathReferences.filter((ref) => ref.enabled && ref.kind === "models").length + 1}
            onSearch={setModelSearch}
            onRefresh={() => guarded("刷新模型库", refreshModels)}
            onOpenModels={() => window.launcher.filesystem.openPath(`${activeInstance.comfyuiPath}\\models`)}
            onSync={() => guarded("同步模型路径", () => window.launcher.paths.syncComfyConfig(activeInstance))}
          />
        )}

        {!needsOnboarding && view === "media" && (
          <MediaView
            items={filteredMedia}
            history={historyItems}
            search={mediaSearch}
            outputCount={activeInstance.pathReferences.filter((ref) => ref.enabled && ref.kind === "outputs").length + 1}
            onSearch={setMediaSearch}
            onRefresh={() => guarded("刷新媒体库", refreshMedia)}
            onOpenOutput={() => window.launcher.filesystem.openPath(`${activeInstance.comfyuiPath}\\output`)}
            onClearHistory={clearHistoryNow}
            onReveal={revealMedia}
            onDelete={deleteMediaItem}
          />
        )}

        {!needsOnboarding && view === "environment" && (
          <EnvironmentView
            instance={activeInstance}
            packages={packages}
            coreInfo={coreInfo}
            onRefreshPackages={refreshPackages}
            onPipList={() => guarded("pip list", () => window.launcher.python.pipList(activeInstance.pythonPath)).then((text) => { if (text) { setLogs(String(text).split("\n")); switchView("logs"); } })}
            onRefreshCore={refreshCoreInfo}
            onUpdateCore={() => window.confirm("将从 Git remote 更新 ComfyUI 内核。如存在本地改动，Git 会拒绝更新。继续？") && guarded("更新 ComfyUI 内核", () => window.launcher.comfy.updateCore(activeInstance)).then((text) => { if (text) { setLogs(String(text).split("\n")); refreshCoreInfo(); switchView("logs"); } })}
            onInstallTool={installEnvironmentTool}
          />
        )}

        {!needsOnboarding && view === "settings" && (
          <SettingsView
            instance={activeInstance}
            mode={activeMode}
            browsers={browsers}
            updateInfo={updateInfo}
            onPatchInstance={patchInstance}
            onPatchMode={patchMode}
            onSelectComfy={selectComfyFolder}
            onDuplicateInstance={duplicateInstance}
            onSave={() => save("settings")}
            onExport={exportConfigFile}
            onImport={importConfigFile}
            onReset={resetConfigFile}
            onCheckUpdate={checkAppUpdate}
            onOpenUpdate={openUpdateRelease}
            config={config}
          />
        )}
      </main>

      {tasksOpen && <TaskCenter tasks={tasks} onClose={() => setTasksOpen(false)} onClear={() => setTasks((rows) => rows.filter((row) => row.state === "running"))} onLogs={() => { setTasksOpen(false); switchView("logs"); }} />}
      <footer className="statusbar"><span role="status">{message}</span><button className="task-trigger" onClick={() => setTasksOpen(true)}>{busy ? `${tasks.filter((task) => task.state === "running").length} 个任务执行中` : "任务中心"}{tasks.some((task) => task.state === "failed") && <i aria-label="存在失败任务" />}</button></footer>
    </div>
  );
}
