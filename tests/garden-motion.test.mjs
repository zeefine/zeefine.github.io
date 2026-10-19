import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGardenMotion, createGardenWindClock } from '../src/lib/garden-motion.ts';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);

test('the tree stays static without a view selection', () => {
  const motion = createGardenMotion();
  assert.equal(motion.rotation, 0);
  assert.equal(motion.turning, false);
  for (let frame = 0; frame < 120 * 60; frame++) {
    motion.advance(1 / 60);
    assert.equal(motion.rotation, 0);
    assert.equal(motion.turning, false);
  }
});

test('a view change eases to an exact endpoint at 300 ms and stays there', () => {
  const motion = createGardenMotion();
  motion.setView(1, true);
  assert.equal(motion.rotation, 0);
  assert.equal(motion.turning, true);
  motion.advance(0.05);
  assert.ok(motion.rotation > 0 && motion.rotation < (Math.PI / 2) / 6, 'the start should be slower than linear');
  motion.advance(0.1);
  close(motion.rotation, Math.PI / 4);
  motion.advance(0.1);
  assert.ok(motion.rotation < Math.PI / 2);
  assert.equal(motion.turning, true);
  motion.advance(0.05);
  assert.equal(motion.rotation, Math.PI / 2);
  assert.equal(motion.turning, false);
  for (let frame = 0; frame < 120 * 60; frame++) {
    motion.advance(1 / 60);
    assert.equal(motion.rotation, Math.PI / 2);
  }
});

test('reselecting the current target does not restart its transition', () => {
  const motion = createGardenMotion();
  motion.setView(0, true);
  assert.equal(motion.turning, false);
  motion.setView(2, true);
  motion.advance(0.1);
  motion.advance(0.1);
  const angle = motion.rotation;
  motion.setView(2, true);
  assert.equal(motion.rotation, angle);
  motion.advance(0.1);
  assert.equal(motion.rotation, Math.PI);
  assert.equal(motion.turning, false);
});

test('rapid changes start from the visible angle and finish at the latest target', () => {
  const motion = createGardenMotion();
  motion.setView(2, true);
  motion.advance(0.1);
  const beforeReverse = motion.rotation;
  motion.setView(0, true);
  assert.equal(motion.rotation, beforeReverse, 'reversing must not snap to an earlier view');
  motion.advance(0.1);
  assert.ok(motion.rotation > 0 && motion.rotation < beforeReverse);
  const beforeSecondChange = motion.rotation;
  motion.setView(1, true);
  assert.equal(motion.rotation, beforeSecondChange);
  for (let frame = 0; frame < 3; frame++) motion.advance(0.1);
  assert.equal(motion.rotation, Math.PI / 2);
  assert.equal(motion.turning, false);
});

test('pausing or reducing motion finishes the current view immediately', () => {
  const motion = createGardenMotion();
  motion.setView(2, true);
  motion.advance(0.1);
  assert.equal(motion.turning, true);
  motion.advance(0.05);
  motion.finishView();
  assert.equal(motion.rotation, Math.PI);
  assert.equal(motion.turning, false);
  motion.setView(0, false);
  assert.equal(motion.rotation, 0);
  assert.equal(motion.turning, false);
  motion.setView(1, true);
  motion.advance(0.05);
  motion.setView(1, false);
  assert.equal(motion.rotation, Math.PI / 2);
  assert.equal(motion.turning, false);
});

test('invalid frame times do not advance state and large deltas are capped', () => {
  const motion = createGardenMotion();
  motion.setView(2, true);
  for (const delta of [NaN, Infinity, -Infinity, -1, 0]) motion.advance(delta);
  assert.equal(motion.rotation, 0);
  assert.equal(motion.turning, true);
  motion.advance(60);
  assert.ok(motion.rotation > 0 && motion.rotation < Math.PI);
  assert.equal(motion.turning, true);
});

test('wind keeps its eight-second cycle at high and low frame rates, including a dropped frame', () => {
  for (const fps of [120, 60, 30, 8]) {
    const clock = createGardenWindClock();
    for (let frame = 0; frame <= fps * 3; frame++) clock.tick(1000 + frame * 1000 / fps);
    close(clock.seconds, 3);
    clock.tick(4500); // A visible-page stall must not slow the whole wind cycle.
    close(clock.seconds, 3.5);
    clock.tick(9000);
    close(clock.seconds, 0);
    clock.tick(1000 + 3600 * 1000 + 3250);
    close(clock.seconds, 3.25, 'long playback must not accumulate phase drift');
  }
});

test('suspending wind preserves the displayed frame and excludes time spent paused or hidden', () => {
  const clock = createGardenWindClock();
  clock.tick(0);
  clock.tick(2250);
  clock.suspend();
  close(clock.seconds, 2.25);
  clock.tick(90000);
  close(clock.seconds, 2.25);
  clock.tick(90250);
  close(clock.seconds, 2.5);
  clock.suspend();
  clock.suspend();
  clock.tick(100000);
  close(clock.seconds, 2.5);
});

test('seeking selects exact loop endpoints and resumes from the chosen frame', () => {
  const clock = createGardenWindClock();
  clock.tick(1000);
  clock.seek(4.35);
  close(clock.seconds, 4.35);
  clock.tick(60000);
  close(clock.seconds, 4.35);
  clock.tick(60100);
  close(clock.seconds, 4.45);
  clock.seek(8);
  close(clock.seconds, 8);
  clock.tick(90000);
  close(clock.seconds, 0);
  clock.tick(90250);
  close(clock.seconds, .25);
  clock.seek(-1);
  close(clock.seconds, 0);
  clock.seek(20);
  close(clock.seconds, 8);
});

test('invalid or backward clock samples never corrupt the wind phase', () => {
  const clock = createGardenWindClock();
  clock.tick(1000);
  clock.tick(3000);
  for (const time of [NaN, Infinity, -Infinity, 2500]) clock.tick(time);
  for (const time of [NaN, Infinity, -Infinity]) clock.seek(time);
  close(clock.seconds, 2);
  clock.tick(3250);
  close(clock.seconds, 2.25);
});
