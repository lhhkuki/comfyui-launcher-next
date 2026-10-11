import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  HardDrive,
  ListRestart,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  X
} from "lucide-react";
import type { LauncherConfig, LauncherInstance, LauncherMode, RuntimeStatus } from "../types";
import { Field, Panel, SectionTitle } from "./components";
import { cleanText, compactPath, tools } from "./appModel";
import type { LaunchPhase, ToolView } from "./appModel";

export interface SetupCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export function WindowControls() {
  return (
    <div className="window-controls" aria-label="窗口控制">
      <button title="最小化" aria-label="最小化" onClick={() => window.launcher.window.minimize()}><Minus size={15} /></button>
      <button title="最大化/还原" aria-label="最大化或还原" onClick={() => window.launcher.window.toggleMaximize()}><Maximize2 size={14} /></button>
      <button title="关闭" aria-label="关闭窗口" className="close" onClick={() => window.launcher.window.close()}><X size={16} /></button>
    </div>
  );
}

export function Sidebar(props: {
  config: LauncherConfig;
  activeInstance: LauncherInstance;
  activeMode: LauncherMode;
  view: ToolView;
  onAddInstance(): void;
  onDeleteInstance(id: string): void;
  onAddMode(): void;
  onDeleteMode(id: string): void;
  onSelectInstance(id: string): void;
  onSelectMode(id: string): void;
  onView(view: ToolView): void;
}) {
  return (
    <aside className="rail">
      <div className="brand"><strong>Comfy Station</strong><span>Launcher Next</span></div>
      <SectionTitle label="环境" action={<button className="mini-btn" title="新增环境" onClick={props.onAddInstance}><Plus size={14} /></button>} />
      <div className="stack">
        {props.config.instances.map((item) => (
          <div className={item.id === props.activeInstance.id ? "side-row active" : "side-row"} key={item.id}>
            <button className="side-item" onClick={() => props.onSelectInstance(item.id)}><HardDrive size={15} /><span>{cleanText(item.name, "ComfyUI 环境")}</span></button>
            <button className="side-delete" title="删除环境" onClick={() => props.onDeleteInstance(item.id)}><X size={13} /></button>
          </div>
        ))}
      </div>
      <SectionTitle label="模式" action={<button className="mini-btn" title="新增模式" onClick={props.onAddMode}><Plus size={14} /></button>} />
      <div className="stack modes">
        {props.config.modes.map((item) => (
          <div className={item.id === props.activeMode.id ? "side-row active" : "side-row"} key={item.id}>
            <button className="side-item" onClick={() => props.onSelectMode(item.id)}><ListRestart size={15} /><span>{cleanText(item.name, "默认模式")}</span></button>
            <button className="side-delete" title="删除模式" onClick={() => props.onDeleteMode(item.id)}><X size={13} /></button>
          </div>
        ))}
      </div>
      <SectionTitle label="工具" />
      <nav className="tool-nav">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return <button className={props.view === tool.id ? "tool active" : "tool"} key={tool.id} onClick={() => props.onView(tool.id)}><Icon size={16} /><span>{tool.label}</span><ChevronRight size={14} /></button>;
        })}
      </nav>
    </aside>
  );
}

export function TopBar(props: {
  instance: LauncherInstance;
  status: RuntimeStatus;
  phase: LaunchPhase;
  busy: boolean;
  onOpenFolder(): void;
  onSave(): void;
  onOpenWeb(): void;
  onRestart(): void;
  onStart(): void;
  onStop(): void;
}) {
  return (
    <header className="top-strip">
      <div className="top-copy">
        <p className="eyebrow">Local ComfyUI Workstation</p>
        <h1>{props.instance.name}</h1>
        <span>{compactPath(props.instance.comfyuiPath)}</span>
      </div>
      <div className={props.status.running ? "top-state running" : "top-state"}>
        <span>{props.status.running ? "运行中" : "未启动"}</span>
        <strong>{props.status.url || `:${props.instance.port || "8188"}`}</strong>
      </div>
      <div className="top-actions">
        <button className="ghost tool-button" title="打开目录" onClick={props.onOpenFolder} disabled={!props.instance.comfyuiPath}><FolderOpen size={16} /></button>
        <button className="ghost tool-button" title="保存配置" onClick={props.onSave}><Save size={16} /></button>
        <button className="ghost tool-button" title="打开网页" disabled={!props.status.url} onClick={props.onOpenWeb}><ExternalLink size={16} /></button>
        <button className="ghost tool-button" title="重启 ComfyUI" onClick={props.onRestart} disabled={props.busy}><RefreshCw size={16} /></button>
        <button className={props.status.running ? "danger top-launch" : "primary top-launch"} onClick={props.status.running ? props.onStop : props.onStart} disabled={props.busy}>
          {props.status.running ? <Pause size={16} /> : <Play size={16} />}
          {props.status.running ? "停止" : props.phase === "starting" ? "启动中" : "启动"}
        </button>
      </div>
    </header>
  );
}

export function Onboarding(props: { instance: LauncherInstance; checks: SetupCheck[]; onSelectFolder(): void; onPatch(patch: Partial<LauncherInstance>): void; onSave(): void }) {
  return (
    <Panel className="onboarding-panel" title="配置 ComfyUI 路径" eyebrow="First run">
      <div className="onboarding">
        <div>
          <h2>先绑定一个本地 ComfyUI</h2>
          <p>本软件是独立管理器，只读取你指定的 ComfyUI 目录。不会修改外部启动器配置，也不会自动安装依赖。</p>
          <div className="onboarding-actions">
            <button className="primary" onClick={props.onSelectFolder}><FolderOpen size={16} />选择 ComfyUI 根目录</button>
            <button className="ghost" onClick={props.onSave}><Save size={16} />保存配置</button>
          </div>
          <div className="setup-checks">
            {props.checks.map((check) => (
              <div className={check.ok ? "setup-check ok" : "setup-check bad"} key={check.id}>
                {check.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{check.label}</span>
                <em>{check.detail}</em>
              </div>
            ))}
          </div>
        </div>
        <div className="setup-card">
          <Field label="环境名称"><input value={props.instance.name} onChange={(event) => props.onPatch({ name: event.target.value })} /></Field>
          <Field label="ComfyUI 路径"><input value={props.instance.comfyuiPath} onChange={(event) => props.onPatch({ comfyuiPath: event.target.value })} /></Field>
          <Field label="Python 路径"><input value={props.instance.pythonPath} onChange={(event) => props.onPatch({ pythonPath: event.target.value })} /></Field>
          <Field label="端口"><input value={props.instance.port} onChange={(event) => props.onPatch({ port: event.target.value })} /></Field>
        </div>
      </div>
    </Panel>
  );
}
