import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDecimal,
  toClock,
  formatClock,
  parseClock,
  normalizeClock,
  roundDecimal,
  DecimalTimeError,
} from '../src/index.js';

test('toDecimal converts hours and minutes exactly', () => {
  // 8h30m = 8.5 decimal hours
  assert.equal(toDecimal([8, 30]), 8.5);
});

test('toDecimal includes seconds and rounds to 4 dp', () => {
  // 1h 0m 45s = 1 + 45/3600 = 1.0125 exactly
  assert.equal(toDecimal([1, 0, 45]), 1.0125);
});

test('toDecimal fills missing minutes and seconds with zero', () => {
  assert.equal(toDecimal([9]), 9);
});

test('toDecimal rounds to avoid float drift on a sum-prone value', () => {
  // 2h15m0s = 2.25; computed via 15/60 = 0.25 exactly, still must be 4dp clean
  assert.equal(toDecimal([2, 15, 0]), 2.25);
});

test('toClock converts a clean decimal to clock parts', () => {
  assert.deepEqual(toClock(8.5), [8, 30, 0]);
});

test('toClock rounds float artefacts to the nearest second', () => {
  // 7.9999995 should round to 8:00:00, not 7:59:59
  assert.deepEqual(toClock(7.9999995), [8, 0, 0]);
});

test('toClock handles seconds precisely', () => {
  // 1.0125 h = 1h 0m 45s
  assert.deepEqual(toClock(1.0125), [1, 0, 45]);
});

test('toClock accepts an array and normalises it', () => {
  // Passing [h, m] should behave as if toDecimal then toClock were called.
  assert.deepEqual(toClock([8, 30]), [8, 30, 0]);
});

test('toClock treats 24 as the end-of-day sentinel 24:00:00', () => {
  assert.deepEqual(toClock(24), [24, 0, 0]);
});

test('toClock rejects values above 24', () => {
  assert.throws(() => toClock(25), DecimalTimeError);
});

test('toClock rejects negative input', () => {
  assert.throws(() => toClock(-0.5), DecimalTimeError);
});

test('formatClock with a 3-component array always shows seconds', () => {
  assert.equal(formatClock([8, 30, 0]), '08:30:00');
});

test('formatClock with a 2-component array omits seconds', () => {
  assert.equal(formatClock([8, 30]), '08:30');
});

test('formatClock from a decimal number always shows seconds', () => {
  assert.equal(formatClock(8.5), '08:30:00');
});

test('formatClock honours an explicit seconds:false override', () => {
  assert.equal(formatClock([8, 30, 0], { seconds: false }), '08:30');
});

test('parseClock parses HH:MM:SS', () => {
  assert.deepEqual(parseClock('08:30:45'), [8, 30, 45]);
});

test('parseClock parses HH:MM', () => {
  assert.deepEqual(parseClock('17:05'), [17, 5, 0]);
});

test('parseClock trims whitespace', () => {
  assert.deepEqual(parseClock('  09:15  '), [9, 15, 0]);
});

test('parseClock rejects 60 seconds', () => {
  assert.throws(() => parseClock('01:02:60'), DecimalTimeError);
});

test('parseClock rejects 24:01', () => {
  assert.throws(() => parseClock('24:01'), DecimalTimeError);
});

test('parseClock rejects missing minutes', () => {
  assert.throws(() => parseClock('08'), DecimalTimeError);
});

test('normalizeClock rejects fractional components', () => {
  assert.throws(() => normalizeClock([8, 30.5]), DecimalTimeError);
});

test('normalizeClock rejects 60 minutes', () => {
  assert.throws(() => normalizeClock([8, 60]), DecimalTimeError);
});

test('roundDecimal rounds 7.9999995 to 8', () => {
  assert.equal(roundDecimal(7.9999995), 8);
});

test('roundDecimal rejects non-numbers', () => {
  assert.throws(() => roundDecimal('8'), DecimalTimeError);
});

test('round-trip: clock -> decimal -> clock is stable', () => {
  const original = [13, 27, 42];
  const dec = toDecimal(original);
  const back = toClock(dec);
  assert.deepEqual(back, original);
});

test('round-trip: decimal -> clock -> decimal is stable for clean values', () => {
  const dec = 14.75; // 14:45:00
  const clock = toClock(dec);
  const back = toDecimal(clock);
  assert.equal(back, dec);
});
