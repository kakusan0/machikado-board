// 2D の盤面（CSS グリッド）
import { arrow, getMap } from '../game/maps';
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
  choices?: number[]; // 分かれ道で選べるマス
  message?: string;
}

export function renderBoard(s: GameState, v: BoardView): HTMLElement {
  const map = getMap(s.mapId);
  const n = Math.max(map.width, map.height);
  const size = n >= 10 ? 10 : n >= 8 ? 8 : 6;
  const board = h('div', { class: `board grid-${size}`, style: {
    gridTemplateColumns: `repeat(${map.width}, 1fr)`, gridTemplateRows: `repeat(${map.height}, 1fr)`,
    aspectRatio: `${map.width} / ${map.height}`,
  } });
  // 道（つながっているマスの間の線）
  map.squares.forEach((sq) => map.links[sq.id].forEach((w) => {
    if (w < sq.id) return;
    const b = map.squares[w];
    board.append(h('span', { class: `road ${b.x !== sq.x ? 'h' : 'v'}`, style: {
      gridColumn: b.x !== sq.x ? `${sq.x + 1} / ${b.x + 2}` : String(sq.x + 1),
      gridRow: b.y !== sq.y ? `${sq.y + 1} / ${b.y + 2}` : String(sq.y + 1),
    } }));
  }));
  const choices = new Set(v.choices ?? []);
  map.squares.forEach((sq) => {
    const { x, y } = sq;
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
      class: `sq k-${sq.kind}${owner ? ' owned' : ''}${v.selected === sq.id ? ' sel' : ''}${choices.has(sq.id) ? ' choice' : ''}`,
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
    choices.has(sq.id) && s.pending?.kind === 'direction' ? h('span', { class: 'arrow' }, arrow(map, s.pending.sq, sq.id)) : null,
    );
    board.append(cell);
  });

  // コマ
  const pos = v.tokens ?? s.players.map((p) => p.pos);
  s.players.forEach((p, i) => {
    if (p.bankrupt) return;
    const { x, y } = map.squares[pos[i]];
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

  // 盤の上の帯（マップ名・サイコロ・カード）
  const card = s.lastCard != null ? CARDS[s.lastCard] : null;
  const leader = [...s.players].sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id))[0];
  const info = h('div', { class: 'board-info' },
    h('div', { class: 'row' },
      h('b', { class: 'title' }, map.name),
      h('span', {}, `目標 ${g(map.target)}・${s.round} 周目`),
      h('span', {}, `トップ：${leader.name} ${g(netWorth(s, leader.id))}`),
      s.dice ? h('span', { class: 'dice', 'aria-label': `サイコロ ${s.dice}` }, '⚀⚁⚂⚃⚄⚅'[s.dice - 1]) : null),
    card ? h('div', { class: 'card' }, h('b', {}, card.title), ' ', card.text) : null,
    v.message ? h('div', { class: 'msg' }, v.message) : null,
  );
  return h('div', { class: 'board2d' }, info, board);
}
