// 手番の操作・プレイヤー一覧・株式市場・ログ・マスの詳細
import { arrow, getMap } from '../game/maps';
import {
  BUYOUT_MULT, MAX_SHARES, buyQuote, canBuyout, fee, feeRate, investCap, isMonopoly, netWorth, salary,
  sellQuote, shopAssets, stockAssets, stockPrice, topHolder,
} from '../game/rules';
import type { Action, GameState } from '../game/state';
import { FACILITY_NAMES, STAMP_NAMES } from '../game/state';
import { canBuyStock, investOptions } from '../game/turn';
import { STAMP_ICONS } from './board2d';
import { h, g } from './dom';

export type Act = (a: Action) => void;

export interface PlayerExtras { status?: (pid: number) => string | null; bubble?: (pid: number) => string | null; you?: number }

export function renderPlayers(s: GameState, x: PlayerExtras = {}): HTMLElement {
  const map = getMap(s.mapId);
  return h('section', { class: 'panel players', 'aria-label': 'プレイヤー' },
    s.players.map((p) => {
      const nw = netWorth(s, p.id);
      return h('div', { class: `pl${p.id === s.turn ? ' now' : ''}${p.bankrupt ? ' out' : ''}`, style: { '--pc': p.color } },
        h('div', { class: 'row' },
          h('span', { class: 'dot' }),
          h('b', { class: 'pname' }, p.name, x.you === p.id ? h('small', { class: 'you' }, '（あなた）') : null),
          x.status?.(p.id) ? h('span', { class: 'status' }, x.status(p.id)) : null,
          h('span', { class: 'lv' }, `段階 ${p.level}`),
          h('span', { class: 'stamps', 'aria-label': 'スタンプ' },
            p.stamps.map((ok, i) => h('span', { class: ok ? 'on' : 'off', title: STAMP_NAMES[i] }, STAMP_ICONS[i]))),
        ),
        h('div', { class: 'row nums' },
          h('span', {}, '現金 ', h('b', {}, g(p.cash))),
          h('span', {}, '総資産 ', h('b', {}, g(nw))),
        ),
        x.bubble?.(p.id) ? h('div', { class: 'bubble', role: 'status' }, x.bubble(p.id)) : null,
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(Math.round(nw)), 'aria-valuemax': String(map.target) },
          h('i', { style: { width: `${Math.min(100, (nw / map.target) * 100)}%` } })),
      );
    }));
}

