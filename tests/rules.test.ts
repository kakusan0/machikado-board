import { describe, expect, it } from 'vitest';
import { decide } from '../src/game/ai';
import { MAPS, getMap } from '../src/game/maps';
import {
  adjacencyMult, buyQuote, canBuyout, fee, feeRate, investCap, netWorth, salary, sellQuote, stockPrice, topHolder,
} from '../src/game/rules';
import type { GameState } from '../src/game/state';
import { apply, newGame } from '../src/game/turn';

const players = [
  { name: 'あなた', cpu: null },
  { name: 'CPU1', cpu: 'normal' as const },
  { name: 'CPU2', cpu: 'normal' as const },
  { name: 'CPU3', cpu: 'normal' as const },
];
const game = (mode: 'easy' | 'normal' = 'normal', mapId = 'corner') => newGame({ mapId, mode, seed: 1, players });
const shopsOf = (s: GameState, street: number) => getMap(s.mapId).squares.filter((q) => q.kind === 'shop' && q.street === street).map((q) => q.id);
const own = (s: GameState, sq: number, pid: number) => { s.props[sq]!.owner = pid; };
// sq のひとつ手前（分かれ道でないマス）に、sq へ向かう向きで立たせる。サイコロ 1 で sq に止まる
const standBefore = (s: GameState, sq: number) => {
  const m = getMap(s.mapId);
  const w = m.links[sq].find((v) => m.links[v].length === 2)!;
  s.players[0].pos = w;
  s.players[0].prev = m.links[w].find((v) => v !== sq)!;
};

describe('利用料', () => {
  it('ふつう：所有数で 15/25/35% 、独占で +10%', () => {
    const s = game();
    const [a, b, c] = shopsOf(s, 0);
    own(s, a, 1);
    expect(feeRate(s, a)).toBeCloseTo(0.15);
    own(s, b, 1);
    expect(feeRate(s, a)).toBeCloseTo(0.25);
    own(s, c, 1);
    expect(feeRate(s, a)).toBeCloseTo(0.45); // 3 軒 35% ＋ 独占 10%
    expect(fee(s, a)).toBe(Math.round(s.props[a]!.value * 0.45));
  });
  it('かんたん：隣が同じ持ち主なら ×1.5、両隣なら ×2', () => {
    const s = game('easy');
    own(s, 1, 1);
    expect(adjacencyMult(s, 1)).toBe(1);
    own(s, 2, 1);
    expect(adjacencyMult(s, 1)).toBe(1.5);
    own(s, 5, 2); own(s, 6, 2); own(s, 9, 3);
    expect(adjacencyMult(s, 6)).toBe(1.5);
    expect(feeRate(s, 2)).toBeCloseTo(0.3);
  });
  it('持ち主がお休み中なら 0', () => {
    const s = game();
    own(s, 1, 1);
    s.players[1].closed = true;
    expect(fee(s, 1)).toBe(0);
  });
});

describe('増資の上限', () => {
  it('基本価格 ×（1＋所有数×0.5）、独占で ×3', () => {
    const s = game();
    const [a, b, c] = shopsOf(s, 2); // 3 軒の通り
    const base = getMap('corner').squares[a].base!;
    own(s, a, 0);
    expect(investCap(s, a)).toBe(base * 1.5);
    own(s, b, 0);
    expect(investCap(s, a)).toBe(base * 2);
    own(s, c, 0);
    expect(investCap(s, a)).toBe(base * 3);
  });
  it('かんたんでは増資できない', () => {
    const s = game('easy');
    own(s, 1, 0);
    expect(investCap(s, 1)).toBe(0);
  });
});

