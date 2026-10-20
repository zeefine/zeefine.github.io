import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGardenProgress, growthStageForWaterings, GARDEN_WATERING_KEY } from '../src/lib/garden-progress.ts';

function memoryStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[GARDEN_WATERING_KEY, initial]]);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    clear: () => values.clear(),
  };
}

test('watering is local to each browser and persists across page or language reloads', () => {
  const firstStorage = memoryStorage(), secondStorage = memoryStorage();
  const first = createGardenProgress(firstStorage), second = createGardenProgress(secondStorage);
  assert.deepEqual(first.read(), { count: 0, persisted: true });
  assert.equal(first.water().count, 1);
  assert.equal(first.water().count, 2);
  assert.equal(second.read().count, 0);
  assert.equal(createGardenProgress(firstStorage).read().count, 2);
});

test('the 30th and 60th waterings grow the tree while later waterings keep accumulating', () => {
  const progress = createGardenProgress(memoryStorage());
  for (let i = 1; i <= 62; i++) {
    const { count } = progress.water();
    assert.equal(count, i);
    assert.equal(growthStageForWaterings(count), i < 30 ? 'growing' : i < 60 ? 'medium' : 'mature');
  }
  for (const count of [0, 24, 25, 29, 30, 31, 49, 50, 52, 59, 60, 61]) {
    const restored = createGardenProgress(memoryStorage(String(count))).read();
    assert.equal(restored.count, count, 'existing progress survives the threshold change');
    assert.equal(growthStageForWaterings(restored.count), count < 30 ? 'growing' : count < 60 ? 'medium' : 'mature');
  }
});

test('existing tabs read the latest local count before adding and accept cleared storage', () => {
  const storage = memoryStorage('4');
  const first = createGardenProgress(storage), second = createGardenProgress(storage);
  assert.equal(first.read().count, 4);
  assert.equal(second.water().count, 5);
  assert.equal(first.water().count, 6);
  assert.equal(second.read().count, 6);
  storage.clear();
  assert.equal(first.read().count, 0);
});

test('invalid stored counts do not create phantom growth or unsafe numbers', () => {
  for (const value of ['-1', '1.5', 'NaN', 'Infinity', '1e3', '', ' ', 'true', '{}', '9007199254740992']) {
    const progress = createGardenProgress(memoryStorage(value));
    assert.equal(progress.read().count, 0, value);
    assert.equal(progress.water().count, 1, value);
  }
  assert.equal(createGardenProgress(memoryStorage(String(Number.MAX_SAFE_INTEGER))).water().count, Number.MAX_SAFE_INTEGER);
});

test('blocked storage keeps a working in-memory count without claiming to save it', () => {
  for (const storage of [null, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }]) {
    const progress = createGardenProgress(storage);
    assert.deepEqual(progress.read(), { count: 0, persisted: false });
    assert.deepEqual(progress.water(), { count: 1, persisted: false });
    assert.deepEqual(progress.water(), { count: 2, persisted: false });
  }
});

test('a failed write preserves both saved and newly watered progress for this visit', () => {
  const progress = createGardenProgress({ getItem: () => '5', setItem() { throw new Error('quota'); } });
  assert.deepEqual(progress.read(), { count: 5, persisted: true });
  assert.deepEqual(progress.water(), { count: 6, persisted: false });
  assert.deepEqual(progress.read(), { count: 6, persisted: false });
  assert.deepEqual(progress.water(), { count: 7, persisted: false });
});
