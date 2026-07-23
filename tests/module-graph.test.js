import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'app.js');
const graph = new Map();

function collect(file) {
  if (graph.has(file)) return;
  const source = readFileSync(file, 'utf8');
  const imports = Array.from(source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))
    .map((match) => resolve(dirname(file), match[1]));
  imports.forEach((dependency) => assert.equal(existsSync(dependency), true, `Missing module: ${dependency}`));
  graph.set(file, imports);
  imports.forEach(collect);
}

function assertAcyclic(file, visiting = new Set(), visited = new Set()) {
  if (visited.has(file)) return;
  assert.equal(visiting.has(file), false, `Circular module dependency at ${file}`);
  visiting.add(file);
  for (const dependency of graph.get(file) || []) assertAcyclic(dependency, visiting, visited);
  visiting.delete(file);
  visited.add(file);
}

test('every application import resolves and the module graph has no cycles', () => {
  collect(entry);
  assertAcyclic(entry);
  assert.ok(graph.size >= 10, 'Expected the application to be split across modules');
});

test('the offline shell explicitly caches every application module', () => {
  collect(entry);
  const serviceWorker = readFileSync(resolve(root, 'sw.js'), 'utf8');
  for (const file of graph.keys()) {
    const cachePath = `./${relative(root, file).replaceAll('\\', '/')}`;
    assert.match(serviceWorker, new RegExp(`['"]${cachePath.replaceAll('.', '\\.')}['"]`));
  }
});

test('runtime requests only read from the current versioned shell cache', () => {
  const serviceWorker = readFileSync(resolve(root, 'sw.js'), 'utf8');
  assert.match(serviceWorker, /caches\.open\(CACHE_NAME\)[\s\S]*cache\.match\(event\.request\)/);
  assert.doesNotMatch(serviceWorker, /caches\.match\(event\.request\)/);
});
