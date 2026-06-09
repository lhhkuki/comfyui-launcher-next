import type {
  BrowserOption,
  CoreVersionInfo,
  EnvironmentPackage,
  LauncherConfig,
  LauncherInstance,
  LauncherMode,
  HistoryItem,
  MediaItem,
  ModePreview,
  ModelItem,
  PreflightResult,
  QueueStatus,
  SystemStats,
  WorkflowAnalysisResult
} from "./types";

declare global {
  interface Window {
    launcher: {
      config: {
        load(): Promise<LauncherConfig>;
        save(config: LauncherConfig): Promise<LauncherConfig>;
      };
      window: {
        minimize(): void;
        toggleMaximize(): void;
        close(): void;
      };
      comfy: {
        start(instance: LauncherInstance): Promise<unknown>;
        stop(): Promise<unknown>;
        status(): Promise<unknown>;
        preflight(instance: LauncherInstance): Promise<PreflightResult>;
        releasePort(port: string): Promise<PreflightResult>;
        openWeb(browserChoice?: string, browserPath?: string): Promise<void>;
        coreVersion(instance: LauncherInstance): Promise<CoreVersionInfo>;
        updateCore(instance: LauncherInstance): Promise<string>;
        queue(instance: LauncherInstance): Promise<QueueStatus>;
        systemStats(instance: LauncherInstance): Promise<SystemStats>;
        history(instance: LauncherInstance): Promise<HistoryItem[]>;
        interrupt(instance: LauncherInstance): Promise<QueueStatus>;
        clearQueue(instance: LauncherInstance): Promise<QueueStatus>;
        freeMemory(instance: LauncherInstance): Promise<SystemStats>;
        clearHistory(instance: LauncherInstance): Promise<HistoryItem[]>;
        onStatus(callback: (status: unknown) => void): () => void;
      };
      filesystem: {
        openPath(target: string): Promise<string>;
        listDir(target: string): Promise<unknown[]>;
        selectFolder(): Promise<string>;
        selectFile(): Promise<string>;
      };
      plugins: {
        scan(instance: LauncherInstance): Promise<unknown[]>;
        enable(instance: LauncherInstance, name: string): Promise<unknown[]>;
        disable(instance: LauncherInstance, name: string): Promise<unknown[]>;
        installFromGit(instance: LauncherInstance, repoUrl: string): Promise<unknown[]>;
        update(pluginPath: string): Promise<string>;
        backup(pluginPath: string): Promise<string>;
        listBackups(): Promise<unknown[]>;
        restore(instance: LauncherInstance, backupPath: string): Promise<unknown[]>;
        health(instance: LauncherInstance): Promise<unknown[]>;
        checkDuplicate(instance: LauncherInstance): Promise<unknown[]>;
        repairGit(pluginPath: string): Promise<string>;
        bindRemote(pluginPath: string, remoteUrl: string): Promise<string>;
        installRequirements(instance: LauncherInstance, pluginPath: string): Promise<string>;
      };
      modes: {
        preview(instance: LauncherInstance, mode: LauncherMode): Promise<ModePreview>;
        apply(instance: LauncherInstance, mode: LauncherMode): Promise<unknown[]>;
        duplicate(config: LauncherConfig, modeId: string): Promise<LauncherConfig>;
        delete(config: LauncherConfig, modeId: string): Promise<LauncherConfig>;
      };
      paths: {
        list(instance: LauncherInstance): Promise<unknown[]>;
        open(target: string): Promise<string>;
        syncComfyConfig(instance: LauncherInstance): Promise<string>;
      };
      workflow: {
        analyze(instance: LauncherInstance, filePath: string): Promise<WorkflowAnalysisResult>;
      };
      media: {
        list(instance: LauncherInstance): Promise<MediaItem[]>;
        delete(target: string): Promise<boolean>;
        reveal(target: string): Promise<void>;
      };
      models: {
        list(instance: LauncherInstance): Promise<ModelItem[]>;
        reveal(target: string): Promise<void>;
      };
      browser: {
        list(): Promise<BrowserOption[]>;
      };
      python: {
        version(pythonPath: string): Promise<string>;
        pipList(pythonPath: string): Promise<string>;
        installRequirements(pythonPath: string, requirementsPath: string): Promise<string>;
      };
      environment: {
        keyPackages(pythonPath: string): Promise<EnvironmentPackage[]>;
        installTool(instance: LauncherInstance, tool: string): Promise<string>;
      };
      logs: {
        read(): Promise<string[]>;
        clear(): Promise<string[]>;
        export(): Promise<string>;
        onLine(callback: (line: string) => void): () => void;
      };
    };
  }
}
