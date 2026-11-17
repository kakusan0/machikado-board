import './style.css';
import { decide } from './game/ai';
import { MAPS } from './game/maps';
import type { Action, CpuLevel, GameState, Mode } from './game/state';
import { apply, newGame } from './game/turn';
import { renderBoard, type BoardView } from './ui/board2d';
import { createBoard3D, DETAIL_NAMES, DICE_MS, type Board3D, type Detail } from './ui/board3d';
import { h } from './ui/dom';
import { renderActions, renderInfo, renderLog, renderPlayers, renderStocks } from './ui/panels';

const SAVE_KEY = 'machikado-board/save-v1';
const SETTINGS_KEY = 'machikado-board/settings-v1';
const app = document.getElementById('app')!;

interface Settings { mapId: string; mode: Mode; cpu: CpuLevel; name: string; fast: boolean; view: '2d' | '3d'; detail: Detail }
const phone = window.matchMedia('(max-width: 600px)').matches;
const defaults: Settings = { mapId: 'corner', mode: 'normal', cpu: 'normal', name: 'あなた', fast: false, view: '3d', detail: phone ? 'mid' : 'high' };

function load<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function store(key: string, v: unknown) {
  try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* 保存できなくても遊べる */ }
}

let settings: Settings = { ...defaults, ...(load<Settings>(SETTINGS_KEY) ?? {}) };
let state: GameState | null = null;
let tokens: number[] | undefined;
let selected: number | null = null;
let busy = false;
let timer: number | undefined;
let board3d: Board3D | null = null;
let no3d = false; // WebGL が使えない端末

function get3d(): Board3D | null {
  if (no3d) return null;
  if (!board3d) {
    board3d = createBoard3D(settings.detail);
    if (!board3d) no3d = true;
  }
  return board3d;
}
const use3d = () => settings.view === '3d' && !!get3d();

const delay = (ms: number) => new Promise((r) => { timer = window.setTimeout(r, settings.fast ? ms / 3 : ms); });

async function act(a: Action) {
  if (!state || busy) return;
  const prev = state;
  let next: GameState;
  try { next = apply(prev, a); } catch (e) { console.warn(e); return; }
  if (a.type === 'roll' || a.type === 'move') {
    // コマを 1 マスずつ動かす
    busy = true;
    state = { ...prev, dice: next.dice, pending: null };
    if (a.type === 'roll' && use3d()) {
      // 3D はサイコロが転がって止まるのを見せてからコマを動かす
      render();
      await delay(DICE_MS + 150);
    }
    const path = next.path.slice(1);
    // 分かれ道で止まった（まだ歩いていない）ときは、止まる前のマスまで見せる
    for (const sq of path) {
      tokens = prev.players.map((p, i) => (i === prev.turn ? sq : p.pos));
      render();
      await delay(170);
    }
    tokens = undefined;
    busy = false;
  }
  state = next;
  store(SAVE_KEY, state.phase === 'over' ? null : state);
  render();
  void cpuStep();
}

async function cpuStep() {
  if (!state || state.phase === 'over' || busy) return;
  const p = state.players[state.turn];
  if (!p.cpu) return;
  await delay(state.phase === 'roll' ? 650 : 450);
  if (!state || busy) return;
  await act(decide(state));
}

function render() {
  if (!state) return renderSetup();
  const s = state;
  const view = h('div', { class: 'game' },
    h('header', { class: 'top' },
      h('b', {}, 'まちかど商店街ボード'),
      h('span', { class: 'mode' }, s.mode === 'easy' ? 'かんたん' : 'ふつう'),
      h('div', { class: 'seg', role: 'group', 'aria-label': '盤面の表示' },
        (['2d', '3d'] as const).map((v) => h('button', {
          class: `btn sm${settings.view === v ? ' on' : ''}`, 'aria-pressed': String(settings.view === v),
          onclick: () => { settings.view = v; store(SETTINGS_KEY, settings); render(); },
        }, v.toUpperCase()))),
      settings.view === '3d' && !no3d ? h('label', { class: 'detail' }, '細かさ ',
        h('select', { onchange: (e: Event) => {
          settings.detail = (e.target as HTMLSelectElement).value as Detail; store(SETTINGS_KEY, settings);
          board3d?.setDetail(settings.detail); render();
        } }, (Object.keys(DETAIL_NAMES) as Detail[]).map((d) => h('option', { value: d, selected: settings.detail === d }, DETAIL_NAMES[d])))) : null,
      h('label', { class: 'fast' }, h('input', { type: 'checkbox', checked: settings.fast, onchange: (e: Event) => {
        settings.fast = (e.target as HTMLInputElement).checked; store(SETTINGS_KEY, settings);
      } }), ' 早送り'),
      h('a', { href: '/rules.html', target: '_blank', rel: 'noopener', class: 'link' }, '遊び方'),
      h('button', { class: 'btn sm', onclick: () => {
        if (s.phase !== 'over' && !confirm('いまのゲームをやめてタイトルに戻りますか？（途中経過は消えます）')) return;
        window.clearTimeout(timer); busy = false; state = null; store(SAVE_KEY, null); render();
      } }, 'やめる')),
    h('main', { class: 'layout' },
      h('div', { class: 'board-wrap' }, boardEl(s)),
      h('div', { class: 'side' },
        renderActions(s, act, busy),
        renderInfo(s, selected),
        renderPlayers(s),
        renderStocks(s, act, busy),
        renderLog(s))));
  app.replaceChildren(view);
}

