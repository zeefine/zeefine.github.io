import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localePath, message } from '../src/i18n/ui.ts';
import { selectLocalizedPosts } from '../src/i18n/posts.ts';

const original = (id, date = '2026-09-24') => ({ id, data: { locale: 'zh', pubDate: new Date(date) } });
const translation = (id, source) => ({ id, data: { locale: 'en', translationOf: source, pubDate: new Date('2026-10-01') } });

test('language switching round-trips existing routes, including nested article IDs', () => {
  for (const path of ['/', '/blog/', '/archive/', '/blog/notes/hello/']) {
    assert.equal(localePath(localePath(path, 'en'), 'zh'), path);
    assert.equal(localePath(localePath(path, 'en'), 'en'), localePath(path, 'en'));
  }
  assert.equal(localePath('/engineering/', 'en'), '/en/engineering/');
});

test('translations replace entries while preserving original IDs and chronological order', () => {
  const older = original('first');
  const newer = original('second', '2026-09-30');
  const english = translation('en/renamed-first', 'first');
  const posts = selectLocalizedPosts([english, older, newer], 'en');
  assert.deepEqual(posts.map((post) => post.id), ['second', 'first']);
  assert.equal(posts[1].entry, english);
  assert.equal(posts[1].contentLocale, 'en');
  assert.equal(posts[1].pubDate, older.data.pubDate);
  assert.equal(selectLocalizedPosts([older, english], 'zh')[0].entry, older);
});

test('untranslated articles retain Chinese content on English routes', () => {
  const chinese = original('first');
  assert.deepEqual(selectLocalizedPosts([chinese], 'en'), [{ id: 'first', entry: chinese, pubDate: chinese.data.pubDate, contentLocale: 'zh', hasTranslation: false, previousId: undefined, nextId: undefined }]);
  assert.deepEqual(selectLocalizedPosts([], 'en'), []);
});

test('article navigation follows list order and hides missing neighbors at both ends', () => {
  const entries = [original('oldest', '2024-01-01'), original('middle', '2025-01-01'), original('newest', '2026-01-01')];
  const posts = selectLocalizedPosts(entries, 'zh');
  assert.deepEqual(posts.map(({ id, previousId, nextId }) => ({ id, previousId, nextId })), [
    { id: 'newest', previousId: undefined, nextId: 'middle' },
    { id: 'middle', previousId: 'newest', nextId: 'oldest' },
    { id: 'oldest', previousId: 'middle', nextId: undefined },
  ]);
});

test('translated articles navigate by original IDs without creating additional neighbors', () => {
  const entries = [original('first', '2026-01-01'), original('second', '2025-01-01'), translation('en/new-title', 'second')];
  const english = selectLocalizedPosts(entries, 'en');
  assert.equal(english.length, 2);
  assert.equal(english[0].nextId, 'second');
  assert.equal(english[1].previousId, 'first');
  assert.equal(english[1].nextId, undefined);
});

test('a single article has no previous or next article', () => {
  const [post] = selectLocalizedPosts([original('only')], 'zh');
  assert.equal(post.previousId, undefined);
  assert.equal(post.nextId, undefined);
});

test('invalid or ambiguous translation associations fail instead of losing articles', () => {
  assert.throws(() => selectLocalizedPosts([translation('en/orphan', 'missing')], 'en'), /no Chinese original/);
  assert.throws(() => selectLocalizedPosts([original('first'), translation('en/a', 'first'), translation('en/b', 'first')], 'en'), /Duplicate/);
});

test('localized counts handle empty results and singular English articles', () => {
  assert.equal(message('en', 'count', { count: 1 }), '1 article');
  assert.equal(message('en', 'results', { count: 0, total: 9 }), 'Found 0 articles out of 9');
  assert.equal(message('en', 'results', { count: 1, total: 9 }), 'Found 1 article out of 9');
  assert.equal(message('zh', 'results', { count: 0, total: 9 }), '找到 0 篇文章，共 9 篇');
  assert.ok(message('en', 'selectedBook', { title: '$& <title>' }).startsWith('$& <title>, open.'));
});
