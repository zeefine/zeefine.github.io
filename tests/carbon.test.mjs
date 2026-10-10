import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCarbonResult, parseCarbonResult } from '../src/lib/carbon.ts';

const page = 'https://zeefine.github.io/blog/hello-world/';
const now = 1_800_000_000_000;
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('carbon results accept the official numeric/string response, including zero', () => {
  assert.deepEqual(parseCarbonResult({ c: '0.12', p: 87 }), { grams: 0.12, cleaner: 87 });
  assert.deepEqual(parseCarbonResult({ c: 0, p: '0' }), { grams: 0, cleaner: 0 });
});

test('missing, malformed or out-of-range results never become zero emissions', () => {
  for (const value of [null, {}, { c: null, p: 50 }, { c: '', p: 50 }, { c: true, p: 50 },
    { c: 'NaN', p: 50 }, { c: -1, p: 50 }, { c: 1, p: 101 }, { c: Infinity, p: 10 }, { c: '<script>', p: 80 }]) {
    assert.equal(parseCarbonResult(value), null);
  }
});

test('only the public page path is sent and cached; query and hash do not create new measurements', async () => {
  const cache = storage();
  const request = async (url, options) => {
    assert.equal(url, `https://api.websitecarbon.com/b?url=${encodeURIComponent(page)}`);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return new Response(JSON.stringify({ c: '0.12', p: 87 }));
  };
  assert.deepEqual(await loadCarbonResult(`${page}?q=private#section`, cache, request, now), { grams: 0.12, cleaner: 87 });
  const noRequest = async () => { throw new Error('A fresh cache should avoid the API'); };
  assert.deepEqual(await loadCarbonResult(page, cache, noRequest, now + 1000), { grams: 0.12, cleaner: 87 });
});

test('expired data is refreshed and one page never borrows another page’s result', async () => {
  const cache = storage();
  const oldResult = async () => new Response(JSON.stringify({ c: '0.12', p: 87 }));
  const newResult = async () => new Response(JSON.stringify({ c: '0.25', p: 60 }));
  await loadCarbonResult(page, cache, oldResult, now);
  assert.deepEqual(await loadCarbonResult(page, cache, newResult, now + 86_400_000), { grams: 0.25, cleaner: 60 });
  assert.deepEqual(await loadCarbonResult('https://zeefine.github.io/en/', cache, oldResult, now + 1000), { grams: 0.12, cleaner: 87 });
});

test('unavailable or corrupt browser storage does not prevent fetching a result', async () => {
  const request = async () => new Response(JSON.stringify({ c: '0.12', p: 87 }));
  const blocked = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  const corrupt = { getItem() { return '{broken'; }, setItem() {} };
  for (const cache of [null, blocked, corrupt]) {
    assert.deepEqual(await loadCarbonResult(page, cache, request, now), { grams: 0.12, cleaner: 87 });
  }
});

test('HTTP failures and invalid responses are rejected rather than cached as successful measurements', async () => {
  const cache = storage();
  await assert.rejects(loadCarbonResult(page, cache, async () => new Response('', { status: 429 }), now));
  await assert.rejects(loadCarbonResult(page, cache, async () => new Response('{}'), now));
  await assert.rejects(loadCarbonResult(page, cache, async () => { throw new Error('Offline'); }, now));
  const good = async () => new Response(JSON.stringify({ c: '0.12', p: 87 }));
  assert.deepEqual(await loadCarbonResult(page, cache, good, now), { grams: 0.12, cleaner: 87 });
});
