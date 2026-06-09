import {
  AlertTriangle,
  ArchiveRestore,
  Bell,
  Boxes,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FileJson,
  FolderOpen,
  GitBranch,
  Globe,
  HardDrive,
  History,
  Image,
  ListRestart,
  Maximize2,
  Minus,
  MonitorPlay,
  Pause,
  Play,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  SquareTerminal,
  Trash2,
  Wrench,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
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
  QueueStatus,
  RuntimeStatus,
  SystemStats,
  WorkflowAnalysisResult
} from "../types";

type ToolView = "console" | "logs" | "plugins" | "paths" | "workflow" | "models" | "media" | "environment" | "settings";
type PluginFilter = "all" | "issues" | "disabled" | "requirements" | "git";
type LogFilter = "all" | "errors" | "warnings";

const tools: Array<{ id: ToolView; label: string; icon: typeof MonitorPlay }> = [
  { id: "console", label: "控制台", icon: MonitorPlay },
  { id: "logs", label: "日志控制台", icon: SquareTerminal },
  { id: "plugins", label: "插件维护", icon: PlugZap },
  { id: "paths", label: "路径引用", icon: FolderOpen },
  { id: "workflow", label: "工作流分析", icon: FileJson },
  { id: "models", label: "模型库", icon: Boxes },
  { id: "media", label: "媒体库", icon: Image },
  { id: "environment", label: "环境维护", icon: Wrench },
  { id: "settings", label: "设置", icon: Settings }
];

const validViews = new Set<ToolView>(["console", "logs", "plugins", "paths", "workflow", "models", "media", "environment", "settings"]);

function normalizeView(value: string): ToolView {
  if (value === "launch") return "console";
  return validViews.has(value as ToolView) ? (value as ToolView) : "console";
}

const pathKindLabels: Record<PathReferenceKind, string> = {
  models: "模型",
  plugins: "插件",
  workflows: "工作流",
  outputs: "输出"
};

const environmentTools = [
  { id: "requirements", label: "requirements", desc: "安装 ComfyUI 根目录 requirements.txt，适合首次修复基础依赖。", risk: "低" },
  { id: "Torch", label: "Torch", desc: "安装 torch / torchvision / torchaudio。CUDA 版本不匹配时需谨慎。", risk: "高" },
  { id: "Triton", label: "Triton", desc: "安装 Triton，部分加速插件可能需要。Windows 环境兼容性需确认。", risk: "中" },
  { id: "xformers", label: "xformers", desc: "安装 xformers，用于部分显存/注意力优化。需匹配 Torch。", risk: "中" },
  { id: "SageAttention", label: "SageAttention", desc: "安装 SageAttention，适合明确需要该加速库的工作流。", risk: "中" },
  { id: "Nunchaku", label: "Nunchaku", desc: "安装 Nunchaku，适合使用相关量化模型或节点时。", risk: "中" }
];

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

function displayName(value: string) {
  return value.replace(/^旧实例/i, "ComfyUI 环境");
}

function compactPath(value: string, max = 74) {
  if (!value) return "未设置";
  return value.length <= max ? value : `${value.slice(0, 24)}...${value.slice(-40)}`;
}

