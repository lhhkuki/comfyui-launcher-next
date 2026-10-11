import { useEffect, useRef } from "react";
import { CheckCircle2, CircleAlert, Clock, LoaderCircle, SquareTerminal, Trash2, X } from "lucide-react";
import type { TaskRecord } from "./taskHistory";

const states = { running: "执行中", success: "已完成", failed: "失败", interrupted: "结果未确认" };

export function TaskCenter({ tasks, onClose, onClear, onLogs }: {
  tasks: TaskRecord[]; onClose(): void; onClear(): void; onLogs(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="task-center" onCancel={onClose} aria-labelledby="task-title">
    <header><div><h2 id="task-title">任务中心</h2><span>{tasks.filter((row) => row.state === "running").length} 个任务执行中</span></div>
      <div className="button-row">
        <button className="ghost tool-button" title="清除已结束的任务记录" aria-label="清除已结束的任务记录" onClick={onClear}><Trash2 size={16} /></button>
        <button className="ghost tool-button" title="日志控制台" aria-label="日志控制台" onClick={onLogs}><SquareTerminal size={16} /></button>
        <button className="ghost tool-button" title="关闭" aria-label="关闭任务中心" onClick={onClose}><X size={16} /></button>
      </div>
    </header>
    <div className="task-list">
      {!tasks.length && <p className="task-empty">暂无任务记录</p>}
      {tasks.map((task) => <article className={`task-row ${task.state}`} key={task.id}>
        {task.state === "running" ? <LoaderCircle className="task-spinner" size={18} /> : task.state === "success" ? <CheckCircle2 size={18} /> : task.state === "failed" ? <CircleAlert size={18} /> : <Clock size={18} />}
        <div><div className="task-heading"><strong>{task.label}</strong><span>{states[task.state]}</span></div>
          <small>{task.environment} · {new Date(task.startedAt).toLocaleString()}</small>
          <p>{task.detail}</p>
          {task.finishedAt && <small>耗时 {Math.max(1, Math.round((task.finishedAt - task.startedAt) / 1000))} 秒</small>}
        </div>
      </article>)}
    </div>
  </dialog>;
}
