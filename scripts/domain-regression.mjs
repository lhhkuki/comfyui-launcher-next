import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  analyzeWorkflow,
  buildArgs,
  deleteMedia,
  listMedia,
  listModels,
  previewMode,
  scanPlugins,
  syncModelPathConfig,
  togglePlugin
} from "../dist-electron/domain.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function touch(file, content = "") {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "comfy-station-domain-"));
try {
  const comfy = path.join(root, "ComfyUI");
  const externalModels = path.join(root, "external-models");
  const externalOutput = path.join(root, "external-output");
  await touch(path.join(comfy, "main.py"), "print('fixture')\n");
  await touch(path.join(comfy, "custom_nodes", "Keep", "__init__.py"));
  await touch(path.join(comfy, "custom_nodes", "DisableMe", "__init__.py"));
  await touch(path.join(comfy, "custom_nodes", ".disabled", "DisabledOne", "__init__.py"));
  await touch(path.join(comfy, "custom_nodes", "ComfyUI-Manager", "extension-node-map.json"), JSON.stringify({
    KnownNode: { extension: "Keep" }
  }));
  await touch(path.join(comfy, "output", "image.png"), "png");
  await touch(path.join(comfy, "output", "nested", "clip.mp4"), "mp4");
  await touch(path.join(comfy, "output", "ignore.txt"), "txt");
  await touch(path.join(externalOutput, "external.webp"), "webp");
  await touch(path.join(comfy, "models", "checkpoints", "base.safetensors"), "model");
  await touch(path.join(externalModels, "loras", "style.safetensors"), "model");

  const instance = {
    id: "inst",
    name: "Test",
    comfyuiPath: comfy,
    pythonPath: process.execPath,
    port: "8188",
    gpu: "0",
    proxyEnabled: true,
    proxyAddress: "http://127.0.0.1:7897",
    hfMirrorEnabled: true,
    vramMode: "默认",
    disableXformers: true,
    disableMetadata: true,
    enableManager: true,
    extraArgs: "--listen 127.0.0.1",
    browserPath: "",
    browserChoice: "default",
    minimizeToTray: false,
    notifyOnComplete: false,
    pathReferences: [
      { id: "models", kind: "models", label: "models", path: externalModels, enabled: true },
      { id: "output", kind: "outputs", label: "output", path: externalOutput, enabled: true }
    ],
    advancedArgs: {}
  };

  const args = buildArgs(instance);
  assert(args.includes("--port") && args.includes("8188"), "buildArgs should include port");
  assert(args.includes("--cuda-device") && args.includes("0"), "buildArgs should include GPU");
  assert(!args.includes("--默认"), "buildArgs must not emit the default VRAM flag");

  const configPath = await syncModelPathConfig(instance);
  const configText = await fs.readFile(configPath, "utf8");
  assert(configText.includes(externalModels.replace(/\\/g, "/")), "model path config should include external model path");

  const before = await scanPlugins(instance);
  assert(before.some((plugin) => plugin.name === "DisableMe" && plugin.enabled), "enabled plugin should be scanned");
  assert(before.some((plugin) => plugin.name === "DisabledOne" && !plugin.enabled), "disabled plugin should be scanned");

  const mode = { id: "mode", name: "mode", enabledPlugins: [], disabledPlugins: ["DisableMe"], applyStrategy: "disabled-list", overrides: {} };
  const preview = await previewMode(instance, mode);
  assert(preview.disable.includes("DisableMe"), "mode preview should disable listed plugin");
  assert(preview.enable.includes("DisabledOne"), "mode preview should re-enable plugins not in disabled list");
  await togglePlugin(instance, "DisableMe", false);
  await togglePlugin(instance, "DisabledOne", true);
  const after = await scanPlugins(instance);
  assert(after.some((plugin) => plugin.name === "DisableMe" && !plugin.enabled), "togglePlugin should move plugin to .disabled");
  assert(after.some((plugin) => plugin.name === "DisabledOne" && plugin.enabled), "togglePlugin should restore disabled plugin");

  const media = await listMedia(instance);
  assert(media.some((item) => item.name === "image.png" && item.type === "image"), "listMedia should include images");
  assert(media.some((item) => item.name === "clip.mp4" && item.type === "video"), "listMedia should include videos");
  assert(media.some((item) => item.name === "external.webp"), "listMedia should include output path references");
  const deleted = await deleteMedia(path.join(comfy, "output", "image.png"));
  assert(deleted, "deleteMedia should delete existing output file");
  assert(!(await fileExists(path.join(comfy, "output", "image.png"))), "deleted media file should be gone");

  const models = await listModels(instance);
  assert(models.some((item) => item.name === "base.safetensors" && item.category === "checkpoints"), "listModels should scan base model directories");
  assert(models.some((item) => item.name === "style.safetensors" && item.category === "loras"), "listModels should scan referenced model directories");

  const workflowPath = path.join(root, "workflow.json");
  await touch(workflowPath, JSON.stringify({
    1: { class_type: "KnownNode", inputs: { ckpt_name: "base.safetensors", lora_name: "style.safetensors", other: "missing.gguf" } },
    2: { class_type: "MissingNode", inputs: {} }
  }));
  const workflow = await analyzeWorkflow(instance, workflowPath);
  assert(workflow.matchedPlugins.includes("Keep"), "workflow analysis should match local mapping to installed plugin");
  assert(workflow.unverifiedNodeTypes.includes("MissingNode"), "unmapped nodes must be unverified rather than confirmed missing");
  assert(!workflow.missingNodeTypes.includes("MissingNode"), "unknown built-in nodes must not be reported as missing");
  assert(workflow.modelCandidates.some((item) => item.name === "base.safetensors" && item.found), "local model candidate should match");
  assert(workflow.modelCandidates.some((item) => item.name === "style.safetensors" && item.found), "referenced model candidate should match");
  assert(workflow.modelCandidates.some((item) => item.name === "missing.gguf" && !item.found), "missing model candidate should be flagged");

  console.log("domain regression passed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