function formatBytes(value: number) {
  if (!value) return "0 GB";
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatFileSize(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 / 1024).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function blankInstance(source?: LauncherInstance): LauncherInstance {
  return {
    ...(source || {}),
    id: uid("inst"),
    name: `ComfyUI 环境 ${Date.now().toString().slice(-4)}`,
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

function blankMode(name = "新模式"): LauncherMode {
  return { id: uid("mode"), name, enabledPlugins: [], disabledPlugins: [], applyStrategy: "disabled-list", overrides: {} };
}

function normalizeInstance(instance: LauncherInstance): LauncherInstance {
  return {
    ...blankInstance(),
    ...instance,
    name: displayName(instance.name),
    pathReferences: instance.pathReferences || [],
    advancedArgs: instance.advancedArgs || {}
  };
}

function normalizeMode(mode: LauncherMode): LauncherMode {
  return {
    ...mode,
    enabledPlugins: mode.enabledPlugins || [],
    disabledPlugins: mode.disabledPlugins || [],
    applyStrategy: mode.applyStrategy || "disabled-list"
  };
}

function defaultConfig(): LauncherConfig {
  const instance = blankInstance();
  const mode = blankMode("默认模式");
  return { currentInstanceId: instance.id, currentModeId: mode.id, instances: [instance], modes: [mode], ui: { activeView: "settings" } };
}

export function App() {
  const logBoxRef = useRef<HTMLPreElement | null>(null);
  const [config, setConfig] = useState<LauncherConfig>(defaultConfig);
  const [view, setView] = useState<ToolView>("settings");
  const [status, setStatus] = useState<RuntimeStatus>({ running: false, pid: null, url: null });
  const [queue, setQueue] = useState<QueueStatus>({ running: 0, pending: 0 });
  const [systemStats, setSystemStats] = useState<SystemStats>({ os: "", python: "", pytorch: "", devices: [] });
  const [logs, setLogs] = useState<string[]>([]);
  const [followLogs, setFollowLogs] = useState(true);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [models, setModels] = useState<DirEntry[]>([]);
  const [modelItems, setModelItems] = useState<ModelItem[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [backups, setBackups] = useState<DirEntry[]>([]);
  const [packages, setPackages] = useState<EnvironmentPackage[]>([]);
  const [browsers, setBrowsers] = useState<BrowserOption[]>([]);
  const [coreInfo, setCoreInfo] = useState<CoreVersionInfo | null>(null);
  const [modePreview, setModePreview] = useState<ModePreview>({ enable: [], disable: [], unchanged: [], missing: [] });
  const [workflow, setWorkflow] = useState<WorkflowAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("准备就绪");
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginFilter, setPluginFilter] = useState<PluginFilter>("all");
  const [modelSearch, setModelSearch] = useState("");
  const [mediaSearch, setMediaSearch] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [workflowPath, setWorkflowPath] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newPathKind, setNewPathKind] = useState<PathReferenceKind>("models");

  const activeInstance = useMemo(() => normalizeInstance(config.instances.find((item) => item.id === config.currentInstanceId) || config.instances[0]), [config]);
  const activeMode = useMemo(() => normalizeMode(config.modes.find((item) => item.id === config.currentModeId) || config.modes[0]), [config]);
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
  const filteredModels = modelItems.filter((item) =>
    `${item.category} ${item.name}`.toLowerCase().includes(modelSearch.toLowerCase())
  );
  const filteredMedia = mediaItems.filter((item) => item.name.toLowerCase().includes(mediaSearch.toLowerCase()));
  const modelCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of modelItems) counts.set(item.category, (counts.get(item.category) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [modelItems]);
  const activePluginNames = new Set(plugins.map((plugin) => plugin.name));
  const enabledCount = plugins.filter((plugin) => plugin.enabled).length;
  const issueCount = plugins.filter((plugin) => plugin.health?.problems?.length).length;
  const warnings = logs.filter((line) => /warn/i.test(line)).length;
  const errors = logs.filter((line) => /error|failed|traceback/i.test(line)).length;
  const logDiagnostics = useMemo(() => {
    const rules = [
      { type: "错误" as const, pattern: /traceback|exception|failed|error/i, hint: "查看完整 traceback，优先定位最后一个异常。" },
      { type: "缺少 Python 包" as const, pattern: /ModuleNotFoundError|No module named|ImportError/i, hint: "通常需要安装插件 requirements 或修复当前 Python 环境。" },
      { type: "缺失节点/插件" as const, pattern: /IMPORT FAILED|Cannot import|missing custom node|Unknown node/i, hint: "检查插件是否被禁用、依赖是否安装，或用工作流分析定位节点来源。" },
      { type: "端口占用" as const, pattern: /address already in use|Only one usage of each socket address|EADDRINUSE/i, hint: "释放端口或修改启动端口后重试。" },
      { type: "显存/内存" as const, pattern: /out of memory|CUDA out of memory|not enough memory/i, hint: "尝试降低 VRAM 模式、释放内存，或减少工作流显存占用。" },
      { type: "警告" as const, pattern: /warn/i, hint: "警告不一定会阻止启动，但值得在首次启动后复查。" }
    ];
    const found: Array<{ type: string; line: string; hint: string }> = [];
    const seen = new Set<string>();
    for (const line of logs) {
      for (const rule of rules) {
        if (!rule.pattern.test(line)) continue;
        const key = `${rule.type}:${line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ type: rule.type, line, hint: rule.hint });
        break;
      }
      if (found.length >= 8) break;
    }
    return found;
  }, [logs]);
  const visibleLogs = useMemo(() => {
    if (logFilter === "errors") return logs.filter((line) => /error|failed|traceback|exception|ModuleNotFoundError|ImportError/i.test(line));
    if (logFilter === "warnings") return logs.filter((line) => /warn/i.test(line));
    return logs;
  }, [logs, logFilter]);
  const missingPackages = packages.filter((pkg) => pkg.version === "未安装").length;
  const missingPathRefs = activeInstance.pathReferences.filter((ref) => ref.enabled && !ref.path.trim()).length;
  const attentionItems = [
    ...(errors ? [{ tone: "bad" as const, title: `${errors} 条错误日志`, detail: "优先查看启动失败、IMPORT FAILED 或 traceback。", view: "logs" as ToolView }] : []),
    ...(issueCount ? [{ tone: "warn" as const, title: `${issueCount} 个插件健康问题`, detail: "检查 Git remote、损坏仓库、依赖文件和重复插件。", view: "plugins" as ToolView }] : []),
    ...(modePreview.missing.length ? [{ tone: "warn" as const, title: `${modePreview.missing.length} 个模式插件缺失`, detail: "当前模式引用了不存在的插件，启动前建议修正。", view: "console" as ToolView }] : []),
    ...(missingPackages ? [{ tone: "warn" as const, title: `${missingPackages} 个关键包未安装`, detail: "检查 torch、xformers、SageAttention 等环境组件。", view: "environment" as ToolView }] : []),
    ...(missingPathRefs ? [{ tone: "warn" as const, title: `${missingPathRefs} 个路径引用为空`, detail: "补齐模型、工作流或输出目录引用。", view: "paths" as ToolView }] : []),
    ...(!activeInstance.comfyuiPath || !activeInstance.pythonPath ? [{ tone: "bad" as const, title: "环境路径未完整配置", detail: "ComfyUI 路径和 Python 路径是启动前置条件。", view: "settings" as ToolView }] : [])
  ].slice(0, 5);
  const readinessScore = Math.max(
    0,
    100 -
      (status.running ? 0 : 8) -
      Math.min(errors * 8, 24) -
      Math.min(issueCount * 10, 30) -
      Math.min(modePreview.missing.length * 8, 20) -
      Math.min(missingPackages * 6, 18) -
      (activeInstance.comfyuiPath && activeInstance.pythonPath ? 0 : 20)
  );
  const readinessTone = readinessScore >= 80 ? "ok" : readinessScore >= 55 ? "warn" : "bad";

  useEffect(() => {
    window.launcher.config.load().then((loaded) => {
      const normalized = {
        ...loaded,
        instances: loaded.instances.map(normalizeInstance),
        modes: loaded.modes.map(normalizeMode),
        ui: { activeView: normalizeView(loaded.ui.activeView) }
      };
      setConfig(normalized);
      setView(normalizeView(normalized.ui.activeView));
      setMessage("已载入本地配置");
    });
    window.launcher.comfy.status().then((next) => setStatus(next as RuntimeStatus));
    window.launcher.logs.read().then(setLogs);
    window.launcher.plugins.listBackups().then((rows) => setBackups(rows as DirEntry[]));
    window.launcher.browser.list().then(setBrowsers);
    const offLog = window.launcher.logs.onLine((line) => setLogs((items) => [...items.slice(-900), line]));
    const offStatus = window.launcher.comfy.onStatus((next) => setStatus(next as RuntimeStatus));
    return () => {
      offLog();
      offStatus();
    };
  }, []);

  useEffect(() => {
    if (!activeInstance?.comfyuiPath) return;
    refreshPlugins();
    refreshModels();
    refreshModelIndex();
    refreshMedia();
    refreshPackages();
    refreshCoreInfo();
  }, [activeInstance.id]);

  useEffect(() => {
    let cancelled = false;
    async function refreshRuntime() {
      if (!activeInstance?.port) return;
      const [nextQueue, nextStats] = await Promise.all([
        window.launcher.comfy.queue(activeInstance),
        window.launcher.comfy.systemStats(activeInstance)
      ]);
      if (!cancelled) {
        setQueue(nextQueue);
        setSystemStats(nextStats);
      }
    }
    refreshRuntime();
    const timer = window.setInterval(refreshRuntime, status.running ? 3000 : 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeInstance.id, activeInstance.port, status.running]);

  useEffect(() => {
    if (!activeInstance?.comfyuiPath || !activeMode?.id) return;
    window.launcher.modes.preview(activeInstance, activeMode).then(setModePreview).catch(() => {});
  }, [activeInstance.id, activeMode.id, activeMode.enabledPlugins.join("|"), activeMode.disabledPlugins.join("|"), activeMode.applyStrategy, plugins.length]);

  useEffect(() => {
    if (view !== "logs" || !followLogs) return;
    const box = logBoxRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [logs, view, followLogs]);

  async function guarded<T>(label: string, task: () => Promise<T>) {
    setBusy(true);
    setMessage(`${label}...`);
    try {
      const result = await task();
      setMessage(`${label}完成`);
      return result;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      alert(text);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function save(next = config) {
    const saved = await window.launcher.config.save(next);
    setConfig(saved);
    setMessage("配置已保存");
    return saved;
  }

  function patchInstance(patch: Partial<LauncherInstance>) {
    setConfig((current) => ({
      ...current,
      instances: current.instances.map((item) => (item.id === activeInstance.id ? normalizeInstance({ ...item, ...patch }) : item))
    }));
  }

  function patchMode(patch: Partial<LauncherMode>) {
    setConfig((current) => ({
      ...current,
      modes: current.modes.map((item) => (item.id === activeMode.id ? normalizeMode({ ...item, ...patch }) : item))
    }));
  }

  function switchView(nextView: ToolView) {
    setView(nextView);
    const next = { ...config, ui: { activeView: nextView } };
    setConfig(next);
    window.launcher.config.save(next);
  }

  async function refreshPlugins() {
    if (!activeInstance.comfyuiPath) return;
    setPlugins((await window.launcher.plugins.scan(activeInstance)) as PluginInfo[]);
  }

  async function refreshModels() {
    if (!activeInstance.comfyuiPath) return;
    setModels((await window.launcher.filesystem.listDir(`${activeInstance.comfyuiPath}\\models`)) as DirEntry[]);
  }

  async function refreshModelIndex() {
    if (!activeInstance.comfyuiPath) return;
    setModelItems(await window.launcher.models.list(activeInstance));
  }

  async function refreshMedia() {
    if (!activeInstance.comfyuiPath) return;
    const [items, history] = await Promise.all([
      window.launcher.media.list(activeInstance),
      window.launcher.comfy.history(activeInstance)
    ]);
    setMediaItems(items);
    setHistoryItems(history);
  }

  async function refreshPackages() {
    if (!activeInstance.pythonPath) return;
    setPackages(await window.launcher.environment.keyPackages(activeInstance.pythonPath));
  }

  async function refreshCoreInfo() {
    if (!activeInstance.comfyuiPath) return;
    setCoreInfo(await window.launcher.comfy.coreVersion(activeInstance));
  }

  async function runPreflight() {
    return guarded("启动检查", () => window.launcher.comfy.preflight(activeInstance));
  }

  async function startWithMode() {
    const checked = await runPreflight();
    if (!checked.ready) {
      setMessage("启动条件未通过，请先处理路径、Python 或端口占用问题。");
      switchView("console");
      return;
    }
    if (!status.running) {
      const applied = await guarded("应用模式", () => window.launcher.modes.apply(activeInstance, activeMode));
      if (applied) setPlugins(applied as PluginInfo[]);
    } else if (modePreview.enable.length || modePreview.disable.length) {
      setMessage("ComfyUI 已在运行，已跳过插件移动。需要切换插件模式时请先停止服务。");
    }
    const synced = { ...config, instances: config.instances.map((item) => (item.id === activeInstance.id ? activeInstance : item)) };
    await save(synced);
    setStatus((await guarded("启动 ComfyUI", () => window.launcher.comfy.start(activeInstance))) as RuntimeStatus);
    switchView("logs");
  }

  async function stopComfy() {
    setStatus((await guarded("停止 ComfyUI", window.launcher.comfy.stop)) as RuntimeStatus);
  }

  async function restartComfy() {
    if (status.running) {
      await stopComfy();
    }
    await startWithMode();
  }

  async function interruptGeneration() {
    setQueue(await guarded("中断当前生成", () => window.launcher.comfy.interrupt(activeInstance)));
  }

  async function clearQueueNow() {
    setQueue(await guarded("清空等待队列", () => window.launcher.comfy.clearQueue(activeInstance)));
  }

  async function freeMemoryNow() {
    setSystemStats(await guarded("释放 ComfyUI 内存", () => window.launcher.comfy.freeMemory(activeInstance)));
  }

  async function revealMedia(path: string) {
    await guarded("打开文件位置", () => window.launcher.media.reveal(path));
  }

  async function deleteMediaItem(item: MediaItem) {
    if (!window.confirm(`删除 ${item.name}？`)) return;
    await guarded("删除媒体文件", () => window.launcher.media.delete(item.path));
    await refreshMedia();
  }

  async function clearHistoryNow() {
    if (!status.running) {
      alert("ComfyUI 未运行，无法调用 /history 清理接口。");
      return;
    }
    if (!window.confirm("清空 ComfyUI history？不会删除 output 文件。")) return;
    setHistoryItems(await guarded("清空 History", () => window.launcher.comfy.clearHistory(activeInstance)));
  }

  function addInstance() {
    const instance = blankInstance(activeInstance);
    setConfig({ ...config, currentInstanceId: instance.id, instances: [...config.instances, instance] });
  }

  function deleteInstance(id: string) {
    if (config.instances.length <= 1) {
      alert("至少保留一个 ComfyUI 环境。");
      return;
    }
    const target = config.instances.find((item) => item.id === id);
    if (!window.confirm(`删除环境「${displayName(target?.name || "")}」？不会删除 ComfyUI 文件。`)) return;
    const instances = config.instances.filter((item) => item.id !== id);
    setConfig({ ...config, instances, currentInstanceId: id === activeInstance.id ? instances[0].id : config.currentInstanceId });
  }

  function addMode() {
    const mode = blankMode();
    setConfig({ ...config, currentModeId: mode.id, modes: [...config.modes, mode] });
  }

  async function duplicateMode() {
    setConfig(await window.launcher.modes.duplicate(config, activeMode.id));
  }

  async function deleteMode() {
    if (!window.confirm("删除当前模式？")) return;
    setConfig(await window.launcher.modes.delete(config, activeMode.id));
  }

  async function deleteModeById(id: string) {
    if (config.modes.length <= 1) {
      alert("至少保留一个模式。");
      return;
    }
    const target = config.modes.find((item) => item.id === id);
    if (!window.confirm(`删除模式「${target?.name || ""}」？`)) return;
    setConfig(await window.launcher.modes.delete(config, id));
  }

  function updateModePlugin(pluginName: string, list: "enabledPlugins" | "disabledPlugins", checked: boolean) {
    const next = new Set(activeMode[list]);
    if (checked) next.add(pluginName);
    else next.delete(pluginName);
    patchMode({ [list]: [...next] } as Partial<LauncherMode>);
  }

  function addPathReference() {
    if (!newPath.trim()) return;
    const ref: PathReference = {
      id: uid("path"),
      kind: newPathKind,
      label: newPath.trim().split(/[\\/]/).filter(Boolean).pop() || pathKindLabels[newPathKind],
      path: newPath.trim(),
      enabled: true
    };
    patchInstance({ pathReferences: [...activeInstance.pathReferences, ref] });
    setNewPath("");
  }

  function updatePathReference(id: string, patch: Partial<PathReference>) {
    patchInstance({ pathReferences: activeInstance.pathReferences.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  }

  function removePathReference(id: string) {
    patchInstance({ pathReferences: activeInstance.pathReferences.filter((item) => item.id !== id) });
  }

  async function installPlugin() {
    if (!repoUrl.trim()) return;
    setPlugins((await guarded("安装插件", () => window.launcher.plugins.installFromGit(activeInstance, repoUrl.trim()))) as PluginInfo[]);
    setRepoUrl("");
  }

  async function analyzeWorkflow() {
    if (!workflowPath.trim()) return;
    setWorkflow(await guarded("分析工作流", () => window.launcher.workflow.analyze(activeInstance, workflowPath.trim())));
  }

  async function applyWorkflowMode() {
    if (!workflow) return;
    const mode = blankMode("工作流临时模式");
    mode.applyStrategy = "enabled-only";
    mode.enabledPlugins = workflow.matchedPlugins.filter((name) => activePluginNames.has(name));
    const next = { ...config, currentModeId: mode.id, modes: [...config.modes, mode] };
    setConfig(next);
    await save(next);
    setMessage(`已生成临时模式：启用 ${mode.enabledPlugins.length} 个本地匹配插件`);
    switchView("console");
  }

  function reviewWorkflowPlugins() {
    if (!workflow) return;
    const missingSuggested = workflow.suggestedPlugins.filter((name) => !activePluginNames.has(name));
    setPluginSearch(missingSuggested[0] || workflow.matchedPlugins[0] || "");
    switchView("plugins");
  }

  async function copyWorkflowReport() {
    if (!workflow) return;
    const missingSuggested = workflow.suggestedPlugins.filter((name) => !activePluginNames.has(name));
    const report = [
      `Workflow: ${workflow.filePath}`,
      `Node types: ${workflow.nodeTypes.length}`,
      `Matched plugins: ${workflow.matchedPlugins.length ? workflow.matchedPlugins.join(", ") : "None"}`,
      `Suggested missing plugins: ${missingSuggested.length ? missingSuggested.join(", ") : "None"}`,
      `Missing nodes: ${workflow.missingNodeTypes.length ? workflow.missingNodeTypes.join(", ") : "None"}`
    ].join("\n");
    await navigator.clipboard.writeText(report);
    setMessage("已复制工作流诊断报告");
  }

  async function installEnvironmentTool(tool: string) {
    if (!window.confirm(`执行 ${tool} 安装命令？安装日志会在日志控制台显示。`)) return;
    const text = await guarded(`安装 ${tool}`, () => window.launcher.environment.installTool(activeInstance, tool));
    setLogs(String(text).split("\n"));
    refreshPackages();
    switchView("logs");
  }

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

  return (
    <div className="workstation">
      <div className="window-controls" aria-label="窗口控制">
        <button data-window-action="minimize" title="最小化" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); window.launcher.window.minimize(); }}><Minus size={15} /></button>
        <button data-window-action="toggleMaximize" title="最大化/还原" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); window.launcher.window.toggleMaximize(); }}><Maximize2 size={14} /></button>
        <button data-window-action="close" className="close" title="关闭" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); window.launcher.window.close(); }}><X size={16} /></button>
      </div>
      <aside className="rail">
        <div className="brand">
          <div><strong>Comfy Station</strong><span>Launcher Next</span></div>
        </div>

        <SectionTitle label="环境" action={<button className="mini-btn" title="新增环境" onClick={addInstance}><Plus size={14} /></button>} />
        <div className="stack">
          {config.instances.map((item) => (
            <div className={item.id === activeInstance.id ? "side-row active" : "side-row"} key={item.id}>
              <button className="side-item" onClick={() => setConfig({ ...config, currentInstanceId: item.id })}>
                <HardDrive size={15} />
                <span>{displayName(item.name)}</span>
              </button>
              <button className="side-delete" title="删除环境" onClick={() => deleteInstance(item.id)}><X size={13} /></button>
            </div>
          ))}
        </div>

        <SectionTitle label="模式" action={<button className="mini-btn" title="新增模式" onClick={addMode}><Plus size={14} /></button>} />
        <div className="stack modes">
          {config.modes.map((item) => (
            <div className={item.id === activeMode.id ? "side-row active" : "side-row"} key={item.id}>
              <button className="side-item" onClick={() => setConfig({ ...config, currentModeId: item.id })}>
                <ListRestart size={15} />
                <span>{item.name}</span>
              </button>
              <button className="side-delete" title="删除模式" onClick={() => deleteModeById(item.id)}><X size={13} /></button>
            </div>
          ))}
        </div>

        <SectionTitle label="工具" />
        <nav className="tool-nav">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return <button className={view === tool.id ? "tool active" : "tool"} key={tool.id} onClick={() => switchView(tool.id)}><Icon size={16} />{tool.label}<ChevronRight size={14} /></button>;
          })}
        </nav>
      </aside>

      <main className="center">
        <header className="top-strip">
          <div>
            <p className="eyebrow">Local ComfyUI Workstation</p>
            <h1>{displayName(activeInstance.name)}</h1>
            <span>{compactPath(activeInstance.comfyuiPath)}</span>
          </div>
          <div className={status.running ? "top-state running" : "top-state"}>
            <span>{status.running ? "运行中" : "未启动"}</span>
            <strong>{status.url || `:${activeInstance.port || "8188"}`}</strong>
          </div>
          <div className="top-actions">
            <button className="ghost tool-button" title="打开目录" onClick={() => window.launcher.filesystem.openPath(activeInstance.comfyuiPath)}><FolderOpen size={16} /></button>
            <button className="ghost tool-button" title="保存配置" onClick={() => save()}><Save size={16} /></button>
            <button className="ghost tool-button" title="打开网页" disabled={!status.url} onClick={() => window.launcher.comfy.openWeb(activeInstance.browserChoice, activeInstance.browserPath)}><ExternalLink size={16} /></button>
            <button className="ghost tool-button" title="重启 ComfyUI" onClick={restartComfy} disabled={busy}><RefreshCw size={16} /></button>
            <button className={status.running ? "danger top-launch" : "primary top-launch"} onClick={status.running ? stopComfy : startWithMode} disabled={busy}>
              {status.running ? <Pause size={16} /> : <Play size={16} />}
              {status.running ? "停止" : "启动"}
            </button>
          </div>
        </header>

        {view === "console" && (
          <div className="console-page">
            <div className="stat-strip">
              <MiniStat label="状态" value={status.running ? "运行中" : "未启动"} tone={status.running ? "ok" : "bad"} />
              <MiniStat label="队列" value={`${queue.running}/${queue.pending}`} tone={queue.running || queue.pending ? "warn" : "ok"} />
              <MiniStat label="模式变化" value={`+${modePreview.enable.length} / -${modePreview.disable.length}`} />
              <MiniStat label="插件健康" value={`${issueCount} 个问题`} tone={issueCount ? "warn" : "ok"} />
            </div>

            <div className="console-panels">
              <Panel title="启动参数" eyebrow="Launch settings" action={<button className="ghost" onClick={() => switchView("logs")}><SquareTerminal size={15} />日志控制台</button>}>
                <div className="launch-form">
                <Field label="端口"><input title="ComfyUI Web 服务监听端口，会生成 --port 参数。默认常用 8188。" value={activeInstance.port} onChange={(event) => patchInstance({ port: event.target.value })} /></Field>
                <Field label="GPU"><input title="指定 CUDA 设备编号，会生成 --cuda-device 参数；留空则由 ComfyUI 自动选择。" placeholder="留空自动" value={activeInstance.gpu} onChange={(event) => patchInstance({ gpu: event.target.value })} /></Field>
                <Field label="VRAM"><select title="控制 ComfyUI 显存策略，例如 lowvram 更省显存但可能更慢；默认不追加额外参数。" value={activeInstance.vramMode} onChange={(event) => patchInstance({ vramMode: event.target.value as LauncherInstance["vramMode"] })}>{["默认", "lowvram", "normalvram", "highvram", "novram", "cpu"].map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="浏览器"><select title="启动成功后打开 ComfyUI 网页时使用的浏览器。" value={activeInstance.browserChoice} onChange={(event) => patchInstance({ browserChoice: event.target.value })}>{browsers.map((browser) => <option disabled={!browser.available} value={browser.id} key={browser.id}>{browser.label}{browser.available ? "" : "（未找到）"}</option>)}</select></Field>
                </div>
                <div className="launch-switches">
                <Toggle label="代理" title="启动 ComfyUI 时注入 HTTP_PROXY / HTTPS_PROXY，供 Git、pip、模型下载等网络请求使用。需要在设置里填写代理地址。" checked={activeInstance.proxyEnabled} onChange={(value) => patchInstance({ proxyEnabled: value })} />
                <Toggle label="HF 镜像" title="启动时设置 HF_ENDPOINT=https://hf-mirror.com，用于 Hugging Face 下载走镜像站；这是环境变量，不是 main.py 参数。" checked={activeInstance.hfMirrorEnabled} onChange={(value) => patchInstance({ hfMirrorEnabled: value })} />
                <Toggle label="Manager" title="启动时追加 --enable-manager，用于显式启用 ComfyUI-Manager 相关能力。" checked={activeInstance.enableManager} onChange={(value) => patchInstance({ enableManager: value })} />
                <Toggle label="禁用元数据" title="启动时追加 --disable-metadata，减少图片输出中写入工作流/提示词等元数据。" checked={activeInstance.disableMetadata} onChange={(value) => patchInstance({ disableMetadata: value })} />
                <Toggle label="托盘" title="窗口关闭或最小化时偏向托盘驻留。当前版本先保存偏好，托盘完整行为后续接入。" checked={activeInstance.minimizeToTray} onChange={(value) => patchInstance({ minimizeToTray: value })} />
                <Toggle label="完成通知" title="保存任务完成通知偏好，用于后续接入 Windows 通知。" checked={activeInstance.notifyOnComplete} onChange={(value) => patchInstance({ notifyOnComplete: value })} />
                </div>
                <code className="arg-preview launch-args">{launchArgs || "main.py"}</code>
              </Panel>

              <Panel title="系统状态" eyebrow="System stats">
                <div className="runtime-grid">
                  <InfoTile label="OS" value={systemStats.os || "未连接"} />
                  <InfoTile label="Python" value={systemStats.python || "未连接"} />
                  <InfoTile label="PyTorch" value={systemStats.pytorch || "未连接"} />
                  <InfoTile label="模型目录" value={`${models.length} 项`} />
                </div>
                <div className="device-list">
                  {systemStats.devices.length ? systemStats.devices.map((device) => {
                    const used = Math.max(0, device.vramTotal - device.vramFree);
                    const percent = device.vramTotal ? Math.round((used / device.vramTotal) * 100) : 0;
                    return (
                      <div className="device-row" key={`${device.name}-${device.type}`}>
                        <div><strong>{device.name}</strong><span>{device.type}</span></div>
                        <div className="meter"><i style={{ width: `${percent}%` }} /></div>
                        <span>{formatBytes(used)} / {formatBytes(device.vramTotal)}</span>
                      </div>
                    );
                  }) : <div className="empty-state">ComfyUI 启动后会显示设备和显存信息</div>}
                </div>
              </Panel>

              <Panel title="模式预览" eyebrow="Mode diff">
                <div className="mode-bar">
                  <Field label="名称"><input value={activeMode.name} onChange={(event) => patchMode({ name: event.target.value })} /></Field>
                  <Field label="策略"><select value={activeMode.applyStrategy} onChange={(event) => patchMode({ applyStrategy: event.target.value as LauncherMode["applyStrategy"] })}><option value="disabled-list">禁用列表</option><option value="enabled-only">仅启用列表</option></select></Field>
                  <button className="ghost" onClick={duplicateMode}><Copy size={15} />复制</button>
                  <button className="ghost danger-text" onClick={deleteMode}><Trash2 size={15} />删除</button>
                </div>
                <div className="diff-grid">
                  <DiffList title="将启用" items={modePreview.enable} tone="ok" />
                  <DiffList title="将禁用" items={modePreview.disable} tone="bad" />
                  <DiffList title="缺失" items={modePreview.missing} tone="warn" />
                </div>
              </Panel>

              <Panel title="快捷目录" eyebrow="Folders">
                <div className="quick-grid">
                  {["models", "custom_nodes", "input", "output", "user"].map((name) => <button className="quick" key={name} onClick={() => window.launcher.filesystem.openPath(`${activeInstance.comfyuiPath}\\${name}`)}><FolderOpen size={16} />{name}</button>)}
                  {activeInstance.pathReferences.filter((ref) => ref.enabled).slice(0, 6).map((ref) => <button className="quick" key={ref.id} onClick={() => window.launcher.paths.open(ref.path)}><ExternalLink size={16} />{ref.label}</button>)}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {view === "logs" && (
          <Panel title="日志控制台" eyebrow="Runtime console" action={<div className="button-row"><button className="ghost" disabled={!status.url} onClick={() => window.launcher.comfy.openWeb(activeInstance.browserChoice, activeInstance.browserPath)}><ExternalLink size={15} />打开网页</button><button className="ghost" disabled={!status.running} onClick={interruptGeneration}><Pause size={15} />中断</button><button className="ghost" disabled={!status.running || !queue.pending} onClick={() => window.confirm("清空 ComfyUI 等待队列？") && clearQueueNow()}><ListRestart size={15} />清队列</button><button className="ghost" disabled={!status.running} onClick={() => window.confirm("请求 ComfyUI 卸载模型并释放显存/内存？") && freeMemoryNow()}><Cpu size={15} />释放内存</button><button className={followLogs ? "ghost active-action" : "ghost"} onClick={() => setFollowLogs((value) => !value)}><Bell size={15} />跟随最新</button><button className="ghost" onClick={() => navigator.clipboard.writeText(logs.join("\n"))}><Copy size={15} />复制日志</button><button className="ghost danger-text" onClick={async () => setLogs(await window.launcher.logs.clear())}><Trash2 size={15} />清空</button></div>}>
            <div className="log-console-meta">
              <Stat label="服务地址" value={status.url || "未启动"} />
              <Stat label="队列" value={`${queue.running}/${queue.pending}`} tone={queue.running || queue.pending ? "warn" : "ok"} />
              <Stat label="错误" value={`${errors}`} tone={errors ? "bad" : "ok"} />
              <Stat label="警告" value={`${warnings}`} tone={warnings ? "warn" : "ok"} />
            </div>
            <div className="log-diagnostics">
              <div className="log-filter">
                {[
                  ["all", "全部", logs.length],
                  ["errors", "错误", errors],
                  ["warnings", "警告", warnings]
                ].map(([id, label, count]) => (
                  <button className={logFilter === id ? "active" : ""} key={id} onClick={() => setLogFilter(id as LogFilter)}>{label}<span>{count}</span></button>
                ))}
              </div>
              <div className="diagnostic-list">
                {logDiagnostics.length ? logDiagnostics.map((item, index) => (
                  <button key={`${item.type}-${index}`} onClick={() => navigator.clipboard.writeText(`${item.type}\n${item.line}\n${item.hint}`)}>
                    <strong>{item.type}</strong>
                    <span title={item.line}>{item.line}</span>
                    <em>{item.hint}</em>
                  </button>
                )) : <div className="empty-state compact-empty">还没有识别到明显错误。启动后这里会自动提取缺包、缺节点、端口占用和显存问题。</div>}
              </div>
            </div>
            <pre className="log-box full" ref={logBoxRef} onScroll={() => {
              const box = logBoxRef.current;
              if (!box) return;
              setFollowLogs(box.scrollHeight - box.scrollTop - box.clientHeight < 28);
            }}>{visibleLogs.length ? visibleLogs.map((line, index) => <span className={/error|failed|traceback|exception|ModuleNotFoundError|ImportError/i.test(line) ? "log-error" : /warn/i.test(line) ? "log-warn" : ""} key={`${index}-${line}`}>{line}{"\n"}</span>) : "等待日志输出..."}</pre>
          </Panel>
        )}

        {view === "plugins" && (
          <Panel className="plugins-panel" title="插件维护" eyebrow="Custom nodes" action={<SearchBox value={pluginSearch} onChange={setPluginSearch} />}>
            <div className="plugin-dashboard">
              <MiniStat label="插件总数" value={`${plugins.length}`} />
              <MiniStat label="已启用" value={`${enabledCount}`} tone="ok" />
              <MiniStat label="健康问题" value={`${issueCount}`} tone={issueCount ? "warn" : "ok"} />
              <MiniStat label="可装依赖" value={`${plugins.filter((plugin) => plugin.hasRequirements).length}`} />
            </div>
            <div className="segmented">
              {[
                ["all", "全部", plugins.length],
                ["issues", "有问题", issueCount],
                ["disabled", "已禁用", plugins.filter((plugin) => !plugin.enabled).length],
                ["requirements", "有依赖", plugins.filter((plugin) => plugin.hasRequirements).length],
                ["git", "Git", plugins.filter((plugin) => plugin.isGit).length]
              ].map(([id, label, count]) => (
                <button className={pluginFilter === id ? "active" : ""} key={id} onClick={() => setPluginFilter(id as PluginFilter)}>
                  {label}<span>{count}</span>
                </button>
              ))}
            </div>
            <div className="inline-form">
              <input placeholder="GitHub 插件仓库 URL" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} />
              <button className="primary" onClick={installPlugin} disabled={!repoUrl.trim()}><GitBranch size={16} />安装</button>
              <button className="ghost" onClick={() => guarded("扫描插件", refreshPlugins)}><RefreshCw size={16} />扫描</button>
            </div>
            <div className="plugin-table">
              {filteredPlugins.length ? filteredPlugins.map((plugin) => (
                <article className="plugin-row" key={`${plugin.path}-${plugin.enabled}`}>
                  <div className="plugin-main">
                    <div className="plugin-identity">
                      <strong title={plugin.name}>{plugin.name}</strong>
                      <span title={plugin.path}>{plugin.isGit ? `${plugin.branch} · ${plugin.commit}` : "本地插件"}{plugin.hasRequirements ? " · requirements" : ""}</span>
                    </div>
                    <div className="plugin-badges">
                      <span className={plugin.enabled ? "pill ok" : "pill"}>{plugin.enabled ? "启用" : "禁用"}</span>
                      <span className={plugin.health?.problems?.length ? "pill warn" : "pill ok"}>{plugin.health?.problems?.length ? `${plugin.health.problems.length} 问题` : "健康"}</span>
                    </div>
                    <div className="plugin-mode-flags">
                      <label className="check"><input type="checkbox" checked={activeMode.disabledPlugins.includes(plugin.name)} onChange={(event) => updateModePlugin(plugin.name, "disabledPlugins", event.target.checked)} />禁用列表</label>
                      <label className="check"><input type="checkbox" checked={activeMode.enabledPlugins.includes(plugin.name)} onChange={(event) => updateModePlugin(plugin.name, "enabledPlugins", event.target.checked)} />启用列表</label>
                    </div>
                  </div>
                  {plugin.health?.problems?.length ? (
                    <div className="plugin-problems">
                      {plugin.health.problems.slice(0, 3).map((problem) => <span key={problem}>{problem}</span>)}
                    </div>
                  ) : null}
                  <div className="plugin-actions">
                    <button className="icon-btn" title="目录" onClick={() => window.launcher.filesystem.openPath(plugin.path)}><FolderOpen size={15} /></button>
                    <button className="icon-btn" title="备份" onClick={() => guarded("备份插件", () => window.launcher.plugins.backup(plugin.path)).then(() => window.launcher.plugins.listBackups().then((rows) => setBackups(rows as DirEntry[])))}><Shield size={15} /></button>
                    <button className="icon-btn" title="更新" disabled={!plugin.isGit} onClick={() => window.confirm("更新前会自动备份，是否继续？") && guarded("更新插件", () => window.launcher.plugins.update(plugin.path)).then(refreshPlugins)}><RefreshCw size={15} /></button>
                    <button className="icon-btn" title="依赖" disabled={!plugin.hasRequirements} onClick={() => window.confirm("安装此插件 requirements.txt？") && guarded("安装插件依赖", () => window.launcher.plugins.installRequirements(activeInstance, plugin.path))}><SquareTerminal size={15} /></button>
                    <button className="icon-btn" title="Git 修复" disabled={!plugin.isGit} onClick={() => guarded("Git 修复", () => window.launcher.plugins.repairGit(plugin.path)).then((text) => setLogs(String(text).split("\n")))}><Wrench size={15} /></button>
                    <button className="icon-btn" title="绑定 remote" disabled={!remoteUrl.trim()} onClick={() => guarded("绑定 Git remote", () => window.launcher.plugins.bindRemote(plugin.path, remoteUrl.trim())).then(refreshPlugins)}><Globe size={15} /></button>
                    <button className="ghost compact" onClick={() => guarded(plugin.enabled ? "禁用插件" : "启用插件", () => plugin.enabled ? window.launcher.plugins.disable(activeInstance, plugin.name) : window.launcher.plugins.enable(activeInstance, plugin.name)).then((rows) => setPlugins(rows as PluginInfo[]))}>{plugin.enabled ? "禁用" : "启用"}</button>
                  </div>
                </article>
              )) : <div className="empty-state">没有匹配的插件。可以刷新扫描，或检查当前 ComfyUI 的 custom_nodes 路径。</div>}
            </div>
            <div className="rescue-panel">
              <div className="rescue-summary">
                <ArchiveRestore size={18} />
                <div><strong>救援与恢复</strong><span>{backups.length ? `已有 ${backups.length} 个插件备份，最近：${backups[0]?.name}` : "更新和恢复前建议先创建插件备份"}</span></div>
              </div>
              <select defaultValue="" onChange={(event) => event.target.value && window.confirm("确认恢复备份？当前插件会先备份。") && guarded("恢复备份", () => window.launcher.plugins.restore(activeInstance, event.target.value)).then((rows) => setPlugins(rows as PluginInfo[]))}>
                <option value="">从插件备份恢复...</option>
                {backups.map((backup) => <option key={backup.path} value={backup.path}>{backup.name}</option>)}
              </select>
              <input placeholder="Git remote URL，填好后点插件行的地球按钮绑定" value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} />
              <button className="ghost" onClick={() => window.launcher.plugins.listBackups().then((rows) => setBackups(rows as DirEntry[]))}><RefreshCw size={15} />刷新备份</button>
            </div>
          </Panel>
        )}

        {view === "paths" && (
          <Panel title="路径引用" eyebrow="Path references" action={<button className="ghost" onClick={() => guarded("同步模型路径", () => window.launcher.paths.syncComfyConfig(activeInstance))}><Save size={15} />同步到启动参数</button>}>
            <div className="inline-form">
              <select value={newPathKind} onChange={(event) => setNewPathKind(event.target.value as PathReferenceKind)}>{Object.entries(pathKindLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
              <input placeholder="输入要引用的文件夹路径" value={newPath} onChange={(event) => setNewPath(event.target.value)} />
              <button className="ghost" onClick={() => window.launcher.filesystem.selectFolder().then((folder) => folder && setNewPath(folder))}><FolderOpen size={15} />选择</button>
              <button className="primary" onClick={addPathReference}><Plus size={15} />添加</button>
            </div>
            <div className="path-list">
              {activeInstance.pathReferences.map((ref) => (
                <div className="path-row" key={ref.id}>
                  <select value={ref.kind} onChange={(event) => updatePathReference(ref.id, { kind: event.target.value as PathReferenceKind })}>{Object.entries(pathKindLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
                  <input value={ref.label} onChange={(event) => updatePathReference(ref.id, { label: event.target.value })} />
                  <input value={ref.path} onChange={(event) => updatePathReference(ref.id, { path: event.target.value })} />
                  <label className="check"><input type="checkbox" checked={ref.enabled} onChange={(event) => updatePathReference(ref.id, { enabled: event.target.checked })} />启用</label>
                  <button className="icon-btn" onClick={() => window.launcher.paths.open(ref.path)}><FolderOpen size={15} /></button>
                  <button className="icon-btn danger-text" onClick={() => removePathReference(ref.id)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {view === "workflow" && (
          <Panel className="workflow-panel" title="工作流分析" eyebrow="Workflow">
            <div className="inline-form">
              <input placeholder="workflow JSON 文件路径" value={workflowPath} onChange={(event) => setWorkflowPath(event.target.value)} />
              <button className="ghost" onClick={() => window.launcher.filesystem.selectFile().then((file) => file && setWorkflowPath(file))}><FolderOpen size={15} />选择</button>
              <button className="primary" onClick={analyzeWorkflow}><FileJson size={15} />分析</button>
              <button className="ghost" onClick={applyWorkflowMode} disabled={!workflow?.matchedPlugins.length}><ListRestart size={15} />生成临时模式</button>
            </div>
            {workflow && (
              <div className="workflow-diagnosis">
                <div className="workflow-summary">
                  <Stat label="节点类型" value={`${workflow.nodeTypes.length}`} />
                  <Stat label="本地匹配插件" value={`${workflow.matchedPlugins.length}`} tone="ok" />
                  <Stat label="缺失节点" value={`${workflow.missingNodeTypes.length}`} tone={workflow.missingNodeTypes.length ? "warn" : "ok"} />
                  <Stat label="待处理插件" value={`${workflow.suggestedPlugins.filter((name) => !activePluginNames.has(name)).length}`} tone={workflow.suggestedPlugins.some((name) => !activePluginNames.has(name)) ? "warn" : "ok"} />
                </div>
                <div className="workflow-next">
                  <div>
                    <strong>{workflow.missingNodeTypes.length ? "这个工作流还需要处理缺失节点" : "这个工作流的本地插件匹配良好"}</strong>
                    <p>{workflow.missingNodeTypes.length ? "建议先处理缺失插件，再生成临时模式启动，避免无关插件干扰排查。" : "可以生成仅启用当前工作流所需插件的临时模式，用于更干净地运行和排错。"}</p>
                  </div>
                  <div className="button-row">
                    <button className="ghost" onClick={reviewWorkflowPlugins}><PlugZap size={15} />处理建议插件</button>
                    <button className="ghost" onClick={copyWorkflowReport}><Copy size={15} />复制诊断</button>
                    <button className="primary" onClick={applyWorkflowMode} disabled={!workflow.matchedPlugins.length}><ListRestart size={15} />生成临时模式</button>
                  </div>
                </div>
                <div className="workflow-grid">
                  <DiffList title="本地已匹配" items={workflow.matchedPlugins} tone="ok" />
                  <DiffList title="建议处理插件" items={workflow.suggestedPlugins.filter((name) => !activePluginNames.has(name))} tone="warn" />
                  <DiffList title="缺失节点" items={workflow.missingNodeTypes} tone="warn" />
                  <DiffList title="全部节点" items={workflow.nodeTypes} />
                </div>
              </div>
            )}
          </Panel>
        )}

        {view === "models" && (
          <Panel title="模型库" eyebrow="Local models" action={<SearchBox placeholder="搜索模型或类型" value={modelSearch} onChange={setModelSearch} />}>
            <div className="model-toolbar">
              <div className="model-summary">
                <Stat label="模型文件" value={`${filteredModels.length}`} />
                <Stat label="模型类型" value={`${modelCategories.length}`} />
                <Stat label="引用目录" value={`${activeInstance.pathReferences.filter((ref) => ref.enabled && ref.kind === "models").length + 1}`} />
              </div>
              <div className="button-row">
                <button className="ghost" onClick={() => guarded("刷新模型库", refreshModelIndex)}><RefreshCw size={15} />刷新</button>
                <button className="ghost" onClick={() => window.launcher.filesystem.openPath(`${activeInstance.comfyuiPath}\\models`)}><FolderOpen size={15} />打开 models</button>
                <button className="ghost" onClick={() => guarded("同步模型路径", () => window.launcher.paths.syncComfyConfig(activeInstance))}><Save size={15} />同步引用</button>
              </div>
            </div>
            <div className="model-layout">
              <aside className="model-cats">
                <strong>类型分布</strong>
                {modelCategories.length ? modelCategories.map(([name, count]) => (
                  <button className="cat-row" key={name} onClick={() => setModelSearch(name)}>
                    <span>{name}</span><em>{count}</em>
                  </button>
                )) : <div className="empty-state">未扫描到模型类型。</div>}
              </aside>
              <div className="model-table">
                <div className="model-row head"><span>名称</span><span>类型</span><span>大小</span><span>修改时间</span><span>操作</span></div>
                {filteredModels.length ? filteredModels.map((item) => (
                  <div className="model-row" key={item.path}>
                    <strong title={item.name}>{item.name}</strong>
                    <span className="pill">{item.category}</span>
                    <span>{formatFileSize(item.size)}</span>
                    <span>{new Date(item.modifiedAt).toLocaleString()}</span>
                    <button className="icon-btn" title="在文件夹中显示" onClick={() => window.launcher.models.reveal(item.path)}><FolderOpen size={15} /></button>
                  </div>
                )) : <div className="empty-state">没有匹配的模型文件。支持 safetensors、ckpt、pt、pth、gguf、onnx 等常见格式。</div>}
              </div>
            </div>
          </Panel>
        )}

        {view === "media" && (
          <Panel title="媒体库" eyebrow="Output browser" action={<SearchBox placeholder="搜索输出文件" value={mediaSearch} onChange={setMediaSearch} />}>
            <div className="media-toolbar">
              <div className="media-stats">
                <Stat label="输出文件" value={`${filteredMedia.length}`} />
                <Stat label="历史记录" value={`${historyItems.length}`} />
                <Stat label="输出目录" value={`${activeInstance.pathReferences.filter((ref) => ref.enabled && ref.kind === "outputs").length + 1}`} />
              </div>
              <div className="button-row">
                <button className="ghost" onClick={() => guarded("刷新媒体库", refreshMedia)}><RefreshCw size={15} />刷新</button>
                <button className="ghost" onClick={() => window.launcher.filesystem.openPath(`${activeInstance.comfyuiPath}\\output`)}><FolderOpen size={15} />打开 output</button>
                <button className="ghost danger-text" onClick={clearHistoryNow}><Trash2 size={15} />清 history</button>
              </div>
            </div>
            <div className="media-layout">
              <div className="media-grid">
                {filteredMedia.length ? filteredMedia.map((item) => (
                  <article className="media-card" key={item.path}>
                    <div className="media-preview">
                      {item.type === "image" ? (
                        <div
                          aria-label={item.name}
                          className="media-image"
                          role="img"
                          style={{ backgroundImage: `url("${item.fileUrl}")` }}
                        />
                      ) : (
                        <video src={item.fileUrl} muted playsInline controls preload="metadata" />
                      )}
                    </div>
                    <div className="media-caption">
                      <strong title={item.name}>{item.name}</strong>
                      <span>{new Date(item.modifiedAt).toLocaleString()} · {item.type === "image" ? "图片" : "视频"}</span>
                    </div>
                    <div className="media-actions">
                      <button className="icon-btn" title="在文件夹中显示" onClick={() => revealMedia(item.path)}><FolderOpen size={15} /></button>
                      <button className="icon-btn danger-text" title="删除" onClick={() => deleteMediaItem(item)}><Trash2 size={15} /></button>
                    </div>
                  </article>
                )) : <div className="empty-state">还没有扫描到输出图片或视频。生成完成后点刷新即可查看。</div>}
              </div>
              <aside className="history-panel">
                <div className="history-title"><History size={15} />最近 History</div>
                {historyItems.length ? historyItems.slice(0, 30).map((item) => (
                  <div className="history-row" key={item.id}>
                    <strong title={item.id}>{item.id}</strong>
                    <span>{item.nodeCount} 节点 · {item.outputCount} 输出</span>
                  </div>
                )) : <div className="empty-state">ComfyUI 启动后会读取 /history。</div>}
              </aside>
            </div>
          </Panel>
        )}

        {view === "environment" && (
          <Panel className="environment-panel" title="环境维护" eyebrow="Python">
            <div className="env-layout">
              <div className="env-main">
                <div className="core-box">
                  <div>
                    <span>ComfyUI 内核</span>
                    <strong>{coreInfo ? `${coreInfo.tag || coreInfo.branch} · ${coreInfo.commit}` : "未检测"}</strong>
                    <p>{coreInfo?.remote || "Git remote 未读取"}</p>
                    {coreInfo?.status && <em>有本地变更：{coreInfo.status.split(/\r?\n/).length} 项</em>}
                  </div>
                  <div className="button-row">
                    <button className="ghost" onClick={refreshCoreInfo}><RefreshCw size={15} />检测内核</button>
                    <button className="primary" onClick={() => window.confirm("将从官方 origin/master 更新 ComfyUI 内核。若有本地冲突，Git 会拒绝更新。继续？") && guarded("更新 ComfyUI 内核", () => window.launcher.comfy.updateCore(activeInstance)).then((text) => { setLogs(String(text).split("\n")); refreshCoreInfo(); switchView("logs"); })}><GitBranch size={15} />更新内核</button>
                  </div>
                </div>
                <div className="pkg-table">
                  {packages.map((pkg) => (
                    <div className={pkg.version === "未安装" ? "pkg-row missing" : "pkg-row"} key={pkg.name}>
                      <span>{pkg.name}</span>
                      <strong title={pkg.version}>{pkg.version}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="env-actions">
                <div className="env-summary">
                  <strong>环境诊断</strong>
                  <span>{packages.filter((pkg) => pkg.version === "未安装").length ? `${packages.filter((pkg) => pkg.version === "未安装").length} 个关键包未安装` : "关键包状态良好"}</span>
                  <div className="button-row">
                    <button className="ghost" onClick={refreshPackages}><RefreshCw size={15} />检测关键包</button>
                    <button className="ghost" onClick={() => guarded("pip list", () => window.launcher.python.pipList(activeInstance.pythonPath)).then((text) => { setLogs(String(text).split("\n")); switchView("logs"); })}><SquareTerminal size={15} />pip list</button>
                  </div>
                </div>
                {environmentTools.map((tool) => (
                  <button className={`env-tool ${tool.risk === "高" ? "high-risk" : ""}`} key={tool.id} onClick={() => installEnvironmentTool(tool.id)}>
                    <span><b>{tool.label}</b><em>{tool.desc}</em></span>
                    <i>{tool.risk}风险</i>
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        )}

        {view === "settings" && (
          <Panel title="设置" eyebrow="Configuration">
            <div className="form-grid two">
              <Field label="环境名称"><input value={displayName(activeInstance.name)} onChange={(event) => patchInstance({ name: event.target.value })} /></Field>
              <Field label="模式名称"><input value={activeMode.name} onChange={(event) => patchMode({ name: event.target.value })} /></Field>
              <Field label="ComfyUI 路径"><div className="input-with-button"><input value={activeInstance.comfyuiPath} onChange={(event) => patchInstance({ comfyuiPath: event.target.value })} /><button className="icon-btn" onClick={() => window.launcher.filesystem.selectFolder().then((folder) => folder && patchInstance({ comfyuiPath: folder }))}><FolderOpen size={15} /></button></div></Field>
              <Field label="Python 路径"><input value={activeInstance.pythonPath} onChange={(event) => patchInstance({ pythonPath: event.target.value })} /></Field>
              <Field label="代理地址"><input value={activeInstance.proxyAddress} onChange={(event) => patchInstance({ proxyAddress: event.target.value })} /></Field>
              <Field label="启动浏览器"><select value={activeInstance.browserChoice} onChange={(event) => patchInstance({ browserChoice: event.target.value })}>{browsers.map((browser) => <option disabled={!browser.available} value={browser.id} key={browser.id}>{browser.label}{browser.available ? "" : "（未找到）"}</option>)}</select></Field>
              <Field label="自定义浏览器路径"><input value={activeInstance.browserPath} onChange={(event) => patchInstance({ browserPath: event.target.value })} /></Field>
              <Field label="额外参数"><input value={activeInstance.extraArgs} onChange={(event) => patchInstance({ extraArgs: event.target.value })} /></Field>
            </div>
            <div className="button-row">
              <button className="primary" onClick={() => save()}><Save size={15} />保存配置</button>
            </div>
          </Panel>
        )}
      </main>

      <footer className="statusbar"><span>{message}</span><span>{busy ? "处理中" : "空闲"}</span></footer>
    </div>
  );
}

function SectionTitle({ label, action }: { label: string; action?: React.ReactNode }) {
  return <div className="section-title"><span>{label}</span>{action}</div>;
}

function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`.trim()}><div className="panel-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action}</div>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange, title }: { label: string; checked: boolean; onChange(value: boolean): void; title?: string }) {
  return <button className={checked ? "toggle checked" : "toggle"} title={title} onClick={() => onChange(!checked)}><span />{label}</button>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  return <div className={`stat ${tone || ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  return <div className={`mini-stat ${tone || ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return <div className="info-tile"><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function DiffList({ title, items, tone }: { title: string; items: string[]; tone?: "ok" | "bad" | "warn" }) {
  return <div className={`diff-list ${tone || ""}`}><strong>{title}</strong><div>{items.length ? items.slice(0, 80).map((item) => <span key={item}>{item}</span>) : <em>无</em>}</div></div>;
}

function SearchBox({ value, onChange, placeholder = "搜索插件" }: { value: string; onChange(value: string): void; placeholder?: string }) {
  return <label className="search"><Search size={14} /><input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
