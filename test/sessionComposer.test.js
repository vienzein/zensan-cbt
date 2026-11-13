'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { composeSession, poolKey } = require('../src/services/sessionComposer');

// RNG deterministik
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function mkPool(unit, perLevel, prefix) {
  const m = new Map();
  for (const [lv, n] of Object.entries(perLevel)) {
    m.set(poolKey(unit, Number(lv)), Array.from({ length: n }, (_, i) => `${prefix}L${lv}-${i}`));
  }
  return m;
}
const merge = (...maps) => new Map(maps.flatMap((m) => [...m]));
const levelOf = (id) => Number(/L(\d)-/.exec(id)[1]);

test('satu subtopik Level 2, 10 soal: 7 setara, 2 atas, 1 bawah', () => {
  const u = { type: 'subtopic', id: '1', level: 2 };
  const ids = composeSession({ units: [u], n: 10, pools: mkPool(u, { 1: 20, 2: 20, 3: 20 }, 'a'), rng: seeded(1) });
  const c = { 1: 0, 2: 0, 3: 0 };
  ids.forEach((id) => { c[levelOf(id)] += 1; });
  assert.deepEqual(c, { 1: 1, 2: 7, 3: 2 });
  assert.equal(new Set(ids).size, 10);
});

test('Level 3 siswa: "atas" jatuh ke Level 3 (tidak ada Level 4 untuk non-Elite)', () => {
  const u = { type: 'subtopic', id: '1', level: 3 };
  const ids = composeSession({ units: [u], n: 10, pools: mkPool(u, { 1: 20, 2: 20, 3: 20 }, 'a'), rng: seeded(2) });
  assert.ok(ids.every((id) => levelOf(id) <= 3));
  assert.equal(ids.filter((id) => levelOf(id) === 3).length, 9);
});

test('topik Elite: 80% Level 4, 20% Level 3', () => {
  const u = { type: 'elite', id: '9' };
  const ids = composeSession({ units: [u], n: 10, pools: mkPool(u, { 3: 20, 4: 20 }, 'e'), rng: seeded(3) });
  assert.equal(ids.filter((id) => levelOf(id) === 4).length, 8);
  assert.equal(ids.filter((id) => levelOf(id) === 3).length, 2);
});

test('soal dibagi rata antar subtopik', () => {
  const a = { type: 'subtopic', id: '1', level: 1 };
  const b = { type: 'subtopic', id: '2', level: 1 };
  const ids = composeSession({
    units: [a, b], n: 10,
    pools: merge(mkPool(a, { 1: 20, 2: 20 }, 'a'), mkPool(b, { 1: 20, 2: 20 }, 'b')),
    rng: seeded(4),
  });
  assert.equal(ids.filter((id) => id.startsWith('a')).length, 5);
  assert.equal(ids.filter((id) => id.startsWith('b')).length, 5);
});

test('kekurangan di satu level diisi level lain; tanpa duplikat', () => {
  const u = { type: 'subtopic', id: '1', level: 2 };
  const ids = composeSession({ units: [u], n: 10, pools: mkPool(u, { 2: 4, 3: 20 }, 'a'), rng: seeded(5) });
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
});

test('bank soal kurang dari diminta: kembalikan yang tersedia', () => {
  const u = { type: 'subtopic', id: '1', level: 1 };
  const ids = composeSession({ units: [u], n: 10, pools: mkPool(u, { 1: 3 }, 'a'), rng: seeded(6) });
  assert.equal(ids.length, 3);
});

test('soal yang terikat ke dua subtopik tidak dipilih dua kali', () => {
  const a = { type: 'subtopic', id: '1', level: 3 };
  const b = { type: 'subtopic', id: '2', level: 3 };
  const shared = ['shared-L3-0', 'shared-L3-1'];
  const pools = new Map([
    [poolKey(a, 3), [...shared]],
    [poolKey(b, 3), [...shared]],
  ]);
  const ids = composeSession({ units: [a, b], n: 5, pools, rng: seeded(7) });
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 2);
});
