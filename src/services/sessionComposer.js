'use strict';

/**
 * Menyusun daftar soal satu sesi (murni, tanpa DB) sesuai PRD:
 *  - subtopik biasa : 70% setara level siswa, 20% satu level di atas, 10% satu level di bawah
 *  - topik Elite    : 80% Level 4, 20% Level 3 (ulangan)
 *  - jumlah soal dibagi rata ke "unit" (subtopik / topik Elite)
 *  - kekurangan di suatu level diisi dari level terdekat, lalu dari unit lain
 *
 * unit  : { type: 'subtopic', id, level } | { type: 'elite', id }
 * pools : Map<"s:<subtopicId>:<level>" | "t:<topicId>:<level>", string[]>
 *         (ID soal, sudah diurutkan: yang belum pernah dikerjakan lebih dulu)
 */

const ATAS = 0.2;
const BAWAH = 0.1;
const ELITE_L4 = 0.8;

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const uniq = (arr) => [...new Set(arr)];
const poolKey = (unit, level) => `${unit.type === 'elite' ? 't' : 's'}:${unit.id}:${level}`;

function allocate(units, n, rng) {
  const order = shuffle(units, rng);
  const base = Math.floor(n / order.length);
  const rem = n % order.length;
  return order.map((unit, i) => ({ unit, count: base + (i < rem ? 1 : 0) }));
}

function wishlist(unit, count) {
  if (unit.type === 'elite') {
    const c4 = Math.round(count * ELITE_L4);
    return [...Array(c4).fill(4), ...Array(count - c4).fill(3)];
  }
  const L = unit.level;
  const up = Math.min(L + 1, 3);
  const down = Math.max(L - 1, 1);
  const atas = Math.round(count * ATAS);
  const bawah = Math.round(count * BAWAH);
  const setara = count - atas - bawah;
  return [...Array(setara).fill(L), ...Array(atas).fill(up), ...Array(bawah).fill(down)];
}

function fallbackLevels(unit) {
  if (unit.type === 'elite') return [4, 3];
  const L = unit.level;
  return uniq([L, Math.min(L + 1, 3), Math.max(L - 1, 1), 1, 2, 3]);
}

function composeSession({ units, n, pools, rng = Math.random }) {
  const used = new Set();
  const picked = [];
  const ptr = new Map();

  const take = (unit, level) => {
    const key = poolKey(unit, level);
    const arr = pools.get(key) || [];
    let i = ptr.get(key) || 0;
    while (i < arr.length) {
      const id = arr[i];
      i += 1;
      if (!used.has(id)) {
        ptr.set(key, i);
        return id;
      }
    }
    ptr.set(key, i);
    return null;
  };

  const takeAny = (unit, preferred) => {
    for (const lv of uniq([preferred, ...fallbackLevels(unit)])) {
      const id = take(unit, lv);
      if (id) return id;
    }
    return null;
  };

  const add = (id) => {
    used.add(id);
    picked.push(id);
  };

  for (const { unit, count } of allocate(units, n, rng)) {
    for (const lv of wishlist(unit, count)) {
      const id = takeAny(unit, lv);
      if (id) add(id);
    }
  }

  // Isi kekurangan dari unit mana pun yang masih punya soal
  let progress = true;
  while (picked.length < n && progress) {
    progress = false;
    for (const u of shuffle(units, rng)) {
      if (picked.length >= n) break;
      const id = takeAny(u, fallbackLevels(u)[0]);
      if (id) {
        add(id);
        progress = true;
      }
    }
  }

  return shuffle(picked, rng);
}

module.exports = { composeSession, poolKey };
