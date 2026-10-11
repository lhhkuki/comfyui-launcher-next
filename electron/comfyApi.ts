import type { HistoryItem, LauncherInstance, QueueStatus, SystemStats } from "./types";

export function instanceUrl(instance: LauncherInstance) {
  return `http://127.0.0.1:${instance.port || "8188"}`;
}

export async function fetchJson(url: string, timeoutMs = 1800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function postComfy(instance: LauncherInstance, endpoint: string, body: Record<string, unknown>, timeoutMs = 2200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${instanceUrl(instance)}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return "ok";
  } finally {
    clearTimeout(timer);
  }
}

export async function queueStatus(instance: LauncherInstance): Promise<QueueStatus> {
  try {
    const json: any = await fetchJson(`${instanceUrl(instance)}/queue`);
    return {
      running: Array.isArray(json.queue_running) ? json.queue_running.length : 0,
      pending: Array.isArray(json.queue_pending) ? json.queue_pending.length : 0
    };
  } catch {
    return { running: 0, pending: 0 };
  }
}

export async function systemStats(instance: LauncherInstance): Promise<SystemStats> {
  try {
    const json: any = await fetchJson(`${instanceUrl(instance)}/system_stats`);
    return {
      os: json.system?.os || "",
      python: json.system?.python_version || "",
      pytorch: json.system?.pytorch_version || "",
      devices: (json.devices || []).map((device: any) => ({
        name: device.name || "Unknown device",
        type: device.type || "",
        vramTotal: Number(device.vram_total || 0),
        vramFree: Number(device.vram_free || 0),
        torchVramTotal: Number(device.torch_vram_total || 0),
        torchVramFree: Number(device.torch_vram_free || 0)
      }))
    };
  } catch {
    return { os: "", python: "", pytorch: "", devices: [] };
  }
}

export async function comfyHistory(instance: LauncherInstance): Promise<HistoryItem[]> {
  try {
    const json: any = await fetchJson(`${instanceUrl(instance)}/history`);
    return Object.entries<any>(json)
      .slice(-80)
      .reverse()
      .map(([idValue, item]) => {
        const outputs = item?.outputs && typeof item.outputs === "object" ? Object.values<any>(item.outputs) : [];
        const outputCount = outputs.reduce((count, output) => {
          const images = Array.isArray(output?.images) ? output.images.length : 0;
          const videos = Array.isArray(output?.videos) ? output.videos.length : 0;
          return count + images + videos;
        }, 0);
        const prompt = Array.isArray(item?.prompt) ? item.prompt[2] : null;
        const nodeCount = prompt && typeof prompt === "object" ? Object.keys(prompt).length : 0;
        return { id: idValue, outputCount, nodeCount };
      });
  } catch {
    return [];
  }
}