describe('株', () => {
  it('株価 ＝（10＋通りの価値÷40）× 需給', () => {
    const s = game();
    const value = shopsOf(s, 0).reduce((a, q) => a + s.props[q]!.value, 0);
    expect(stockPrice(s, 0)).toBe(Math.round(10 + value / 40));
    s.demand[0] = 1.5;
    expect(stockPrice(s, 0)).toBe(Math.round((10 + value / 40) * 1.5));
  });
  it('買ってすぐ売っても得をしない', () => {
    const s = game();
    for (const lots of [1, 5, 20]) {
      const b = buyQuote(s, 0, lots);
      const after = { ...s, demand: s.demand.map((d, i) => (i === 0 ? b.demand : d)) };
      expect(sellQuote(after, 0, lots).gain).toBeLessThanOrEqual(b.cost);
    }
  });
  it('筆頭株主は 50 株以上の単独 1 位', () => {
    const s = game();
    s.players[1].shares[0] = 40;
    expect(topHolder(s, 0)).toBeNull();
    s.players[1].shares[0] = 60;
    expect(topHolder(s, 0)).toBe(1);
    s.players[2].shares[0] = 60;
    expect(topHolder(s, 0)).toBeNull();
  });
  it('配当と筆頭株主ボーナスが入る', () => {
    let s = game();
    const sq = shopsOf(s, 0)[0];
    own(s, sq, 1);
    s.players[2].shares[0] = 100;
    standBefore(s, sq);
    // サイコロが 1 になる種を探す
    for (let seed = 0; seed < 500; seed++) {
      const t = structuredClone(s);
      t.rng = seed;
      const u = apply(t, { type: 'roll' });
      if (u.dice === 1) { s = t; break; }
    }
    const before = s.players[2].cash;
    const f = fee(s, sq);
    const after = apply(s, { type: 'roll' });
    expect(after.players[2].cash - before).toBe(50 + Math.round(f * 0.1));
  });
  it('銀行に寄らないと買えない', () => {
    const s = game();
    s.phase = 'stock';
    expect(() => apply(s, { type: 'buyStock', street: 0, lots: 1 })).toThrow();
    s.bankTouched = true;
    const t = apply(s, { type: 'buyStock', street: 0, lots: 1 });
    expect(t.players[0].shares[0]).toBe(10);
    expect(t.demand[0]).toBeCloseTo(1.02);
  });
});

describe('買収', () => {
  it('4 倍で買い、7 割が持ち主へ', () => {
    const s = game();
    const [a] = shopsOf(s, 2);
    own(s, a, 1);
    s.players[0].cash = 5000;
    s.phase = 'decide';
    s.pending = { kind: 'buyout', sq: a };
    const v = s.props[a]!.value;
    const t = apply(s, { type: 'buyout' });
    expect(t.props[a]!.owner).toBe(0);
    expect(t.players[0].cash).toBe(5000 - v * 4);
    expect(t.players[1].cash).toBe(s.players[1].cash + v * 4 * 0.7);
  });
  it('独占された通りの店は買収できない', () => {
    const s = game();
    for (const q of shopsOf(s, 2)) own(s, q, 1);
    s.players[0].cash = 99999;
    expect(canBuyout(s, shopsOf(s, 2)[0], 0)).toBe(false);
  });
});

describe('昇格と勝利', () => {
  it('スタンプ 4 つで銀行に戻ると昇格して給料', () => {
    let s = game();
    s.players[0].stamps = [true, true, true, true];
    standBefore(s, 0);
    const cash = s.players[0].cash;
    s = apply(s, { type: 'roll' });
    expect(s.players[0].level).toBe(1);
    expect(s.players[0].cash).toBeGreaterThanOrEqual(cash + salary(1) - 200);
    expect(salary(1)).toBe(260);
  });
  it('目標に届いて銀行を通ると勝ち', () => {
    let s = game();
    s.players[0].cash = 9000;
    standBefore(s, 0);
    s = apply(s, { type: 'roll' });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
    expect(s.overReason).toBe('target');
  });
});

describe('破産', () => {
  it('お店（75%）→株の順に売り、足りなければ破産して終了', () => {
    const s = game();
    const sq = shopsOf(s, 3)[0];
    own(s, sq, 1);
    s.props[sq]!.value = 2000;
    const mine = shopsOf(s, 0)[0];
    own(s, mine, 0);
    s.players[0].cash = 0;
    standBefore(s, sq);
    let found = false;
    for (let seed = 0; seed < 500 && !found; seed++) {
      const t = structuredClone(s);
      t.rng = seed;
      const u = apply(t, { type: 'roll' });
      if (u.dice !== 1) continue;
      found = true;
      expect(u.props[mine]!.owner).toBeNull();
      expect(u.players[0].bankrupt).toBe(true);
      expect(u.phase).toBe('over');
      expect(u.overReason).toBe('bankrupt');
      expect(u.winner).toBe(1);
    }
    expect(found).toBe(true);
  });
});