function boardEl(s: GameState): HTMLElement {
  const human = !s.players[s.turn].cpu && !busy;
  const choices = human && s.pending?.kind === 'direction' ? s.pending.options : undefined;
  const v: BoardView = { tokens, selected, choices, onSelect: (sq) => {
    if (choices?.includes(sq)) { void act({ type: 'move', to: sq }); return; }
    selected = selected === sq ? null : sq; render();
  } };
  if (settings.view === '3d') {
    const b = get3d();
    if (b) {
      b.update(s, v);
      return b.el;
    }
    return h('div', {}, h('p', { class: 'notice' }, 'この端末では 3D の盤面を表示できないため、2D で表示しています。'), renderBoard(s, v));
  }
  return renderBoard(s, v);
}

function renderSetup() {
  const saved = load<GameState>(SAVE_KEY);
  const radio = <K extends keyof Settings>(key: K, value: Settings[K], label: string, sub: string) =>
    h('label', { class: 'opt' },
      h('input', { type: 'radio', name: key, checked: settings[key] === value, onchange: () => { settings[key] = value; } }),
      h('span', {}, h('b', {}, label), h('small', {}, sub)));
  const name = h('input', { type: 'text', value: settings.name, maxlength: '8', 'aria-label': 'あなたの名前' });
  app.replaceChildren(h('div', { class: 'setup' },
    h('h1', {}, 'まちかど商店街ボード'),
    h('p', { class: 'lead' }, 'お店を買って、増資して、株で稼いで。目標の総資産に届いたら銀行へ戻ろう。'),
    saved ? h('button', { class: 'btn primary big', onclick: () => { state = saved; render(); void cpuStep(); } },
      `つづきから（${saved.round} 周目）`) : null,
    h('fieldset', {}, h('legend', {}, 'マップ'),
      MAPS.map((m) => radio('mapId', m.id, m.name, `${m.squares.length} マス・目標 ${m.target.toLocaleString()}G`))),
    h('fieldset', {}, h('legend', {}, 'モード'),
      radio('mode', 'normal', 'ふつう', '通り・株・買収・空き地あり'),
      radio('mode', 'easy', 'かんたん', '株なし。隣どうしのお店をそろえると利用料アップ')),
    h('fieldset', {}, h('legend', {}, 'コンピューターの強さ'),
      radio('cpu', 'easy', 'やさしい', ''), radio('cpu', 'normal', 'ふつう', ''), radio('cpu', 'hard', 'つよい', '')),
    h('label', { class: 'name' }, 'あなたの名前 ', name),
    h('button', { class: 'btn primary big', onclick: () => {
      settings.name = name.value.trim() || 'あなた';
      store(SETTINGS_KEY, settings);
      const cpuNames = ['ミナト', 'サクラ', 'ホシノ'];
      state = newGame({
        mapId: settings.mapId, mode: settings.mode, seed: (Math.random() * 2 ** 31) | 0,
        players: [{ name: settings.name, cpu: null }, ...cpuNames.map((n) => ({ name: n, cpu: settings.cpu }))],
      });
      selected = null;
      store(SAVE_KEY, state);
      render();
    } }, saved ? 'あたらしく始める' : 'はじめる'),
    h('a', { href: '/rules.html', class: 'link rules-link' }, '遊び方を見る'),
    h('p', { class: 'build' }, `版：${__BUILD__}`)));
}

render();
if (state) void cpuStep();
