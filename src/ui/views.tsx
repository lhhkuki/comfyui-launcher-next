import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  FileJson,
  FolderOpen,
  GitBranch,
  Globe,
  History,
  ListRestart,
  Pause,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Shield,
  SquareTerminal,
  Trash2,
  Wrench
} from "lucide-react";
import type * as React from "react";
import type {
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
  PathReferenceKind,
  PluginInfo,
  PreflightResult,
  QueueStatus,
  RuntimeStatus,
  SystemStats,
  WorkflowAnalysisResult
} from "../types";
import type { LogFilter, PluginFilter } from "./appModel";
import { environmentTools, formatBytes, formatFileSize, pathKindLabels, vramModes } from "./appModel";
import { DiffList, Field, InfoTile, MiniStat, Panel, SearchBox, Stat, Toggle } from "./components";

export function ConsoleView(props: {
  instance: LauncherInstance;
  mode: LauncherMode;
  status: RuntimeStatus;
  queue: QueueStatus;
  stats: SystemStats;
  modelDirs: DirEntry[];
  preview: ModePreview;
  issueCount: number;
  launchArgs: string;
  preflight: PreflightResult | null;
  error: string;
  media: MediaItem[];
  browsers: BrowserOption[];
  onPatchInstance(patch: Partial<LauncherInstance>): void;
  onPatchMode(patch: Partial<LauncherMode>): void;
  onDuplicateMode(): void;
  onDeleteMode(): void;
  onReleasePort(): void;
  onOpenLogs(): void;
}) {
  return (
    <div className="page console-page">
      <div className="stat-strip compact">
        <MiniStat label="状态" value={props.status.running ? "运行中" : "未启动"} tone={props.status.running ? "ok" : "bad"} />
        <MiniStat label="队列" value={`${props.queue.running}/${props.queue.pending}`} tone={props.queue.running || props.queue.pending ? "warn" : "ok"} />
        <MiniStat label="模式变化" value={`+${props.preview.enable.length} / -${props.preview.disable.length}`} />
        <MiniStat label="插件健康" value={`${props.issueCount} 个问题`} tone={props.issueCount ? "warn" : "ok"} />
      </div>
      <PreflightStrip preflight={props.preflight} error={props.error} onReleasePort={props.onReleasePort} onOpenLogs={props.onOpenLogs} />
      <div className="console-panels">
        <Panel title="启动参数" eyebrow="Launch settings" action={<button className="ghost" onClick={props.onOpenLogs}><SquareTerminal size={15} />日志控制台</button>}>
          <div className="launch-form">
            <Field label="端口"><input title="生成 --port 参数，默认 8188。" value={props.instance.port} onChange={(event) => props.onPatchInstance({ port: event.target.value })} /></Field>
            <Field label="GPU"><input title="生成 --cuda-device 参数，留空由 ComfyUI 自动选择。" placeholder="留空自动" value={props.instance.gpu} onChange={(event) => props.onPatchInstance({ gpu: event.target.value })} /></Field>
            <Field label="VRAM"><select title="控制 ComfyUI 显存策略。" value={props.instance.vramMode} onChange={(event) => props.onPatchInstance({ vramMode: event.target.value as LauncherInstance["vramMode"] })}>{vramModes.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="浏览器"><select title="启动成功后打开 ComfyUI 网页使用的浏览器。" value={props.instance.browserChoice} onChange={(event) => props.onPatchInstance({ browserChoice: event.target.value })}>{props.browsers.map((browser) => <option disabled={!browser.available} value={browser.id} key={browser.id}>{browser.label}{browser.available ? "" : "（未找到）"}</option>)}</select></Field>
          </div>
          <div className="launch-switches">
            <Toggle label="代理" title="注入 HTTP_PROXY / HTTPS_PROXY 环境变量。" checked={props.instance.proxyEnabled} onChange={(value) => props.onPatchInstance({ proxyEnabled: value })} />
            <Toggle label="HF 镜像" title="设置 HF_ENDPOINT=https://hf-mirror.com。" checked={props.instance.hfMirrorEnabled} onChange={(value) => props.onPatchInstance({ hfMirrorEnabled: value })} />
            <Toggle label="Manager" title="追加 --enable-manager 参数。" checked={props.instance.enableManager} onChange={(value) => props.onPatchInstance({ enableManager: value })} />
            <Toggle label="禁用元数据" title="追加 --disable-metadata，减少输出图片写入工作流等元数据。" checked={props.instance.disableMetadata} onChange={(value) => props.onPatchInstance({ disableMetadata: value })} />
            <Toggle label="托盘" title="关闭或最小化时驻留托盘。" checked={props.instance.minimizeToTray} onChange={(value) => props.onPatchInstance({ minimizeToTray: value })} />
            <Toggle label="完成通知" title="队列从忙碌变为空时发送 Windows 通知。" checked={props.instance.notifyOnComplete} onChange={(value) => props.onPatchInstance({ notifyOnComplete: value })} />
          </div>
          <code className="arg-preview">{props.launchArgs || "main.py"}</code>
        </Panel>
        <Panel title="系统状态" eyebrow="System stats">
          <RuntimeGrid stats={props.stats} modelCount={props.modelDirs.length} />
        </Panel>
        <Panel title="模式预览" eyebrow="Mode diff">
          <ModeEditor mode={props.mode} preview={props.preview} onPatch={props.onPatchMode} onDuplicate={props.onDuplicateMode} onDelete={props.onDeleteMode} />
        </Panel>
        <Panel title="快捷目录" eyebrow="Folders">
          <div className="quick-grid">
            {["models", "custom_nodes", "input", "output", "user"].map((name) => <button className="quick" key={name} onClick={() => window.launcher.filesystem.openPath(`${props.instance.comfyuiPath}\\${name}`)}><FolderOpen size={16} />{name}</button>)}
            {props.instance.pathReferences.filter((ref) => ref.enabled).slice(0, 6).map((ref) => <button className="quick" key={ref.id} onClick={() => window.launcher.paths.open(ref.path)}><ExternalLink size={16} />{ref.label}</button>)}
          </div>
          <div className="recent-output">
            {props.media.slice(0, 5).map((item) => item.type === "image" ? <img key={item.path} src={item.fileUrl} title={item.name} /> : <video key={item.path} src={item.fileUrl} muted preload="metadata" />)}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function PreflightStrip(props: { preflight: PreflightResult | null; error: string; onReleasePort(): void; onOpenLogs(): void }) {
  const checks = props.preflight?.checks || [];
  return (
    <div className="preflight-strip">
      {checks.length ? checks.map((check) => (
        <div className={`preflight-chip ${check.status}`} key={check.id} title={check.detail}>
          <CheckCircle2 size={14} />
          <span>{check.label}</span>
          <strong>{check.detail}</strong>
          {check.action === "release-port" && <button className="link-btn" onClick={props.onReleasePort}>释放端口</button>}
        </div>
      )) : <div className="preflight-chip"><Shield size={14} /><span>启动前检查</span><strong>点击启动时会校验路径、Python、端口和模式</strong></div>}
      {props.error && <div className="preflight-chip bad"><AlertTriangle size={14} /><span>启动失败</span><strong>{props.error}</strong><button className="link-btn" onClick={props.onOpenLogs}>看日志</button></div>}
    </div>
  );
}

export function RuntimeGrid({ stats, modelCount }: { stats: SystemStats; modelCount: number }) {
  return (
    <>
      <div className="runtime-grid">
        <InfoTile label="OS" value={stats.os || "未连接"} />
        <InfoTile label="Python" value={stats.python || "未连接"} />
        <InfoTile label="PyTorch" value={stats.pytorch || "未连接"} />
        <InfoTile label="模型目录" value={`${modelCount} 项`} />
      </div>
      <div className="device-list">
        {stats.devices.length ? stats.devices.map((device) => {
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
    </>
  );
}

export function ModeEditor(props: { mode: LauncherMode; preview: ModePreview; onPatch(patch: Partial<LauncherMode>): void; onDuplicate(): void; onDelete(): void }) {
  return (
    <>
      <div className="mode-bar">
        <Field label="名称"><input value={props.mode.name} onChange={(event) => props.onPatch({ name: event.target.value })} /></Field>
        <Field label="策略"><select value={props.mode.applyStrategy} onChange={(event) => props.onPatch({ applyStrategy: event.target.value as LauncherMode["applyStrategy"] })}><option value="disabled-list">禁用列表</option><option value="enabled-only">仅启用列表</option></select></Field>
        <button className="icon-btn" title="复制模式" aria-label="复制模式" onClick={props.onDuplicate}><Copy size={15} /></button>
        <button className="icon-btn danger-text" title="删除模式" aria-label="删除模式" onClick={props.onDelete}><Trash2 size={15} /></button>
      </div>
      <div className="diff-grid">
        <DiffList title="将启用" items={props.preview.enable} tone="ok" />
        <DiffList title="将禁用" items={props.preview.disable} tone="bad" />
        <DiffList title="缺失" items={props.preview.missing} tone="warn" />
      </div>
    </>
  );
}

export function LogsView(props: {
  status: RuntimeStatus;
  queue: QueueStatus;
  logs: string[];
  allLogs: string[];
  diagnostics: Array<{ type: string; line: string; hint: string }>;
  errors: number;
  warnings: number;
  filter: LogFilter;
  follow: boolean;
  logBoxRef: React.RefObject<HTMLPreElement>;
  onFilter(filter: LogFilter): void;
  onFollow(value: boolean): void;
  onOpenWeb(): void;
  onInterrupt(): void;
  onClearQueue(): void;
  onFreeMemory(): void;
  onExportLogs(): void;
  onClearLogs(): void;
}) {
  return (
    <Panel className="logs-panel" title="日志控制台" eyebrow="Runtime console" action={<div className="button-row"><button className="ghost" disabled={!props.status.url} onClick={props.onOpenWeb}><ExternalLink size={15} />打开网页</button><button className="ghost" disabled={!props.status.running} onClick={props.onInterrupt}><Pause size={15} />中断</button><button className="ghost" disabled={!props.status.running || !props.queue.pending} onClick={props.onClearQueue}><ListRestart size={15} />清队列</button><button className="ghost" disabled={!props.status.running} onClick={props.onFreeMemory}><Cpu size={15} />释放内存</button><button className={props.follow ? "ghost active-action" : "ghost"} onClick={() => props.onFollow(!props.follow)}><Bell size={15} />跟随最新</button><button className="ghost" onClick={() => navigator.clipboard.writeText(props.allLogs.join("\n"))}><Copy size={15} />复制日志</button><button className="ghost" onClick={props.onExportLogs}><ExternalLink size={15} />导出日志</button><button className="ghost danger-text" onClick={props.onClearLogs}><Trash2 size={15} />清空</button></div>}>
      <div className="log-console-meta">
        <Stat label="服务地址" value={props.status.url || "未启动"} />
        <Stat label="队列" value={`${props.queue.running}/${props.queue.pending}`} tone={props.queue.running || props.queue.pending ? "warn" : "ok"} />
        <Stat label="错误" value={`${props.errors}`} tone={props.errors ? "bad" : "ok"} />
        <Stat label="警告" value={`${props.warnings}`} tone={props.warnings ? "warn" : "ok"} />
      </div>
      <div className="log-tools">
        <div className="segmented">
          {[
            ["all", "全部", props.allLogs.length],
            ["errors", "错误", props.errors],
            ["warnings", "警告", props.warnings]
          ].map(([id, label, count]) => <button className={props.filter === id ? "active" : ""} key={id} onClick={() => props.onFilter(id as LogFilter)}>{label}<span>{count}</span></button>)}
        </div>
        <div className="diagnostic-list">
          {props.diagnostics.length ? props.diagnostics.map((item, index) => (
            <button key={`${item.type}-${index}`} onClick={() => navigator.clipboard.writeText(`${item.type}\n${item.line}\n${item.hint}`)}>
              <strong>{item.type}</strong><span title={item.line}>{item.line}</span><em>{item.hint}</em>
            </button>
          )) : <div className="empty-state compact-empty">启动后会自动提取缺包、缺节点、端口占用和显存问题。</div>}
        </div>
      </div>
      <pre className="log-box full" ref={props.logBoxRef} onScroll={() => {
        const box = props.logBoxRef.current;
        if (!box) return;
        props.onFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 32);
      }}>{props.logs.length ? props.logs.map((line, index) => <span className={/error|failed|traceback|exception|ModuleNotFoundError|ImportError|错误|失败/i.test(line) ? "log-error" : /warn|warning|警告/i.test(line) ? "log-warn" : ""} key={`${index}-${line}`}>{line}{"\n"}</span>) : "等待日志输出..."}</pre>
    </Panel>
  );
}

export function PluginsView(props: {
  plugins: PluginInfo[];
  allPlugins: PluginInfo[];
  mode: LauncherMode;
  filter: PluginFilter;
  search: string;
  repoUrl: string;
  remoteUrl: string;
  backups: DirEntry[];
  enabledCount: number;
  issueCount: number;
  requirementCount: number;
  onSearch(value: string): void;
  onFilter(value: PluginFilter): void;
  onRepoUrl(value: string): void;
  onRemoteUrl(value: string): void;
  onInstall(): void;
  onRefresh(): void;
  onToggle(plugin: PluginInfo): void;
  onUpdate(plugin: PluginInfo): void;
  onBackup(plugin: PluginInfo): void;
  onRepair(plugin: PluginInfo): void;
  onBind(plugin: PluginInfo): void;
  onInstallRequirements(plugin: PluginInfo): void;
  onModePlugin(name: string, list: "enabledPlugins" | "disabledPlugins", checked: boolean): void;
  onRestore(backupPath: string): void;
}) {
  return (
    <Panel className="plugins-panel" title="插件维护" eyebrow="Custom nodes" action={<SearchBox value={props.search} onChange={props.onSearch} placeholder="搜索插件" />}>
      <div className="plugin-dashboard">
        <MiniStat label="插件总数" value={`${props.allPlugins.length}`} />
        <MiniStat label="已启用" value={`${props.enabledCount}`} tone="ok" />
        <MiniStat label="健康问题" value={`${props.issueCount}`} tone={props.issueCount ? "warn" : "ok"} />
        <MiniStat label="可装依赖" value={`${props.requirementCount}`} />
      </div>
      <div className="segmented">
        {[
          ["all", "全部", props.allPlugins.length],
          ["issues", "有问题", props.issueCount],
          ["disabled", "已禁用", props.allPlugins.filter((p) => !p.enabled).length],
          ["requirements", "有依赖", props.requirementCount],
          ["git", "Git", props.allPlugins.filter((p) => p.isGit).length]
        ].map(([id, label, count]) => <button className={props.filter === id ? "active" : ""} key={id} onClick={() => props.onFilter(id as PluginFilter)}>{label}<span>{count}</span></button>)}
      </div>
      <div className="inline-form">
        <input placeholder="GitHub 插件仓库 URL" value={props.repoUrl} onChange={(event) => props.onRepoUrl(event.target.value)} />
        <button className="primary" onClick={props.onInstall} disabled={!props.repoUrl.trim()}><GitBranch size={15} />安装</button>
        <button className="ghost" onClick={props.onRefresh}><RefreshCw size={15} />扫描</button>
      </div>
      <div className="plugin-table">
        {props.plugins.length ? props.plugins.map((plugin) => (
          <article className="plugin-row" key={`${plugin.path}-${plugin.enabled}`}>
            <div className="plugin-main">
              <div className="plugin-identity">
                <strong>{plugin.name}</strong>
                <span>{plugin.isGit ? `${plugin.branch || "unknown"} · ${plugin.commit || "unknown"}` : "本地插件"}{plugin.hasRequirements ? " · requirements" : ""}</span>
                {plugin.remote && <em title={plugin.remote}>{plugin.remote}</em>}
              </div>
              <div className="plugin-badges">
                <span className={plugin.enabled ? "pill ok" : "pill"}>{plugin.enabled ? "启用" : "禁用"}</span>
                <span className={plugin.health?.problems?.length ? "pill warn" : "pill ok"}>{plugin.health?.problems?.length ? `${plugin.health.problems.length} 问题` : "健康"}</span>
              </div>
              <div className="plugin-mode-flags">
                <label className="check"><input type="checkbox" checked={props.mode.disabledPlugins.includes(plugin.name)} onChange={(event) => props.onModePlugin(plugin.name, "disabledPlugins", event.target.checked)} />禁用列表</label>
                <label className="check"><input type="checkbox" checked={props.mode.enabledPlugins.includes(plugin.name)} onChange={(event) => props.onModePlugin(plugin.name, "enabledPlugins", event.target.checked)} />启用列表</label>
              </div>
            </div>
            {plugin.health?.problems?.length ? <div className="plugin-problems">{plugin.health.problems.map((problem) => <span key={problem}>{problem}</span>)}</div> : null}
            <div className="plugin-actions">
              <button className="icon-btn" title="打开目录" onClick={() => window.launcher.filesystem.openPath(plugin.path)}><FolderOpen size={15} /></button>
              <button className="icon-btn" title="备份" onClick={() => props.onBackup(plugin)}><Shield size={15} /></button>
              <button className="icon-btn" title="更新" disabled={!plugin.isGit} onClick={() => props.onUpdate(plugin)}><RefreshCw size={15} /></button>
              <button className="icon-btn" title="修复 Git" disabled={!plugin.isGit} onClick={() => props.onRepair(plugin)}><Wrench size={15} /></button>
              <button className="icon-btn" title="绑定 remote" disabled={!props.remoteUrl.trim()} onClick={() => props.onBind(plugin)}><Globe size={15} /></button>
              <button className="ghost compact" disabled={!plugin.hasRequirements} onClick={() => props.onInstallRequirements(plugin)}>装依赖</button>
              <button className="ghost compact" onClick={() => props.onToggle(plugin)}>{plugin.enabled ? "禁用" : "启用"}</button>
            </div>
          </article>
        )) : <div className="empty-state">未扫描到插件，或没有符合筛选条件的插件。</div>}
      </div>
      <div className="rescue-panel">
        <div className="rescue-summary"><Shield size={18} /><span><strong>数据与恢复</strong><em>更新和恢复前会优先创建插件备份</em></span></div>
        <select defaultValue="" onChange={(event) => event.target.value && props.onRestore(event.target.value)}>
          <option value="">从插件备份恢复...</option>
          {props.backups.map((backup) => <option value={backup.path} key={backup.path}>{backup.name}</option>)}
        </select>
        <input placeholder="Git remote URL，填好后点击插件行的地球按钮绑定" value={props.remoteUrl} onChange={(event) => props.onRemoteUrl(event.target.value)} />
      </div>
    </Panel>
  );
}

export function PathsView(props: {
  instance: LauncherInstance;
  newPath: string;
  newPathKind: PathReferenceKind;
  onNewPath(value: string): void;
  onNewPathKind(value: PathReferenceKind): void;
  onAdd(): void;
  onUpdate(id: string, patch: Partial<PathReference>): void;
  onRemove(id: string): void;
  onSelectFolder(): void;
  onOpen(path: string): void;
  onSync(): void;
}) {
  return (
    <Panel title="路径引用" eyebrow="Path references" action={<button className="ghost" onClick={props.onSync}><Save size={15} />同步模型路径</button>}>
      <div className="inline-form">
        <select value={props.newPathKind} onChange={(event) => props.onNewPathKind(event.target.value as PathReferenceKind)}>{Object.entries(pathKindLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
        <input placeholder="输入要引用的文件夹路径" value={props.newPath} onChange={(event) => props.onNewPath(event.target.value)} />
        <button className="ghost" onClick={props.onSelectFolder}><FolderOpen size={15} />选择</button>
        <button className="primary" onClick={props.onAdd}><Plus size={15} />添加</button>
      </div>
      <div className="path-list">
        {props.instance.pathReferences.map((ref) => (
          <div className="path-row" key={ref.id}>
            <select value={ref.kind} onChange={(event) => props.onUpdate(ref.id, { kind: event.target.value as PathReferenceKind })}>{Object.entries(pathKindLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
            <input value={ref.label} onChange={(event) => props.onUpdate(ref.id, { label: event.target.value })} />
            <input value={ref.path} onChange={(event) => props.onUpdate(ref.id, { path: event.target.value })} />
            <label className="check"><input type="checkbox" checked={ref.enabled} onChange={(event) => props.onUpdate(ref.id, { enabled: event.target.checked })} />启用</label>
            <button className="icon-btn" onClick={() => props.onOpen(ref.path)}><FolderOpen size={15} /></button>
            <button className="icon-btn danger-text" onClick={() => props.onRemove(ref.id)}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function WorkflowView(props: {
  path: string;
  workflow: WorkflowAnalysisResult | null;
  activePluginNames: Set<string>;
  onPath(value: string): void;
  onSelect(): void;
  onAnalyze(): void;
  onApply(): void;
  onCopy(): void;
  onReview(name: string): void;
  onModels(name: string): void;
  onConsole(): void;
  busy: boolean;
}) {
  const missingSuggested = props.workflow?.suggestedPlugins.filter((name) => !props.activePluginNames.has(name)) || [];
  return (
    <Panel className="workflow-panel" title="工作流分析" eyebrow="Workflow">
      <div className="inline-form">
        <input placeholder="workflow JSON 文件路径" value={props.path} onChange={(event) => props.onPath(event.target.value)} />
        <button className="ghost" onClick={props.onSelect}><FolderOpen size={15} />选择</button>
        <button className="primary" onClick={props.onAnalyze} disabled={props.busy || !props.path.trim()}><FileJson size={15} />分析</button>
        <button className="ghost" onClick={props.onApply} disabled={!props.workflow?.matchedPlugins.length}><ListRestart size={15} />生成临时模式</button>
      </div>
      {props.workflow && (
        <div className="workflow-diagnosis">
          <div className="workflow-summary">
            <Stat label="节点类型" value={`${props.workflow.nodeTypes.length}`} />
            <Stat label="本地匹配插件" value={`${props.workflow.matchedPlugins.length}`} tone="ok" />
            <Stat label="缺失节点" value={`${props.workflow.missingNodeTypes.length}`} tone={props.workflow.missingNodeTypes.length ? "warn" : "ok"} />
            <Stat label="未确认节点" value={`${props.workflow.unverifiedNodeTypes?.length || 0}`} tone={props.workflow.unverifiedNodeTypes?.length ? "warn" : undefined} />
          </div>
          <div className="workflow-next">
            <div>
              <strong>{props.workflow.missingNodeTypes.length ? "已发现缺失插件的节点" : props.workflow.unverifiedNodeTypes?.length ? "部分节点尚未确认" : "静态插件检查完成"}</strong>
              <p>静态检查不保证可运行；未确认节点可能是内置节点。模型匹配按文件名检查，版本和兼容性需另行确认。</p>
            </div>
            <div className="button-row">
              <button className="ghost" disabled={!missingSuggested.length && !props.workflow.matchedPlugins.length} onClick={() => props.onReview(missingSuggested[0] || props.workflow?.matchedPlugins[0] || "")}><PlugZap size={15} />处理建议插件</button>
              <button className="ghost" onClick={props.onCopy}><Copy size={15} />复制诊断</button>
              <button className="primary" onClick={props.onApply} disabled={!props.workflow.matchedPlugins.length}><ListRestart size={15} />生成临时模式</button>
              <button className="ghost" onClick={props.onConsole}>进入运行中心</button>
            </div>
          </div>
          <div className="workflow-grid">
            <DiffList title="本地已匹配" items={props.workflow.matchedPlugins} tone="ok" />
            <DiffList title="建议处理插件" items={missingSuggested} tone="warn" />
            <DiffList title="缺失节点" items={props.workflow.missingNodeTypes} tone="warn" />
            <DiffList title="未确认节点" items={props.workflow.unverifiedNodeTypes || []} />
          </div>
          <section className="workflow-models" aria-label="模型引用候选">
            <h3>模型引用候选</h3>
            {!props.workflow.modelCandidates?.length && <p>未识别到模型文件名。自定义节点和动态输入可能无法通过静态检查识别。</p>}
            {props.workflow.modelCandidates?.map((model) => <div key={model.name}><span title={model.name}>{model.name}</span><small className={model.found ? "" : "model-unverified"}>{model.found ? "本地有同名文件" : "本次扫描未找到"}</small><button className="ghost tool-button" title="在模型库查找" aria-label={`查找 ${model.name}`} onClick={() => props.onModels(model.name.split(String.fromCharCode(92)).join("/").split("/").pop() || model.name)}><FolderOpen size={15} /></button></div>)}
          </section>
          <details className="workflow-node-details"><summary>全部节点（{props.workflow.nodeTypes.length}）</summary><p>{props.workflow.nodeTypes.join(" · ")}</p></details>
        </div>
      )}
    </Panel>
  );
}

export function ModelsView(props: {
  loading: boolean;
  items: ModelItem[];
  categories: Array<[string, number]>;
  search: string;
  referenceCount: number;
  onSearch(value: string): void;
  onRefresh(): void;
  onOpenModels(): void;
  onSync(): void;
}) {
  return (
    <Panel title="模型库" eyebrow="Local models" action={<SearchBox placeholder="搜索模型或类型" value={props.search} onChange={props.onSearch} />}>
      <div className="model-toolbar">
        <div className="model-summary"><Stat label="模型文件" value={`${props.items.length}`} /><Stat label="模型类型" value={`${props.categories.length}`} /><Stat label="引用目录" value={`${props.referenceCount}`} /></div>
        <div className="button-row"><button className="ghost" onClick={props.onRefresh}><RefreshCw size={15} />刷新</button><button className="ghost" onClick={props.onOpenModels}><FolderOpen size={15} />打开 models</button><button className="ghost" onClick={props.onSync}><Save size={15} />同步引用</button></div>
      </div>
      <div className="model-layout">
        <aside className="model-cats"><strong>类型分布</strong>{props.categories.length ? props.categories.map(([name, count]) => <button className="cat-row" key={name} onClick={() => props.onSearch(name)}><span>{name}</span><em>{count}</em></button>) : <div className="empty-state">未扫描到模型类型。</div>}</aside>
        <div className="model-table">
          <div className="model-row head"><span>名称</span><span>类型</span><span>大小</span><span>修改时间</span><span>操作</span></div>
          {props.items.length ? props.items.map((item) => (
            <div className="model-row" key={item.path}>
              <strong title={item.name}>{item.name}</strong><span className="pill">{item.category}</span><span>{formatFileSize(item.size)}</span><span>{new Date(item.modifiedAt).toLocaleString()}</span><button className="icon-btn" title="在文件夹中显示" onClick={() => window.launcher.models.reveal(item.path)}><FolderOpen size={15} /></button>
            </div>
          )) : <div className="empty-state" role="status">{props.loading ? "正在扫描模型目录…" : "没有匹配的模型文件。支持 safetensors、ckpt、pt、pth、gguf、onnx 等常见格式。"}</div>}
        </div>
      </div>
    </Panel>
  );
}

export function MediaView(props: {
  items: MediaItem[];
  history: HistoryItem[];
  search: string;
  outputCount: number;
  onSearch(value: string): void;
  onRefresh(): void;
  onOpenOutput(): void;
  onClearHistory(): void;
  onReveal(path: string, event?: React.MouseEvent): void;
  onDelete(item: MediaItem, event?: React.MouseEvent): void;
}) {
  return (
    <Panel title="媒体库" eyebrow="Output browser" action={<SearchBox placeholder="搜索输出文件" value={props.search} onChange={props.onSearch} />}>
      <div className="media-toolbar">
        <div className="media-stats"><Stat label="输出文件" value={`${props.items.length}`} /><Stat label="历史记录" value={`${props.history.length}`} /><Stat label="输出目录" value={`${props.outputCount}`} /></div>
        <div className="button-row"><button className="ghost" onClick={props.onRefresh}><RefreshCw size={15} />刷新</button><button className="ghost" onClick={props.onOpenOutput}><FolderOpen size={15} />打开 output</button><button className="ghost danger-text" onClick={props.onClearHistory}><Trash2 size={15} />清 history</button></div>
      </div>
      <div className="media-layout">
        <div className="media-grid">
          {props.items.length ? props.items.map((item) => (
            <article className="media-card" key={item.path}>
              <div className="media-preview">
                {item.type === "image" ? <img src={item.fileUrl} alt={item.name} /> : <video src={item.fileUrl} controls preload="metadata" />}
              </div>
              <div className="media-caption"><strong title={item.name}>{item.name}</strong><span>{new Date(item.modifiedAt).toLocaleString()} · {item.type === "image" ? "图片" : "视频"}</span></div>
              <div className="media-actions">
                <button className="icon-btn" title="在文件夹中显示" onClick={(event) => props.onReveal(item.path, event)}><FolderOpen size={15} /></button>
                <button className="icon-btn danger-text" title="删除" onClick={(event) => props.onDelete(item, event)}><Trash2 size={15} /></button>
              </div>
            </article>
          )) : <div className="empty-state">还没有扫描到输出图片或视频。</div>}
        </div>
        <aside className="history-panel"><div className="history-title"><History size={15} />最近 History</div>{props.history.length ? props.history.slice(0, 30).map((item) => <div className="history-row" key={item.id}><strong title={item.id}>{item.id}</strong><span>{item.nodeCount} 节点 · {item.outputCount} 输出</span></div>) : <div className="empty-state">ComfyUI 启动后会读取 /history。</div>}</aside>
      </div>
    </Panel>
  );
}

export function EnvironmentView(props: {
  instance: LauncherInstance;
  packages: EnvironmentPackage[];
  coreInfo: CoreVersionInfo | null;
  onRefreshPackages(): void;
  onPipList(): void;
  onRefreshCore(): void;
  onUpdateCore(): void;
  onInstallTool(tool: string): void;
}) {
  const missing = props.packages.filter((pkg) => pkg.version === "未安装").length;
  const unchecked = !props.packages.length || props.packages.some((pkg) => pkg.version === "未检测");
  return (
    <Panel className="environment-panel" title="环境维护" eyebrow="Python">
      <div className="env-layout">
        <div className="env-main">
          <div className="core-box">
            <div>
              <span>ComfyUI 内核</span>
              <strong>{props.coreInfo ? `${props.coreInfo.tag || props.coreInfo.branch || "unknown"} · ${props.coreInfo.commit || "unknown"}` : "未检测"}</strong>
              <p>{props.coreInfo?.remote || "Git remote 未读取"}</p>
              {props.coreInfo?.status && <em>有本地变更：{props.coreInfo.status.split(/\r?\n/).filter(Boolean).length} 项</em>}
            </div>
            <div className="button-row"><button className="ghost" onClick={props.onRefreshCore}><RefreshCw size={15} />检测内核</button><button className="primary" onClick={props.onUpdateCore}><GitBranch size={15} />更新内核</button></div>
          </div>
          <div className="pkg-table">
            {props.packages.map((pkg) => <div className={`pkg-row ${pkg.version === "未安装" ? "missing" : pkg.version === "未检测" ? "pending" : ""}`} key={pkg.name}><span>{pkg.name}</span><strong title={pkg.version}>{pkg.version}</strong></div>)}
          </div>
        </div>
        <div className="env-actions">
          <div className="env-summary"><strong>环境诊断</strong><span>{missing ? `${missing} 个关键包未安装` : unchecked ? "尚未完成关键包检测" : "关键包状态良好"}</span><div className="button-row"><button className="ghost" onClick={props.onRefreshPackages}><RefreshCw size={15} />检测关键包</button><button className="ghost" onClick={props.onPipList}><SquareTerminal size={15} />pip list</button></div></div>
          {environmentTools.map((tool) => <button className={`env-tool ${tool.risk === "高" ? "high-risk" : ""}`} key={tool.id} onClick={() => props.onInstallTool(tool.id)}><span><b>{tool.label}</b><em>{tool.desc}</em></span><i>{tool.risk}风险</i></button>)}
        </div>
      </div>
    </Panel>
  );
}

export function SettingsView(props: {
  instance: LauncherInstance;
  mode: LauncherMode;
  browsers: BrowserOption[];
  config: LauncherConfig;
  updateInfo: AppUpdateInfo | null;
  onPatchInstance(patch: Partial<LauncherInstance>): void;
  onPatchMode(patch: Partial<LauncherMode>): void;
  onSelectComfy(): void;
  onDuplicateInstance(): void;
  onSave(): void;
  onExport(): void;
  onImport(): void;
  onReset(): void;
  onCheckUpdate(): void;
  onOpenUpdate(): void;
}) {
  return (
    <Panel title="设置" eyebrow="Configuration">
      <div className="form-grid two">
        <Field label="环境名称"><input value={props.instance.name} onChange={(event) => props.onPatchInstance({ name: event.target.value })} /></Field>
        <Field label="模式名称"><input value={props.mode.name} onChange={(event) => props.onPatchMode({ name: event.target.value })} /></Field>
        <Field label="ComfyUI 路径"><div className="input-with-button"><input value={props.instance.comfyuiPath} onChange={(event) => props.onPatchInstance({ comfyuiPath: event.target.value })} /><button className="icon-btn" onClick={props.onSelectComfy}><FolderOpen size={15} /></button></div></Field>
        <Field label="Python 路径"><input value={props.instance.pythonPath} onChange={(event) => props.onPatchInstance({ pythonPath: event.target.value })} /></Field>
        <Field label="代理地址"><input placeholder="http://127.0.0.1:7897" value={props.instance.proxyAddress} onChange={(event) => props.onPatchInstance({ proxyAddress: event.target.value })} /></Field>
        <Field label="启动浏览器"><select value={props.instance.browserChoice} onChange={(event) => props.onPatchInstance({ browserChoice: event.target.value })}>{props.browsers.map((browser) => <option disabled={!browser.available} value={browser.id} key={browser.id}>{browser.label}{browser.available ? "" : "（未找到）"}</option>)}</select></Field>
        <Field label="自定义浏览器路径"><input value={props.instance.browserPath} onChange={(event) => props.onPatchInstance({ browserPath: event.target.value })} /></Field>
        <Field label="额外参数"><input value={props.instance.extraArgs} onChange={(event) => props.onPatchInstance({ extraArgs: event.target.value })} /></Field>
      </div>
      <div className="settings-actions">
        <button className="primary" onClick={props.onSave}><Save size={15} />保存配置</button>
        <button className="ghost" onClick={props.onDuplicateInstance}><Copy size={15} />复制环境</button>
        <button className="ghost" onClick={props.onCheckUpdate}><RefreshCw size={15} />检查更新</button>
        <button className="ghost" disabled={!props.updateInfo?.releaseUrl} onClick={props.onOpenUpdate}><ExternalLink size={15} />打开 Release</button>
        <button className="ghost" onClick={props.onExport}><ExternalLink size={15} />导出配置</button>
        <button className="ghost" onClick={props.onImport}><FolderOpen size={15} />导入配置</button>
        <button className="ghost" onClick={() => navigator.clipboard.writeText(JSON.stringify(props.config, null, 2))}><Copy size={15} />复制配置 JSON</button>
        <button className="ghost danger-text" onClick={props.onReset}><Trash2 size={15} />重置配置</button>
      </div>
      {props.updateInfo && (
        <div className={props.updateInfo.updateAvailable ? "update-note available" : "update-note"}>
          <strong>{props.updateInfo.updateAvailable ? "发现新版本" : "当前已是最新版本"}</strong>
          <span>当前 {props.updateInfo.currentVersion} · 最新 {props.updateInfo.latestVersion}</span>
          {props.updateInfo.publishedAt && <em>{new Date(props.updateInfo.publishedAt).toLocaleString()}</em>}
        </div>
      )}
    </Panel>
  );
}
