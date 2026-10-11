export interface LogDiagnostic { type: string; line: string; hint: string; }

const rules = [
  { type: "缺少 Python 包", pattern: /ModuleNotFoundError|No module named|ImportError/i, hint: "检查当前 Python 环境，并安装对应插件的 requirements。" },
  { type: "端口占用", pattern: /address already in use|Only one usage of each socket address|EADDRINUSE/i, hint: "释放端口或更换启动端口。" },
  { type: "显存不足", pattern: /out of memory|not enough memory/i, hint: "释放显存、使用 lowvram，或降低工作流显存需求。" },
  { type: "缺失插件或节点", pattern: /IMPORT FAILED|Cannot import|missing custom node|Unknown node/i, hint: "检查插件启用状态和依赖，使用工作流分析定位节点来源。" },
  { type: "错误", pattern: /traceback|exception|failed|error|错误|失败/i, hint: "查看完整 traceback，定位最后一个异常。" },
  { type: "警告", pattern: /warn|警告/i, hint: "警告不一定阻止运行，结合完整日志判断。" }
];

export function diagnoseLogs(lines: string[]): LogDiagnostic[] {
  const seen = new Set<string>();
  const found: LogDiagnostic[] = [];
  for (const line of lines) {
    const rule = rules.find((candidate) => candidate.pattern.test(line));
    if (!rule) continue;
    const key = `${rule.type}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ type: rule.type, line, hint: rule.hint });
  }
  return found.slice(-12).reverse();
}
