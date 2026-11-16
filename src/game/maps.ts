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

export const MIN_GRID = 4;
export const MAX_GRID = 12;
export const MIN_SHOPS_PER_STREET = 2;
export const MAX_SHOPS_PER_STREET = 4;

// 記号の並びから盤を作る（形の確認はしない。確認は validateMap で行う）
export function parseMap(id: string, name: string, grid: number, target: number, startCash: number,
  layout: string, streetBase: number[]): { map: GameMap; errors: string[] } {
  const errors: string[] = [];
  const tokens = layout.replace(/\s+/g, '').split('');
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
    if (/^[0-9]$/.test(t) && Number(t) < streetBase.length) {
      const street = Number(t);
      const k = used[street]++;
      return {
        id: i, kind: 'shop', name: SHOP_NAMES[street]?.[k] ?? `${street}-${k + 1}号店`, street,
        base: streetBase[street] + k * 20,
      };
    }
    errors.push(`${i} マス目の記号「${t}」は使えません`);
    return { id: i, kind: 'plaza', name: '広場' };
  });
  const map = { id, name, grid, target, startCash, streets: STREETS.slice(0, streetBase.length), squares };
  if (streetBase.length > STREETS.length) errors.push(`通りは ${STREETS.length} 本までです（${streetBase.length} 本）`);
  return { map, errors };
}

// 盤の形とバランスの確認。問題の一覧を返す（空なら正しい）
export function validateMap(m: GameMap): string[] {
  const e: string[] = [];
  const sq = m.squares;
  const shops = sq.filter((q) => q.kind === 'shop');

  // 形
  if (!/^[a-z][a-z0-9-]*$/.test(m.id)) e.push(`id「${m.id}」は英小文字・数字・ハイフンにしてください`);
  if (!m.name.trim()) e.push('マップ名が空です');
  if (!Number.isInteger(m.grid) || m.grid < MIN_GRID || m.grid > MAX_GRID) e.push(`盤の大きさは ${MIN_GRID}〜${MAX_GRID} です（${m.grid}）`);
  if (sq.length !== 4 * (m.grid - 1)) e.push(`マスの数が外周（${4 * (m.grid - 1)}）と合いません（${sq.length}）`);
  sq.forEach((q, i) => { if (q.id !== i) e.push(`${i} マス目の番号がずれています（${q.id}）`); });

  // 銀行
  const banks = sq.filter((q) => q.kind === 'bank');
  if (banks.length !== 1) e.push(`銀行はちょうど 1 つ必要です（${banks.length}）`);
  if (sq[0]?.kind !== 'bank') e.push('最初のマス（スタート）は銀行にしてください');

  // スタンプ：4 種が 1 つずつ
  for (let s = 0; s < 4; s++) {
    const n = sq.filter((q) => q.kind === 'stamp' && q.stamp === s).length;
    if (n !== 1) e.push(`${['パン', '花', '本', '鍵'][s]}のスタンプは 1 つ必要です（${n}）`);
  }

  // 通り
  if (m.streets.length < 2) e.push('通りは 2 本以上必要です');
  m.streets.forEach((st, i) => {
    const own = shops.filter((q) => q.street === i);
    if (own.length < MIN_SHOPS_PER_STREET || own.length > MAX_SHOPS_PER_STREET) {
      e.push(`${st.name}のお店は ${MIN_SHOPS_PER_STREET}〜${MAX_SHOPS_PER_STREET} 軒にしてください（${own.length}）`);
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(st.color)) e.push(`${st.name}の色「${st.color}」が正しくありません`);
    // 通りのお店は、間に入るのが店以外のマス 2 つまでのひとかたまりにする
    const idx = own.map((q) => q.id);
    if (idx.length > 1) {
      const n = sq.length;
      const gaps = idx.map((v, k) => ((idx[(k + 1) % idx.length] - v + n) % n) || n);
      const span = n - Math.max(...gaps);
      if (span - (idx.length - 1) > 2 * (idx.length - 1)) e.push(`${st.name}のお店が離れすぎています`);
    }
  });
  if (new Set(m.streets.map((s) => s.name)).size !== m.streets.length) e.push('通りの名前が重なっています');
  shops.forEach((q) => {
    if (q.street == null || q.street < 0 || q.street >= m.streets.length) e.push(`${q.name}の通りがありません`);
    if (!(q.base! > 0)) e.push(`${q.name}の価格が正しくありません`);
  });
  sq.filter((q) => q.kind === 'lot').forEach((q) => { if (!(q.base! > 0)) e.push(`${q.id} マス目の空き地の価格が正しくありません`); });

  // 名前
  const names = shops.map((q) => q.name);
  const dup = names.filter((x, i) => names.indexOf(x) !== i);
  if (dup.length) e.push(`お店の名前が重なっています：${[...new Set(dup)].join('、')}`);

  // 並び
  if (sq.filter((q) => q.kind === 'chance').length < 1) e.push('チャンスマスが 1 つ以上必要です');
  for (let i = 0; i < sq.length; i++) {
    const a = sq[i].kind;
    const b = sq[(i + 1) % sq.length].kind;
    if (a !== 'shop' && a !== 'stamp' && a === b) e.push(`${i}・${(i + 1) % sq.length} マス目に同じ特殊マス（${a}）が並んでいます`);
  }
  if (shops.length < sq.length * 0.4) e.push(`お店が少なすぎます（${shops.length}/${sq.length} マス。4 割以上）`);

  // お金
  const cheapest = Math.min(...shops.map((q) => q.base!));
  if (!(m.startCash > 0)) e.push('初期資金が正しくありません');
  if (m.startCash < cheapest * 3) e.push(`初期資金（${m.startCash}G）では一番安いお店を 3 軒買えません（${cheapest}G）`);
  if (m.target <= m.startCash * 2) e.push(`目標（${m.target}G）は初期資金の 2 倍より大きくしてください`);
  return e;
}

function build(...args: Parameters<typeof parseMap>): GameMap {
  const { map, errors } = parseMap(...args);
  const all = [...errors, ...validateMap(map)];
  if (all.length) throw new Error(`マップ「${map.id}」に問題があります：\n- ${all.join('\n- ')}`);
  return map;
}

export const MAPS: GameMap[] = [
  build('corner', 'ちいさな四つ角', 6, 4000, 1200,
    'B00a0 C11b1 P22c2 C33d3', [100, 140, 180, 220]),
  build('harbor', 'みなとの商店街', 8, 5000, 1500,
    'B00a00C P11b1L1 C22c22L C33d3C3', [120, 160, 200, 260]),
  build('grand', 'ひろがる大通り', 10, 6000, 2000,
    'B00a0C111 P1L22b2C2 C33c3L444 P4C55d5L5', [120, 150, 190, 230, 270, 320]),
];

// マップどうしの確認（id の重なり）
export function validateMaps(maps: GameMap[]): string[] {
  const ids = maps.map((m) => m.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  return dup.length ? [`マップの id が重なっています：${[...new Set(dup)].join('、')}`] : [];
}
{
  const errs = validateMaps(MAPS);
  if (errs.length) throw new Error(errs.join('\n'));
}

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