export function renderActions(s: GameState, act: Act, busy: boolean, mySeat = 0): HTMLElement {
  const map = getMap(s.mapId);
  const p = s.players[s.turn];
  const box = h('section', { class: 'panel actions', 'aria-live': 'polite' });
  if (s.phase === 'over') {
    const w = s.players[s.winner!];
    box.append(h('h2', {}, `${w.name}の勝ち！`),
      h('p', {}, s.overReason === 'target' ? '目標の総資産に届いて銀行に戻りました。'
        : s.overReason === 'bankrupt' ? 'だれかが破産したので、総資産で順位を決めました。' : '決められた周回が終わりました。'),
      h('ol', { class: 'rank' }, [...s.players].sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id))
        .map((x) => h('li', {}, `${x.name}　${g(netWorth(s, x.id))}`))));
    return box;
  }
  if (s.turn !== mySeat || busy) {
    box.append(h('p', { class: 'wait' }, `${p.name}の番です…`));
    return box;
  }
  const btn = (label: string, a: Action, cls = '', disabled = false) =>
    h('button', { class: `btn ${cls}`, disabled, onclick: () => act(a) }, label);

  if (s.phase === 'roll') {
    box.append(h('h2', {}, 'あなたの番'),
      h('p', {}, `スタンプ ${p.stamps.filter(Boolean).length}/4。そろえて銀行に戻ると給料 ${g(salary(p.level + 1))}。`),
      btn('サイコロを振る', { type: 'roll' }, 'primary big'));
  }
  if (s.phase === 'decide' && s.pending) {
    const sq = map.squares[s.pending.sq];
    const pr = s.props[sq.id]!;
    switch (s.pending.kind) {
      case 'direction': {
        const pend = s.pending;
        box.append(h('h2', {}, '分かれ道'),
          h('p', {}, `どちらへ進みますか？（あと ${s.moving?.left ?? 0} マス。来た道へは戻れません）盤面の光っているマスを押しても選べます。`),
          h('div', { class: 'btns dirs' }, pend.options.map((o) => {
            const q = map.squares[o];
            const owner = s.props[o]?.owner;
            const sub = q.kind === 'shop' ? (owner != null ? `${s.players[owner].name}のお店` : '空き店舗') : '';
            return btn(`${arrow(map, pend.sq, o)} ${q.name}${sub ? `（${sub}）` : ''}`, { type: 'move', to: o }, 'primary');
          })));
        break;
      }
      case 'buyShop':
        box.append(h('h2', {}, `${sq.name}（空き店舗）`),
          h('p', {}, `${map.streets[sq.street!]?.name ?? ''}・価格 ${g(pr.value)}。買うと、ほかの人が止まったとき利用料が入ります。`),
          h('div', { class: 'btns' }, btn(`${g(pr.value)} で買う`, { type: 'buyShop' }, 'primary', p.cash < pr.value), btn('見送る', { type: 'skip' })));
        break;
      case 'buyLot':
        box.append(h('h2', {}, '空き地'),
          h('p', {}, `${g(pr.value)} で施設を建てられます。屋台村：利用料 40G＋自分のお店 1 軒につき 15G。両替所：止まった人は株を買える（手数料 30G）。`),
          h('div', { class: 'btns' },
            btn('屋台村を建てる', { type: 'buyLot', facility: 'yatai' }, 'primary', p.cash < pr.value),
            btn('両替所を建てる', { type: 'buyLot', facility: 'ryogae' }, 'primary', p.cash < pr.value),
            btn('見送る', { type: 'skip' })));
        break;
      case 'buyout': {
        const owner = s.players[pr.owner!];
        const price = pr.value * BUYOUT_MULT;
        box.append(h('h2', {}, '買収しますか？'),
          h('p', {}, `${owner.name}の${sq.name}（価値 ${g(pr.value)}）を ${g(price)} で買い取れます。7 割は${owner.name}に、3 割は銀行に入ります。`),
          h('div', { class: 'btns' }, btn(`${g(price)} で買収`, { type: 'buyout' }, 'danger', !canBuyout(s, sq.id, p.id)), btn('見送る', { type: 'skip' })));
        break;
      }
      case 'invest': {
        const opts = investOptions(s);
        box.append(h('h2', {}, '増資できます'),
          h('p', {}, '同じ通りの自分のお店に増資すると、お店の価値・利用料・株価が上がります。'));
        for (const o of opts) {
          const q = map.squares[o.sq];
          const v = s.props[o.sq]!.value;
          const steps = [...new Set([Math.min(50, o.room), Math.round(o.room / 2), o.room])].filter((x) => x > 0);
          box.append(h('div', { class: 'invest' },
            h('div', {}, h('b', {}, q.name), ` ${g(v)} → 上限 ${g(investCap(s, o.sq))}`),
            h('div', { class: 'btns' }, steps.map((a) => btn(`+${g(a)}`, { type: 'invest', sq: o.sq, amount: a }, 'primary')))));
        }
        box.append(btn('増資しない', { type: 'skip' }));
        break;
      }
    }
  }
  if (s.phase === 'stock') {
    box.append(h('h2', {}, 'ターンの終わり'),
      h('p', {}, canBuyStock(s) ? '銀行に寄ったので、株を買えます（下の株式市場）。' : '株は売ることだけできます。買うには銀行に寄りましょう。'),
      btn('ターンを終える', { type: 'endTurn' }, 'primary big'));
  }
  return box;
}

