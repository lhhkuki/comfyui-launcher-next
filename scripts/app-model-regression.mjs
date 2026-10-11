import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sourcePath = path.join(process.cwd(), "src", "ui", "appModel.ts");
const source = await fs.readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX
  }
}).outputText;

const tempPath = path.join(process.cwd(), "scripts", ".tmp-appModel.mjs");
await fs.writeFile(tempPath, transpiled, "utf8");

try {
  const model = await import(pathToFileURL(tempPath).href);
  const config = model.defaultConfig();
  const secondInstance = model.blankInstance({ name: "Second" });
  const secondMode = model.blankMode("Second mode");
  const expanded = model.normalizeConfig({
    ...config,
    instances: [...config.instances, secondInstance],
    modes: [...config.modes, secondMode]
  });

  const selectedInstance = model.selectConfigInstance(expanded, secondInstance.id);
  assert(selectedInstance.currentInstanceId === secondInstance.id, "selectConfigInstance should keep a valid selected instance");

  const selectedMode = model.selectConfigMode(expanded, secondMode.id);
  assert(selectedMode.currentModeId === secondMode.id, "selectConfigMode should keep a valid selected mode");

  const fallbackInstance = model.selectConfigInstance(expanded, "missing-instance");
  assert(fallbackInstance.currentInstanceId === expanded.instances[0].id, "selectConfigInstance should fall back for missing ids");

  const fallbackMode = model.selectConfigMode(expanded, "missing-mode");
  assert(fallbackMode.currentModeId === expanded.modes[0].id, "selectConfigMode should fall back for missing ids");

  const candidates = model.pythonPathCandidates("D:\\ComfyUI_windows_portable\\ComfyUI\\");
  assert(candidates[0] === "D:\\ComfyUI_windows_portable\\ComfyUI\\python_embeded\\python.exe", "portable python should be the first candidate");
  assert(candidates.includes("D:\\ComfyUI_windows_portable\\ComfyUI\\.venv\\Scripts\\python.exe"), "venv candidate should be included");
  assert(model.guessPythonPath("D:\\ComfyUI_windows_portable\\ComfyUI\\") === candidates[0], "guessPythonPath should use the first candidate");

  console.log("app model regression passed");
} finally {
  await fs.rm(tempPath, { force: true });
}
