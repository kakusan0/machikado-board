import type { GameMap, Square, Street } from './state';

// 盤の並びを短い記号で書く。B=銀行 P=広場 C=チャンス L=空き地 a〜d=スタンプ 0〜9=通り番号の店
const SHOP_NAMES = [
  ['パン工房', '八百屋', '喫茶こもれび', '豆腐店'],
  ['魚市場', '船具店', '潮風食堂', '干物屋'],
  ['木工房', '花屋', '茶葉店', '森のパン屋'],
  ['天文書房', '時計店', '夜カフェ', '雑貨ほしや'],
  ['和菓子処', '呉服店', '金物屋', '甘味茶屋'],
  ['自転車店', '写真館', '靴工房', '風見亭'],
];
const STREETS: Street[] = [
  { name: 'あさひ通り', color: '#E8833A' },
  { name: 'みなと通り', color: '#2F7FD3' },
  { name: 'もりの通り', color: '#3E9B5A' },
  { name: 'ほしぞら通り', color: '#7A55C8' },
  { name: 'さくら通り', color: '#D9547E' },
  { name: 'かぜの通り', color: '#1E9E9A' },
];

function build(id: string, name: string, grid: number, target: number, startCash: number,
  layout: string, streetBase: number[]): GameMap {
  const tokens = layout.replace(/\s+/g, '').split('');
  if (tokens.length !== 4 * (grid - 1)) throw new Error(`map ${id}: ${tokens.length} マス`);
  const used = streetBase.map(() => 0);
  let chance = 0;
  const squares: Square[] = tokens.map((t, i): Square => {
    if (t === 'B') return { id: i, kind: 'bank', name: '銀行' };
    if (t === 'P') return { id: i, kind: 'plaza', name: '広場' };
    if (t === 'C') return { id: i, kind: 'chance', name: `チャンス${++chance}` };
    if (t === 'L') return { id: i, kind: 'lot', name: '空き地', base: 200 };
    if ('abcd'.includes(t)) {
      const s = 'abcd'.indexOf(t);
      return { id: i, kind: 'stamp', name: `${['パン', '花', '本', '鍵'][s]}のスタンプ`, stamp: s };
    }
    const street = Number(t);
    const k = used[street]++;
    return { id: i, kind: 'shop', name: SHOP_NAMES[street][k], street, base: streetBase[street] + k * 20 };
  });
  return { id, name, grid, target, startCash, streets: STREETS.slice(0, streetBase.length), squares };
}

export const MAPS: GameMap[] = [
  build('corner', 'ちいさな四つ角', 6, 4000, 1200,
    'B00a0 C11b1 P22c2 C33d3', [100, 140, 180, 220]),
  build('harbor', 'みなとの商店街', 8, 5000, 1500,
    'B00a00C P11b1L1 C22c22L C33d3C3', [120, 160, 200, 260]),
  build('grand', 'ひろがる大通り', 10, 6000, 2000,
    'B00a0C111 P1L22b2C2 C33c3L444 P4C55d5L5', [120, 150, 190, 230, 270, 320]),
];

export function getMap(id: string): GameMap {
  const m = MAPS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown map ${id}`);
  return m;
}

// 外周の i 番目のマスの格子座標（左上が 0,0、右回り）
export function squareXY(grid: number, i: number): [number, number] {
  const side = grid - 1;
  const s = Math.floor(i / side);
  const k = i % side;
  if (s === 0) return [k, 0];
  if (s === 1) return [side, k];
  if (s === 2) return [side - k, side];
  return [0, side - k];
}
