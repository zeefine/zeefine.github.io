import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../src/scripts/archive-search.ts';

test('empty and whitespace queries include every article', () => {
  assert.equal(matchesSearch('从这里开始', ''), true);
  assert.equal(matchesSearch('从这里开始', '  　 '), true);
});

test('matches Chinese titles and descriptions', () => {
  assert.equal(matchesSearch('从这里开始 关于 AI、技术与创造，写下第一篇记录。', '创造'), true);
  assert.equal(matchesSearch('从这里开始', '旅行'), false);
});

test('normalizes case and full-width characters', () => {
  assert.equal(matchesSearch('关于 AI 与 TypeScript', '　ａｉ　'), true);
  assert.equal(matchesSearch('ＡＩ 实践', 'AI'), true);
});

test('all space-separated keywords must match, in any order', () => {
  assert.equal(matchesSearch('AI 实践：技术与创造', '创造  ai'), true);
  assert.equal(matchesSearch('AI 实践：技术与创造', 'ai 旅行'), false);
});

test('search treats markup and regex syntax as literal text', () => {
  assert.equal(matchesSearch('AI 实践', '.*'), false);
  assert.equal(matchesSearch('AI 实践', '<script>'), false);
  assert.equal(matchesSearch('C++ 与 C#', 'C++'), true);
});
