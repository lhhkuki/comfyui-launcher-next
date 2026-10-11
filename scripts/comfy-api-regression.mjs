import http from "node:http";
import {
  comfyHistory,
  postComfy,
  queueStatus,
  systemStats
} from "../dist-electron/comfyApi.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const posts = [];
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/system_stats") {
    return json(response, {
      system: { os: "Windows", python_version: "3.12.0", pytorch_version: "2.9.0+cu128" },
      devices: [{ name: "RTX", type: "cuda", vram_total: 1024, vram_free: 256, torch_vram_total: 512, torch_vram_free: 128 }]
    });
  }
  if (request.method === "GET" && url.pathname === "/queue") {
    return json(response, { queue_running: [{ id: 1 }], queue_pending: [{ id: 2 }, { id: 3 }] });
  }
  if (request.method === "GET" && url.pathname === "/history") {
    return json(response, {
      a: { prompt: [null, null, { "1": {}, "2": {} }], outputs: { "1": { images: [{}] } } },
      b: { prompt: [null, null, { "3": {} }], outputs: { "2": { videos: [{}, {}] } } }
    });
  }
  if (request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    posts.push({ path: url.pathname, body: JSON.parse(body || "{}") });
    return json(response, { ok: true });
  }
  response.statusCode = 404;
  response.end();
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const port = server.address().port;
  const instance = { port: String(port) };

  const stats = await systemStats(instance);
  assert(stats.os === "Windows", "systemStats should parse OS");
  assert(stats.python === "3.12.0", "systemStats should parse Python version");
  assert(stats.devices[0].vramTotal === 1024 && stats.devices[0].vramFree === 256, "systemStats should parse device VRAM");

  const queue = await queueStatus(instance);
  assert(queue.running === 1 && queue.pending === 2, "queueStatus should count running and pending queues");

  const history = await comfyHistory(instance);
  assert(history.length === 2, "comfyHistory should parse history rows");
  assert(history[0].id === "b" && history[0].outputCount === 2 && history[0].nodeCount === 1, "comfyHistory should reverse latest items and count videos");
  assert(history[1].id === "a" && history[1].outputCount === 1 && history[1].nodeCount === 2, "comfyHistory should count images and prompt nodes");

  await postComfy(instance, "/interrupt", {});
  await postComfy(instance, "/queue", { clear: true });
  await postComfy(instance, "/free", { unload_models: true, free_memory: true });
  await postComfy(instance, "/history", { clear: true });
  assert(posts.some((post) => post.path === "/interrupt"), "postComfy should call interrupt endpoint");
  assert(posts.some((post) => post.path === "/queue" && post.body.clear), "postComfy should call clear queue endpoint");
  assert(posts.some((post) => post.path === "/free" && post.body.free_memory), "postComfy should call free memory endpoint");
  assert(posts.some((post) => post.path === "/history" && post.body.clear), "postComfy should call clear history endpoint");

  console.log("comfy api regression passed");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function json(response, body) {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}
