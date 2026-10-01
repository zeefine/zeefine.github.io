import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArchiveBookshelf } from '../src/scripts/archive-bookshelf.ts';
import { matchesSearch } from '../src/scripts/archive-search.ts';

function setup() {
  const root = new EventTarget();
  root.dataset = {};
  const updates = [];
  root.addEventListener('archive:change', () => updates.push({ ...root.dataset }));
  return { root, updates, shelf: createArchiveBookshelf(root) };
}

test('equivalent searches do not reset or notify an already active shelf', () => {
  const { root, updates, shelf } = setup();
  const articles = [{ id: 'ai', text: 'AI 工作流' }, { id: 'notes', text: '日常记录' }];
  const search = (query) => {
    const ids = new Set(articles.filter((article) => matchesSearch(article.text, query)).map((article) => article.id));
    shelf.setItems(ids);
    shelf.setActive(ids.size > 0);
  };
  search('AI');
  const initial = { ...root.dataset };
  const notifications = updates.length;
  for (const query of ['ai', ' AI ', 'ａｉ']) search(query);
  assert.deepEqual(root.dataset, initial);
  assert.equal(updates.length, notifications);
});

test('ID membership determines changes, independent of insertion order', () => {
  const { root, updates, shelf } = setup();
  shelf.setItems(new Set(['a', 'b']));
  const initial = { ...root.dataset };
  shelf.setItems(new Set(['b', 'a']));
  assert.deepEqual(root.dataset, initial);
  assert.equal(updates.length, 1);
  shelf.setItems(new Set(['a', 'c']));
  assert.deepEqual(JSON.parse(root.dataset.ids), ['a', 'c']);
  assert.notEqual(root.dataset.revision, initial.revision);
  assert.equal(updates.length, 2);
});

test('publishes initial empty results and snapshots mutable input sets', () => {
  const { root, updates, shelf } = setup();
  const ids = new Set();
  shelf.setItems(ids);
  assert.equal(root.dataset.ids, '[]');
  shelf.setItems(new Set());
  assert.equal(updates.length, 1);
  ids.add('a');
  shelf.setItems(ids);
  assert.equal(root.dataset.ids, '["a"]');
  ids.clear();
  shelf.setItems(ids);
  assert.equal(root.dataset.ids, '[]');
  assert.equal(updates.length, 3);
});

test('view changes notify once without changing the results revision', () => {
  const { root, updates, shelf } = setup();
  shelf.setItems(new Set(['a']));
  const revision = root.dataset.revision;
  shelf.setActive(true);
  shelf.setActive(true);
  shelf.setActive(false);
  shelf.setActive(false);
  shelf.setActive(true);
  assert.deepEqual(updates.slice(1).map((update) => update.active), ['true', 'false', 'true']);
  assert.equal(root.dataset.revision, revision);
});
