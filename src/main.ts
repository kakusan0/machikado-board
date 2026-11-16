import './style.css';
import { decide } from './game/ai';
import { MAPS } from './game/maps';
import type { Action, CpuLevel, GameState, Mode } from './game/state';
import { apply, newGame } from './game/turn';
import { renderBoard } from './ui/board2d';
import { h } from './ui/dom';
import { renderActions, renderInfo, renderLog, renderPlayers, renderStocks } from './ui/panels';

const SAVE_KEY = 'machikado-board/save-v1';
const SETTINGS_KEY = 'machikado-board/settings-v1';
const app = document.getElementById('app')!;

interface Settings { mapId: string; mode: Mode; cpu: CpuLevel; name: string; fast: boolean }
const defaults: Settings = { mapId: 'corner', mode: 'normal', cpu: 'normal', name: 'あなた', fast: false };

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

const delay = (ms: number) => new Promise((r) => { timer = window.setTimeout(r, settings.fast ? ms / 3 : ms); });

async function act(a: Action) {
  if (!state || busy) return;
  const prev = state;
  let next: GameState;
  try { next = apply(prev, a); } catch (e) { console.warn(e); return; }
  if (a.type === 'roll') {
    // コマを 1 マスずつ動かす
    busy = true;
    state = { ...prev, dice: next.dice };
    for (const sq of next.path.slice(1)) {
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
      h('label', { class: 'fast' }, h('input', { type: 'checkbox', checked: settings.fast, onchange: (e: Event) => {
        settings.fast = (e.target as HTMLInputElement).checked; store(SETTINGS_KEY, settings);
      } }), ' 早送り'),
      h('a', { href: '/rules.html', target: '_blank', class: 'link' }, '遊び方'),
      h('button', { class: 'btn sm', onclick: () => {
        if (s.phase !== 'over' && !confirm('いまのゲームをやめてタイトルに戻りますか？（途中経過は消えます）')) return;
        window.clearTimeout(timer); busy = false; state = null; store(SAVE_KEY, null); render();
      } }, 'やめる')),
    h('main', { class: 'layout' },
      h('div', { class: 'board-wrap' }, renderBoard(s, { tokens, selected, onSelect: (sq) => { selected = selected === sq ? null : sq; render(); } })),
      h('div', { class: 'side' },
        renderActions(s, act, busy),
        renderInfo(s, selected),
        renderPlayers(s),
        renderStocks(s, act, busy),
        renderLog(s))));
  app.replaceChildren(view);
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
    } }, saved ? 'あたらしく始める' : 'はじめる')));
}

render();
if (state) void cpuStep();