describe('CPU だけで 100 試合', () => {
  it('例外・無限ループ・お金の矛盾がない', { timeout: 180_000 }, () => {
    const reasons: Record<string, number> = {};
    for (let g = 0; g < 100; g++) {
      const mapId = MAPS[g % 3].id;
      const mode = g % 4 === 0 ? 'easy' : 'normal';
      const levels = (['easy', 'normal', 'hard'] as const);
      let s = newGame({
        mapId, mode, seed: 1000 + g, maxRounds: 80,
        players: [0, 1, 2, 3].map((i) => ({ name: `CPU${i}`, cpu: levels[(g + i) % 3] })),
      });
      let steps = 0;
      while (s.phase !== 'over') {
        s = apply(s, decide(s));
        if (++steps > 20000) throw new Error(`game ${g} が終わらない`);
        for (const p of s.players) {
          if (!p.bankrupt) expect(p.cash).toBeGreaterThanOrEqual(0);
          for (const n of p.shares) expect(n % 10 === 0 && n >= 0 && n <= 500).toBe(true);
        }
        for (const d of s.demand) expect(d >= 0.5 - 1e-9 && d <= 1.8 + 1e-9).toBe(true);
        s.props.forEach((pr, i) => {
          if (pr?.owner != null && getMap(mapId).squares[i].kind === 'shop') {
            expect(pr.value).toBeLessThanOrEqual(getMap(mapId).squares[i].base! * 3);
          }
        });
      }
      expect(s.winner).not.toBeNull();
      expect(netWorth(s, s.winner!)).toBeGreaterThan(0);
      reasons[s.overReason!] = (reasons[s.overReason!] ?? 0) + 1;
    }
    console.log('終わり方', reasons);
  });
});

describe('分かれ道', () => {
  // サイコロの目が n になる乱数の種を探す
  const withDice = (s: GameState, n: number) => {
    for (let seed = 0; seed < 1000; seed++) {
      const t = structuredClone(s);
      t.rng = seed;
      if (apply(t, { type: 'roll' }).dice === n) return t;
    }
    throw new Error('not found');
  };
  it('分かれ道で止まって方向を選び、残りの歩数だけ進む', () => {
    const m = getMap('corner');
    const fork = m.squares.find((q) => m.links[q.id].length === 3 && q.y === 0)!; // 上の分かれ道（パンのスタンプ）
    let s = game();
    const before = m.links[fork.id].find((v) => m.squares[v].y === 0 && m.squares[v].x < fork.x)!;
    s.players[0].pos = before;
    s.players[0].prev = m.links[before].find((v) => v !== fork.id)!;
    s = withDice(s, 3);
    s = apply(s, { type: 'roll' });
    expect(s.phase).toBe('decide');
    expect(s.pending).toMatchObject({ kind: 'direction', sq: fork.id });
    const opts = (s.pending as { options: number[] }).options;
    expect(opts).toHaveLength(2);
    expect(opts).not.toContain(before); // 後ろには戻れない
    expect(() => apply(s, { type: 'move', to: before })).toThrow();
    const down = opts.find((v) => m.squares[v].y === 1)!;
    const t = apply(s, { type: 'move', to: down });
    expect(t.players[0].pos).toBe(m.links[down].find((v) => v !== fork.id));
    expect(t.players[0].prev).toBe(down);
    expect(t.moving).toBeNull();
  });
  it('はじめの銀行では、どちらへも進める（来た方向がない）', () => {
    let s = withDice(game(), 1);
    s = apply(s, { type: 'roll' });
    expect(s.pending).toMatchObject({ kind: 'direction', sq: 0, options: [1, 7] });
    s = apply(s, { type: 'move', to: 7 });
    expect(s.players[0].pos).toBe(7);
  });
});
