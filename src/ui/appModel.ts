import {
  Boxes,
  FileJson,
  FolderOpen,
  Image,
  MonitorPlay,
  PlugZap,
  Settings,
  SquareTerminal,
  Wrench
} from "lucide-react";
import type { LauncherConfig, LauncherInstance, LauncherMode, PathReferenceKind } from "../types";

export type ToolView = "console" | "logs" | "plugins" | "paths" | "workflow" | "models" | "media" | "environment" | "settings";
export type PluginFilter = "all" | "issues" | "disabled" | "requirements" | "git";
export type LogFilter = "all" | "errors" | "warnings";
export type LaunchPhase = "idle" | "checking" | "applying-mode" | "starting" | "running" | "stopping" | "failed";

export const tools: Array<{ id: ToolView; label: string; icon: typeof MonitorPlay }> = [
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

export const pathKindLabels: Record<PathReferenceKind, string> = {
  models: "模型",
  plugins: "插件",
  workflows: "工作流",
  outputs: "输出"
};

export const vramModes: LauncherInstance["vramMode"][] = ["默认", "lowvram", "normalvram", "highvram", "novram", "cpu"];

export const environmentTools = [
  { id: "requirements", label: "requirements", risk: "低", desc: "安装 ComfyUI 根目录 requirements.txt，适合首次补齐基础依赖。" },
  { id: "Torch", label: "Torch", risk: "高", desc: "安装 torch / torchvision / torchaudio。CUDA 版本不匹配时需谨慎。" },
  { id: "Triton", label: "Triton", risk: "中", desc: "安装 Triton，部分加速插件可能需要。" },
  { id: "xformers", label: "xformers", risk: "中", desc: "安装 xformers，用于部分显存和注意力优化，需要匹配 Torch。" },
  { id: "SageAttention", label: "SageAttention", risk: "中", desc: "安装 SageAttention，适合明确需要该加速库的工作流。" },
  { id: "Nunchaku", label: "Nunchaku", risk: "中", desc: "安装 Nunchaku，适合相关量化模型或节点。" }
];

const validViews = new Set<ToolView>(tools.map((tool) => tool.id));

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

export function normalizeView(value: string): ToolView {
  if (value === "launch") return "console";
  return validViews.has(value as ToolView) ? (value as ToolView) : "console";
}

export function cleanText(value: string, fallback = "") {
  if (!value) return fallback;
  if (/榛|鏃|鎺|绛|鐜|妯|鎻|璺|濯|鍚|鏈|鍦/.test(value)) return fallback || "未命名";
  return value;
}

export function normalizeVram(value: string): LauncherInstance["vramMode"] {
  return value === "榛樿" || !vramModes.includes(value as LauncherInstance["vramMode"]) ? "默认" : value as LauncherInstance["vramMode"];
}

export function compactPath(value: string, max = 78) {
  if (!value) return "尚未配置路径";
  return value.length <= max ? value : `${value.slice(0, 28)}...${value.slice(-42)}`;
}

export function formatBytes(value: number) {
  if (!value) return "0 GB";
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatFileSize(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 / 1024).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export function pluginNameFromUrl(url: string) {
  return url.split(/[\\/]/).pop()?.replace(/\.git$/i, "") || "";
}

export function blankInstance(source?: Partial<LauncherInstance>): LauncherInstance {
  return {
    id: uid("inst"),
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
    advancedArgs: {},
    ...source
  };
}

export function blankMode(name = "默认模式"): LauncherMode {
  return { id: uid("mode"), name, enabledPlugins: [], disabledPlugins: [], applyStrategy: "disabled-list", overrides: {} };
}

export function defaultConfig(): LauncherConfig {
  const instance = blankInstance();
  const mode = blankMode();
  return { currentInstanceId: instance.id, currentModeId: mode.id, instances: [instance], modes: [mode], ui: { activeView: "settings" } };
}

export function normalizeInstance(instance: LauncherInstance): LauncherInstance {
  const fallbackName = instance.name?.startsWith("ComfyUI") ? instance.name : "ComfyUI 环境";
  return {
    ...blankInstance(),
    ...instance,
    name: cleanText(instance.name, fallbackName),
    vramMode: normalizeVram(instance.vramMode),
    pathReferences: instance.pathReferences || [],
    advancedArgs: instance.advancedArgs || {}
  };
}

export function normalizeMode(mode: LauncherMode): LauncherMode {
  return {
    ...blankMode(),
    ...mode,
    name: cleanText(mode.name, "默认模式"),
    enabledPlugins: mode.enabledPlugins || [],
    disabledPlugins: mode.disabledPlugins || [],
    applyStrategy: mode.applyStrategy || "disabled-list"
  };
}

export function normalizeConfig(config: LauncherConfig): LauncherConfig {
  const instances = (config.instances?.length ? config.instances : [blankInstance()]).map(normalizeInstance);
  const modes = (config.modes?.length ? config.modes : [blankMode()]).map(normalizeMode);
  return {
    currentInstanceId: instances.some((item) => item.id === config.currentInstanceId) ? config.currentInstanceId : instances[0].id,
    currentModeId: modes.some((item) => item.id === config.currentModeId) ? config.currentModeId : modes[0].id,
    instances,
    modes,
    ui: { activeView: normalizeView(config.ui?.activeView || "settings") }
  };
}

export function selectConfigInstance(config: LauncherConfig, id: string): LauncherConfig {
  return normalizeConfig({ ...config, currentInstanceId: id });
}

export function selectConfigMode(config: LauncherConfig, id: string): LauncherConfig {
  return normalizeConfig({ ...config, currentModeId: id });
}

export function pythonPathCandidates(folder: string) {
  const root = folder.replace(/[\\/]+$/, "");
  return [
    `${root}\\python_embeded\\python.exe`,
    `${root}\\.venv\\Scripts\\python.exe`,
    `${root}\\venv\\Scripts\\python.exe`,
    `${root}\\python\\python.exe`,
    `${root}\\embedded_python\\python.exe`
  ];
}

export function guessPythonPath(folder: string) {
  return pythonPathCandidates(folder)[0];
}
