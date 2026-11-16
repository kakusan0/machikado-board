// 2D の盤面（CSS グリッド）
import { getMap, squareXY } from '../game/maps';
import { fee, netWorth } from '../game/rules';
import type { GameState } from '../game/state';
import { FACILITY_NAMES, STAMP_NAMES } from '../game/state';
import { CARDS } from '../game/cards';
import { h, g } from './dom';

export const STAMP_ICONS = ['🍞', '🌸', '📖', '🔑'];

export interface BoardView {
  tokens?: number[]; // 演出中のコマの位置（なければ state の位置）
  selected: number | null;
  onSelect: (sq: number) => void;
  message?: string;
}

export function renderBoard(s: GameState, v: BoardView): HTMLElement {
  const map = getMap(s.mapId);
  const n = map.grid;
  const board = h('div', { class: `board grid-${n}`, style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
  map.squares.forEach((sq) => {
    const [x, y] = squareXY(n, sq.id);
    const pr = s.props[sq.id];
    const owner = pr?.owner != null ? s.players[pr.owner] : null;
    const street = sq.street != null ? map.streets[sq.street] : null;
    let icon = '';
    let sub = '';
    if (sq.kind === 'bank') { icon = '🏦'; sub = '銀行'; }
    if (sq.kind === 'stamp') { icon = STAMP_ICONS[sq.stamp!]; sub = STAMP_NAMES[sq.stamp!]; }
    if (sq.kind === 'chance') { icon = '？'; sub = 'チャンス'; }
    if (sq.kind === 'plaza') { icon = '⛲'; sub = '広場'; }
    if (sq.kind === 'lot') {
      icon = pr?.facility === 'yatai' ? '🏮' : pr?.facility === 'ryogae' ? '💱' : '🌱';
      sub = pr?.facility ? FACILITY_NAMES[pr.facility] : s.mode === 'easy' ? 'チャンス' : '空き地';
    }
    const cell = h('button', {
      class: `sq k-${sq.kind}${owner ? ' owned' : ''}${v.selected === sq.id ? ' sel' : ''}`,
      style: {
        gridColumn: String(x + 1), gridRow: String(y + 1),
        '--street': street?.color ?? 'transparent', '--owner': owner?.color ?? 'transparent',
      },
      title: sq.name,
      'aria-label': sq.name,
      onclick: () => v.onSelect(sq.id),
    },
    street ? h('span', { class: 'strip' }) : null,
    sq.kind === 'shop'
      ? [h('span', { class: 'nm' }, sq.name), h('span', { class: 'val' }, g(pr!.value)),
        owner ? h('span', { class: 'fee' }, `利用料 ${fee(s, sq.id)}`) : h('span', { class: 'fee vacant' }, '空き店舗')]
      : [h('span', { class: 'ic' }, icon), h('span', { class: 'nm' }, sub)],
    owner?.closed ? h('span', { class: 'closed' }, '休') : null,
    );
    board.append(cell);
  });

  // コマ
  const pos = v.tokens ?? s.players.map((p) => p.pos);
  s.players.forEach((p, i) => {
    if (p.bankrupt) return;
    const [x, y] = squareXY(n, pos[i]);
    const same = s.players.filter((q, j) => j < i && !q.bankrupt && pos[j] === pos[i]).length;
    board.append(h('span', {
      class: `token${i === s.turn ? ' now' : ''}`,
      style: {
        gridColumn: String(x + 1), gridRow: String(y + 1), background: p.color,
        translate: `${-(same % 2) * 12}px ${-Math.floor(same / 2) * 12}px`,
      },
      'aria-label': `${p.name} のコマ`,
    }, p.name.slice(0, 1)));
  });

  // 中央
  const card = s.lastCard != null ? CARDS[s.lastCard] : null;
  const leader = [...s.players].sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id))[0];
  board.append(h('div', { class: 'center', style: { gridColumn: `2 / ${n}`, gridRow: `2 / ${n}` } },
    h('div', { class: 'title' }, map.name),
    h('div', { class: 'target' }, `目標 ${g(map.target)}・${s.round} 周目`),
    s.dice ? h('div', { class: 'dice', 'aria-label': `サイコロ ${s.dice}` }, '⚀⚁⚂⚃⚄⚅'[s.dice - 1]) : null,
    card ? h('div', { class: 'card' }, h('b', {}, card.title), h('span', {}, card.text)) : null,
    v.message ? h('div', { class: 'msg' }, v.message) : null,
    h('div', { class: 'lead' }, `トップ：${leader.name} ${g(netWorth(s, leader.id))}`),
  ));
  return board;
}
