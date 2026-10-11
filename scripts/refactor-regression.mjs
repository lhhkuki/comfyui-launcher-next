import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createConfigWriter } = require('../dist-electron/configWriter.js');
const source = await fs.readFile('src/ui/logDiagnostics.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { diagnoseLogs } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
for (const [line, type] of [
  ['ModuleNotFoundError: No module named example', '缺少 Python 包'],
  ['RuntimeError: CUDA out of memory', '显存不足'],
  ['Error EADDRINUSE: address already in use', '端口占用'],
  ['IMPORT FAILED: example', '缺失插件或节点']
]) assert.equal(diagnoseLogs([line])[0]?.type, type);
assert.equal(diagnoseLogs(['warning: test', 'warning: test']).length, 1);

const taskSource = await fs.readFile('src/ui/taskHistory.ts', 'utf8');
const taskModule = ts.transpileModule(taskSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { restoreTasks, retainTasks } = await import(`data:text/javascript;base64,${Buffer.from(taskModule).toString('base64')}`);
assert.deepEqual(restoreTasks('{invalid'), []);
assert.deepEqual(restoreTasks('[null, {"id":1}]'), []);
const running = { id: 'one', label: '扫描', environment: '环境', startedAt: 1, state: 'running', detail: '执行中' };
assert.equal(restoreTasks(JSON.stringify([running]))[0].state, 'interrupted');
assert.equal(retainTasks([running, ...Array.from({ length: 100 }, (_, id) => ({ ...running, id: String(id), state: 'success' }))]).length, 81);
assert.equal(retainTasks([running])[0].state, 'running');

const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'station-config-test-'));
try {
  const target = path.join(folder, 'config.json');
  const write = createConfigWriter(target);
  await Promise.all(Array.from({ length: 30 }, (_, revision) => write({ revision, name: '环境' })));
  assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { revision: 29, name: '环境' });
  assert.deepEqual(await fs.readdir(folder), ['config.json']);
  await fs.mkdir(path.join(folder, 'blocked.json'));
  const retryWrite = createConfigWriter(path.join(folder, 'blocked.json'));
  await assert.rejects(retryWrite({ revision: 1 }));
  await fs.rmdir(path.join(folder, 'blocked.json'));
  await retryWrite({ revision: 2 });
  assert.equal(JSON.parse(await fs.readFile(path.join(folder, 'blocked.json'), 'utf8')).revision, 2);
} finally {
  await fs.rm(folder, { recursive: true, force: true });
}
console.log('refactor regression passed');
