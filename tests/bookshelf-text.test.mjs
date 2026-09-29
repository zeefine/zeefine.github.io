import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapCoverTitle } from '../src/lib/bookshelf-text.ts';
const measure = (text) => Array.from(text).reduce((width, char) => width + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0);
test('wraps Chinese text without spaces and retains the full title when it fits', () => {
  const title = '把零散的阅读与日常观察整理成小项目';
  const lines = wrapCoverTitle(title, measure, 10, 10);
  assert.equal(lines.join(''), title);
  assert.ok(lines.every((line) => measure(line) <= 10));
});
test('breaks oversized Latin words and preserves mixed scripts', () => {
  const lines = wrapCoverTitle('TypeScript与AI工作流', measure, 6, 20);
  assert.equal(lines.join(''), 'TypeScript与AI工作流');
  assert.ok(lines.every((line) => measure(line) <= 6));
});
test('limits long covers and makes truncation explicit', () => {
  const lines = wrapCoverTitle('当一个想法还不够清晰时如何把零散的阅读实验与日常观察整理成可以持续推进的小项目', measure, 10, 5);
  assert.equal(lines.length, 5);
  assert.ok(lines[4].endsWith('…'));
  assert.ok(lines.every((line) => measure(line) <= 10));
});
