import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForFile(target, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      return JSON.parse(await fs.readFile(target, "utf8"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${target}`);
}

async function waitForPng(target, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const buffer = await fs.readFile(target);
      if (buffer.length > 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return buffer;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for valid PNG ${target}`);
}

async function removeWithRetry(target, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (index === attempts - 1) {
        console.warn(`warning: could not remove temporary userData ${target}: ${error.message}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  assert(signature === "89504e470d0a1a0a", "screenshot should be a PNG file");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function configuredConfig(activeView, root = process.cwd()) {
  const instance = {
    id: "inst_smoke",
    name: "Smoke ComfyUI",
    comfyuiPath: root,
    pythonPath: process.execPath,
    port: "8188",
    gpu: "",
    proxyEnabled: false,
    proxyAddress: "",
    hfMirrorEnabled: false,
    vramMode: "默认",
    disableXformers: false,
    disableMetadata: false,
    enableManager: false,
    extraArgs: "",
    browserPath: "",
    browserChoice: "default",
    minimizeToTray: false,
    notifyOnComplete: false,
    pathReferences: [],
    advancedArgs: {}
  };
  const mode = {
    id: "mode_smoke",
    name: "Smoke Mode",
    enabledPlugins: [],
    disabledPlugins: [],
    applyStrategy: "disabled-list",
    overrides: {}
  };
  return {
    currentInstanceId: instance.id,
    currentModeId: mode.id,
    instances: [instance],
    modes: [mode],
    ui: { activeView }
  };
}

const electronCmd = process.env.COMFY_STATION_SMOKE_EXECUTABLE || (process.platform === "win32"
  ? path.join(process.cwd(), "node_modules", "electron", "dist", "electron.exe")
  : path.join(process.cwd(), "node_modules", ".bin", "electron"));

async function runSmoke({ name, config, expectedText, expectedTexts = [], expectFresh, width = 1500, height = 860, scenario = "", workflowFile = "" }) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), `comfy-station-${name}-`));
  if (config) {
    await fs.writeFile(path.join(userData, "launcher-next.config.json"), JSON.stringify(config, null, 2), "utf8");
  }

  const child = spawn(electronCmd, process.env.COMFY_STATION_SMOKE_EXECUTABLE ? [] : ["."], {
    cwd: process.cwd(),
    shell: false,
    env: {
      ...process.env,
      COMFY_STATION_USER_DATA: userData,
      COMFY_STATION_SMOKE: "1",
      COMFY_STATION_SMOKE_WIDTH: String(width),
      COMFY_STATION_SMOKE_HEIGHT: String(height),
      COMFY_STATION_SMOKE_EXIT: "1",
      COMFY_STATION_SMOKE_SCENARIO: scenario,
      COMFY_STATION_SMOKE_WORKFLOW: workflowFile
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let exited = false;
  child.stdout.on("data", (chunk) => (stdout += String(chunk)));
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  const exitPromise = new Promise((resolve) => child.on("exit", resolve));
  child.on("exit", () => {
    exited = true;
  });

  try {
    const report = await waitForFile(path.join(userData, "smoke-report.json"));
    const screenshot = await waitForPng(report.screenshotPath);
    const size = pngSize(screenshot);
    const code = await exitPromise;

    assert(code === 0, `${name}: Electron exited with code ${code}\n${stdout}\n${stderr}`);
    assert(report.loaded, `${name}: window should finish loading`);
    assert(report.configExists, `${name}: config should exist`);
    assert(report.instances === 1, `${name}: config should contain one instance`);
    assert(report.modes === 1, `${name}: config should contain one mode`);
    assert(!/TE 启动器|旧实例|launcher_config|path_configs/i.test(JSON.stringify(report)), `${name}: config must not contain old launcher markers`);
    assert(report.bounds?.width === width && report.bounds?.height === height, `${name}: window should open at the requested size`);
    assert(!report.layout?.horizontalOverflow, `${name}: page must not overflow horizontally`);
    assert(!report.layout?.pluginOverflow, `${name}: plugin actions must stay inside their row`);
    if (config?.ui.activeView === 'models') {
      assert(report.layout.models.x > report.layout.categories.x, `${name}: model table must stay beside categories`);
      assert(report.layout.models.right <= width, `${name}: model table must stay in the window`);
    }
    if (config?.ui.activeView === 'environment' && width >= 1280) {
      assert(report.layout.actions.x > report.layout.environment.x, `${name}: environment actions must stay on the right`);
    }
    assert(report.screenshotBytes === screenshot.length, `${name}: screenshot byte count should match the report`);
    assert(screenshot.length > 20000, `${name}: screenshot should contain rendered UI pixels`);
    assert(size.width === width && size.height === height, `${name}: screenshot should cover the full application window`);
    if (expectFresh) {
      assert(report.firstInstancePath === "", `${name}: fresh instance should not depend on existing external launcher paths`);
    }
    for (const text of [expectedText, ...expectedTexts].filter(Boolean)) {
      assert(String(report.bodyText || "").includes(text), `${name}: page text should include ${text}`);
    }
    return report;
  } finally {
    if (!exited && !child.killed) child.kill();
    if (process.env.COMFY_STATION_SMOKE_KEEP === "1") {
      console.log(`${name} smoke artifacts: ${userData}`);
    } else {
      await removeWithRetry(userData);
    }
  }
}

await runSmoke({ name: "fresh", expectFresh: true, expectedText: "配置 ComfyUI 路径", expectedTexts: ["main.py", "Python", "未选择"] });
await runSmoke({ name: "models", config: configuredConfig("models"), expectedText: "模型库" });
await runSmoke({ name: "environment", config: configuredConfig("environment"), expectedText: "环境维护", expectedTexts: ["未检测"] });
await runSmoke({ name: "settings", config: configuredConfig("settings"), expectedText: "设置", expectedTexts: ["检查更新", "打开 Release"] });

console.log("electron smoke passed");

if (process.env.COMFY_STATION_LAYOUT_MATRIX === '1') {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'station-layout-fixture-'));
  try {
    for (const dir of ['models/checkpoints', 'models/loras', 'custom_nodes/sample', 'custom_nodes/.disabled/sample', 'input', 'output', 'user']) {
      await fs.mkdir(path.join(fixture, dir), { recursive: true });
    }
    for (const file of ['main.py', 'models/checkpoints/example-model.safetensors', 'models/loras/example-lora.safetensors', 'custom_nodes/sample/requirements.txt']) {
      await fs.writeFile(path.join(fixture, file), 'test fixture');
    }
    const workflowFile = path.join(fixture, 'workflow.json');
    await fs.writeFile(workflowFile, JSON.stringify({ 1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'example-model.safetensors' } }, 2: { class_type: 'LoraLoader', inputs: { lora_name: 'missing-lora.safetensors' } } }));
    for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
      for (const view of ['console', 'models', 'plugins', 'environment']) {
        await runSmoke({ name: `${view}-${width}`, config: configuredConfig(view, fixture), width, height });
      }
      await runSmoke({ name: `workflow-${width}`, config: configuredConfig('workflow', fixture), width, height, workflowFile, expectedTexts: ['未确认节点', '本地有同名文件', '本次扫描未找到'] });
      await runSmoke({ name: `tasks-${width}`, config: configuredConfig('console', fixture), width, height, scenario: 'tasks', expectedTexts: ['已完成', '保存配置完成'] });
    }
    console.log('layout matrix passed');
  } finally {
    await fs.rm(fixture, { recursive: true, force: true });
  }
}
