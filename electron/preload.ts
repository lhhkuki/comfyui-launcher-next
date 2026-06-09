import { contextBridge, ipcRenderer } from "electron";
import type { LauncherConfig, LauncherInstance } from "./types";

const api = {
  config: {
    load: () => ipcRenderer.invoke("config:load"),
    save: (config: LauncherConfig) => ipcRenderer.invoke("config:save", config)
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggleMaximize"),
    close: () => ipcRenderer.send("window:close")
  },
  comfy: {
    start: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:start", instance),
    stop: () => ipcRenderer.invoke("comfy:stop"),
    status: () => ipcRenderer.invoke("comfy:status"),
    preflight: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:preflight", instance),
    releasePort: (port: string) => ipcRenderer.invoke("comfy:releasePort", port),
    openWeb: (browserChoice?: string, browserPath?: string) => ipcRenderer.invoke("comfy:openWeb", browserChoice, browserPath),
    coreVersion: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:coreVersion", instance),
    updateCore: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:updateCore", instance),
    queue: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:queue", instance),
    systemStats: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:systemStats", instance),
    history: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:history", instance),
    interrupt: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:interrupt", instance),
    clearQueue: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:clearQueue", instance),
    freeMemory: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:freeMemory", instance),
    clearHistory: (instance: LauncherInstance) => ipcRenderer.invoke("comfy:clearHistory", instance),
    onStatus: (callback: (status: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
      ipcRenderer.on("comfy:status", listener);
      return () => ipcRenderer.removeListener("comfy:status", listener);
    }
  },
  filesystem: {
    openPath: (target: string) => ipcRenderer.invoke("filesystem:openPath", target),
    listDir: (target: string) => ipcRenderer.invoke("filesystem:listDir", target),
    selectFolder: () => ipcRenderer.invoke("filesystem:selectFolder"),
    selectFile: () => ipcRenderer.invoke("filesystem:selectFile")
  },
  plugins: {
    scan: (instance: LauncherInstance) => ipcRenderer.invoke("plugins:scan", instance),
    enable: (instance: LauncherInstance, name: string) => ipcRenderer.invoke("plugins:enable", instance, name),
    disable: (instance: LauncherInstance, name: string) => ipcRenderer.invoke("plugins:disable", instance, name),
    installFromGit: (instance: LauncherInstance, repoUrl: string) =>
      ipcRenderer.invoke("plugins:installFromGit", instance, repoUrl),
    update: (pluginPath: string) => ipcRenderer.invoke("plugins:update", pluginPath),
    backup: (pluginPath: string) => ipcRenderer.invoke("plugins:backup", pluginPath),
    listBackups: () => ipcRenderer.invoke("plugins:listBackups"),
    restore: (instance: LauncherInstance, backupPath: string) => ipcRenderer.invoke("plugins:restore", instance, backupPath),
    health: (instance: LauncherInstance) => ipcRenderer.invoke("plugins:health", instance),
    checkDuplicate: (instance: LauncherInstance) => ipcRenderer.invoke("plugins:checkDuplicate", instance),
    repairGit: (pluginPath: string) => ipcRenderer.invoke("plugins:repairGit", pluginPath),
    bindRemote: (pluginPath: string, remoteUrl: string) => ipcRenderer.invoke("plugins:bindRemote", pluginPath, remoteUrl),
    installRequirements: (instance: LauncherInstance, pluginPath: string) =>
      ipcRenderer.invoke("plugins:installRequirements", instance, pluginPath)
  },
  modes: {
    preview: (instance: LauncherInstance, mode: unknown) => ipcRenderer.invoke("modes:preview", instance, mode),
    apply: (instance: LauncherInstance, mode: unknown) => ipcRenderer.invoke("modes:apply", instance, mode),
    duplicate: (config: LauncherConfig, modeId: string) => ipcRenderer.invoke("modes:duplicate", config, modeId),
    delete: (config: LauncherConfig, modeId: string) => ipcRenderer.invoke("modes:delete", config, modeId)
  },
  paths: {
    list: (instance: LauncherInstance) => ipcRenderer.invoke("paths:list", instance),
    open: (target: string) => ipcRenderer.invoke("paths:open", target),
    syncComfyConfig: (instance: LauncherInstance) => ipcRenderer.invoke("paths:syncComfyConfig", instance)
  },
  workflow: {
    analyze: (instance: LauncherInstance, filePath: string) => ipcRenderer.invoke("workflow:analyze", instance, filePath)
  },
  media: {
    list: (instance: LauncherInstance) => ipcRenderer.invoke("media:list", instance),
    delete: (target: string) => ipcRenderer.invoke("media:delete", target),
    reveal: (target: string) => ipcRenderer.invoke("media:reveal", target)
  },
  models: {
    list: (instance: LauncherInstance) => ipcRenderer.invoke("models:list", instance),
    reveal: (target: string) => ipcRenderer.invoke("models:reveal", target)
  },
  browser: {
    list: () => ipcRenderer.invoke("browser:list")
  },
  python: {
    version: (pythonPath: string) => ipcRenderer.invoke("python:version", pythonPath),
    pipList: (pythonPath: string) => ipcRenderer.invoke("python:pipList", pythonPath),
    installRequirements: (pythonPath: string, requirementsPath: string) =>
      ipcRenderer.invoke("python:installRequirements", pythonPath, requirementsPath)
  },
  environment: {
    keyPackages: (pythonPath: string) => ipcRenderer.invoke("environment:keyPackages", pythonPath),
    installTool: (instance: LauncherInstance, tool: string) => ipcRenderer.invoke("environment:installTool", instance, tool)
  },
  logs: {
    read: () => ipcRenderer.invoke("logs:read"),
    clear: () => ipcRenderer.invoke("logs:clear"),
    export: () => ipcRenderer.invoke("logs:export"),
    onLine: (callback: (line: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, line: string) => callback(line);
      ipcRenderer.on("logs:line", listener);
      return () => ipcRenderer.removeListener("logs:line", listener);
    }
  }
};

contextBridge.exposeInMainWorld("launcher", api);

export type LauncherApi = typeof api;
