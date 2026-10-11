export type TaskState = "running" | "success" | "failed" | "interrupted";

export interface TaskRecord {
  id: string;
  label: string;
  environment: string;
  startedAt: number;
  finishedAt?: number;
  state: TaskState;
  detail: string;
}

export const TASK_HISTORY_KEY = "comfy-station.tasks.v1";

export function restoreTasks(value: string | null): TaskRecord[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is TaskRecord =>
      !!row && typeof row.id === "string" && typeof row.label === "string" &&
      typeof row.environment === "string" && Number.isFinite(row.startedAt) &&
      typeof row.detail === "string" && ["running", "success", "failed", "interrupted"].includes(row.state)
    ).slice(0, 80).map((row) => row.state === "running"
      ? { ...row, state: "interrupted", detail: "上次会话结束，任务结果未确认。请检查实际状态后再操作。" }
      : row);
  } catch {
    return [];
  }
}

export function readTasks(): TaskRecord[] {
  try { return restoreTasks(localStorage.getItem(TASK_HISTORY_KEY)); }
  catch { return []; }
}

export function retainTasks(rows: TaskRecord[]): TaskRecord[] {
  return [...rows.filter((row) => row.state === "running"), ...rows.filter((row) => row.state !== "running").slice(0, 80)];
}
