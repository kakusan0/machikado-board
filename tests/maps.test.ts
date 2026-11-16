import { describe, expect, it } from 'vitest';
import { MAPS, parseMap, squareXY, validateMap, validateMaps } from '../src/game/maps';

// 正しい最小の盤（6×6・20 マス）を土台に、1 か所ずつ壊して確認する
const OK = 'B00a0 C11b1 P22c2 C33d3';
const BASE = [100, 140, 180, 220];
const check = (layout = OK, o: { grid?: number; target?: number; cash?: number; base?: number[]; id?: string } = {}) => {
  const { map, errors } = parseMap(o.id ?? 'test', 'テスト', o.grid ?? 6, o.target ?? 4000, o.cash ?? 1200, layout, o.base ?? BASE);
  return [...errors, ...validateMap(map)].join('\n');
};

describe('収録マップ', () => {
  it('すべて確認を通る', () => {
    for (const m of MAPS) expect(validateMap(m)).toEqual([]);
    expect(validateMaps(MAPS)).toEqual([]);
  });
  it('マスの座標が重ならない', () => {
    for (const m of MAPS) {
      expect(new Set(m.squares.map((q) => squareXY(m.grid, q.id).join(','))).size).toBe(m.squares.length);
    }
  });
});

describe('マップの確認', () => {
  it('土台の盤は問題なし', () => expect(check()).toBe(''));
  it('マスの数', () => expect(check('B00a0 C11b1 P22c2 C33d')).toMatch('外周'));
  it('盤の大きさ', () => expect(check(OK, { grid: 3 })).toMatch('盤の大きさ'));
  it('使えない記号', () => expect(check('B00a0 C11b1 P22c2 C33dX')).toMatch('記号「X」'));
  it('存在しない通り番号', () => expect(check('B00a0 C11b1 P22c2 C33d5')).toMatch('記号「5」'));
  it('スタートが銀行でない', () => expect(check('0B0a0 C11b1 P22c2 C33d3')).toMatch('最初のマス'));
  it('銀行が 2 つ', () => expect(check('B00a0 C11b1 B22c2 C33d3')).toMatch('銀行はちょうど 1 つ'));
  it('スタンプが足りない', () => expect(check('B00a0 C11b1 P22c2 C3333')).toMatch('鍵のスタンプは 1 つ必要'));
  it('スタンプが重なる', () => expect(check('B00a0 C11a1 P22c2 C33d3')).toMatch('花のスタンプは 1 つ必要'));
  it('お店が 1 軒だけの通り', () => expect(check('B00a0 C11b1 P00c2 C33d3')).toMatch('もりの通りのお店は'));
  it('お店が多すぎる通り', () => expect(check('B00a0 C00b0 P22c2 C33d3', { base: [100, 140, 180, 220] }))
    .toMatch(/あさひ通りのお店は|みなと通りのお店は/));
  it('通りが離れすぎ', () => expect(check('B01a0 C10b1 P22c2 C33d3')).toMatch('離れすぎ'));
  it('同じ特殊マスが並ぶ', () => expect(check('B00a0 CC1b1 P22c2 133d3')).toMatch('同じ特殊マス'));
  it('チャンスがない', () => expect(check('B00a0 P11b1 L22c2 P33d3')).toMatch('チャンスマス'));
  it('初期資金が少ない', () => expect(check(OK, { cash: 200 })).toMatch('初期資金'));
  it('目標が低すぎる', () => expect(check(OK, { target: 2000 })).toMatch('目標'));
  it('価格が 0 以下', () => expect(check(OK, { base: [0, 140, 180, 220] })).toMatch('価格が正しくありません'));
  it('id の形式', () => expect(check(OK, { id: 'Bad Id' })).toMatch('id'));
  it('id の重なり', () => expect(validateMaps([MAPS[0], MAPS[0]])).toHaveLength(1));
});