export function renderStocks(s: GameState, act: Act, busy: boolean, mySeat = 0): HTMLElement | null {
  if (s.mode !== 'normal') return null;
  const map = getMap(s.mapId);
  const p = s.players[s.turn];
  const mine = s.turn === mySeat && !busy;
  const canBuy = mine && canBuyStock(s);
  const canSell = mine && (s.phase === 'stock' || s.phase === 'roll');
  const me = s.players[mySeat] ?? p;
  return h('section', { class: 'panel stocks', 'aria-label': '株式市場' },
    h('h2', {}, '株式市場'),
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, '通り'), h('th', {}, '株価'), h('th', {}, '需給'), h('th', {}, 'あなた'), h('th', {}, ''))),
      h('tbody', {}, map.streets.map((st, i) => {
        const top = topHolder(s, i);
        const buy = buyQuote(s, i, 1);
        const sell = me.shares[i] > 0 ? sellQuote(s, i, 1) : null;
        return h('tr', {},
          h('td', {}, h('span', { class: 'chip', style: { background: st.color } }), st.name,
            top != null ? h('small', { class: 'top', style: { color: s.players[top].color } }, ` 筆頭:${s.players[top].name}`) : null),
          h('td', { class: 'num' }, g(stockPrice(s, i))),
          h('td', { class: `num ${s.demand[i] > 1.005 ? 'up' : s.demand[i] < 0.995 ? 'down' : ''}` }, `×${s.demand[i].toFixed(2)}`),
          h('td', { class: 'num' }, `${me.shares[i]} 株`),
          h('td', { class: 'trade' },
            h('button', { class: 'btn sm', disabled: !canBuy || p.cash < buy.cost || p.shares[i] >= MAX_SHARES,
              title: `10 株 ${g(buy.cost)}`, onclick: () => act({ type: 'buyStock', street: i, lots: 1 }) }, '買う'),
            h('button', { class: 'btn sm', disabled: !canSell || !sell,
              title: sell ? `10 株 ${g(sell.gain)}` : '', onclick: () => act({ type: 'sellStock', street: i, lots: 1 }) }, '売る')),
        );
      }))),
    h('p', { class: 'note' }, '10 株単位。利用料が払われるたびに 2 株につき 1G の配当、筆頭株主（50 株以上）は利用料の 10%。'));
}

export function renderInfo(s: GameState, sqId: number | null): HTMLElement | null {
  if (sqId == null) return null;
  const map = getMap(s.mapId);
  const sq = map.squares[sqId];
  const pr = s.props[sqId];
  const lines: (string | HTMLElement)[] = [];
  if (sq.kind === 'shop') {
    const st = map.streets[sq.street!];
    const owner = pr!.owner != null ? s.players[pr!.owner] : null;
    lines.push(`${st.name}・基本価格 ${g(sq.base!)}・いまの価値 ${g(pr!.value)}`);
    if (owner) {
      lines.push(`持ち主 ${owner.name}・利用料 ${g(fee(s, sqId))}（${Math.round(feeRate(s, sqId) * 100)}%）`);
      if (s.mode === 'normal') {
        lines.push(`増資の上限 ${g(investCap(s, sqId))}${isMonopoly(s, sq.street!, owner.id) ? '（独占中）' : ''}`);
        lines.push(`買収価格 ${g(pr!.value * BUYOUT_MULT)}${isMonopoly(s, sq.street!, owner.id) ? '（独占中は買収できない）' : ''}`);
      }
    } else lines.push('空き店舗。止まると買えます。');
  } else if (sq.kind === 'lot' && pr) {
    lines.push(pr.owner != null ? `${s.players[pr.owner].name}の${FACILITY_NAMES[pr.facility!]}・利用料 ${g(fee(s, sqId))}` : `空き地。${g(pr.value)} で施設を建てられます。`);
  } else {
    const text: Record<string, string> = {
      bank: '通るか止まると、スタンプ 4 つで昇格・給料。総資産が目標に届いていれば勝ち。株も買えます。',
      stamp: '通るか止まるとスタンプがもらえます。',
      chance: 'チャンスカードを引きます。',
      plaza: '止まると、次の自分の番まで自分のお店がお休み（利用料が入らない）。',
      lot: 'かんたんモードではチャンスマスになります。',
    };
    lines.push(text[sq.kind] ?? '');
  }
  return h('section', { class: 'panel info' }, h('h2', {}, sq.name), lines.map((l) => h('p', {}, l)));
}

export function renderLog(s: GameState): HTMLElement {
  return h('section', { class: 'panel log', 'aria-label': 'できごと' },
    h('h2', {}, 'できごと'),
    h('ol', {}, s.log.slice(-40).reverse().map((e) => h('li', {
      style: { '--pc': e.player != null ? s.players[e.player].color : '#8890A8' },
    }, e.text))));
}

export function summary(s: GameState, pid: number) {
  return { cash: s.players[pid].cash, shops: shopAssets(s, pid), stocks: stockAssets(s, pid) };
}
