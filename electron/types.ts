export type VramMode = "默认" | "lowvram" | "normalvram" | "highvram" | "novram" | "cpu";
export type PathReferenceKind = "models" | "plugins" | "workflows" | "outputs";
export type ModeApplyStrategy = "disabled-list" | "enabled-only";

export interface PathReference {
  id: string;
  kind: PathReferenceKind;
  label: string;
  path: string;
  enabled: boolean;
}

export interface LauncherInstance {
  id: string;
  name: string;
  comfyuiPath: string;
  pythonPath: string;
  port: string;
  gpu: string;
  proxyEnabled: boolean;
  proxyAddress: string;
  hfMirrorEnabled: boolean;
  vramMode: VramMode;
  disableXformers: boolean;
  disableMetadata: boolean;
  enableManager: boolean;
  extraArgs: string;
  browserPath: string;
  browserChoice: string;
  minimizeToTray: boolean;
  notifyOnComplete: boolean;
  pathReferences: PathReference[];
  advancedArgs: Record<string, boolean | string>;
}

export interface LauncherMode {
  id: string;
  name: string;
  enabledPlugins: string[];
  disabledPlugins: string[];
  applyStrategy: ModeApplyStrategy;
  overrides: Partial<LauncherInstance>;
}

export interface LauncherConfig {
  currentInstanceId: string;
  currentModeId: string;
  instances: LauncherInstance[];
  modes: LauncherMode[];
  ui: { activeView: string };
}

export interface PluginInfo {
  name: string;
  path: string;
  enabled: boolean;
  isGit: boolean;
  branch: string;
  commit: string;
  status: string;
  remote: string;
  hasRequirements: boolean;
  health: PluginHealth;
}

export interface PluginHealth {
  problems: string[];
  duplicateKeys: string[];
  detachedHead: boolean;
  missingRemote: boolean;
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: string;
}

export interface RuntimeStatus {
  running: boolean;
  pid: number | null;
  url: string | null;
}

export interface PreflightCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "bad";
  detail: string;
  action?: "release-port" | "open-settings" | "open-logs";
}

export interface PreflightResult {
  ready: boolean;
  portOwnerPid: number | null;
  portHasComfyApi: boolean;
  checks: PreflightCheck[];
}

export interface QueueStatus {
  running: number;
  pending: number;
}

export interface SystemStats {
  os: string;
  python: string;
  pytorch: string;
  devices: Array<{
    name: string;
    type: string;
    vramTotal: number;
    vramFree: number;
    torchVramTotal: number;
    torchVramFree: number;
  }>;
}

export interface MediaItem {
  name: string;
  path: string;
  fileUrl: string;
  type: "image" | "video";
  size: number;
  modifiedAt: string;
}

export interface ModelItem {
  name: string;
  path: string;
  category: string;
  size: number;
  modifiedAt: string;
}

export interface HistoryItem {
  id: string;
  outputCount: number;
  nodeCount: number;
}

export interface ModePreview {
  enable: string[];
  disable: string[];
  unchanged: string[];
  missing: string[];
}

export interface WorkflowAnalysisResult {
  filePath: string;
  nodeTypes: string[];
  missingNodeTypes: string[];
  matchedPlugins: string[];
  suggestedPlugins: string[];
}

export interface EnvironmentPackage {
  name: string;
  version: string;
}

export interface BrowserOption {
  id: string;
  label: string;
  path: string;
  available: boolean;
}

export interface CoreVersionInfo {
  branch: string;
  commit: string;
  tag: string;
  remote: string;
  status: string;
}
