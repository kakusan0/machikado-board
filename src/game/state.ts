export type Mode = 'easy' | 'normal';
export type CpuLevel = 'easy' | 'normal' | 'hard';
export type Facility = 'yatai' | 'ryogae';
export type SquareKind = 'bank' | 'shop' | 'stamp' | 'chance' | 'plaza' | 'lot';

export interface Square {
  id: number;
  kind: SquareKind;
  name: string;
  street?: number; // shop のとき
  base?: number; // shop / lot の基本価格
  stamp?: number; // 0..3（パン・花・本・鍵）
}

export interface Street {
  name: string;
  color: string;
}

export interface GameMap {
  id: string;
  name: string;
  grid: number; // 盤は grid×grid の外周
  target: number; // 目標の総資産
  startCash: number;
  streets: Street[];
  squares: Square[];
}

export interface Player {
  id: number;
  name: string;
  color: string;
  cpu: CpuLevel | null; // null は人
  cash: number;
  pos: number;
  stamps: boolean[]; // 4 種
  level: number; // 昇格の回数
  shares: number[]; // 通りごとの持ち株
  closed: boolean; // 広場・臨時休業：次の自分の番まで利用料が入らない
  bankrupt: boolean;
}

export interface Property {
  owner: number | null;
  value: number;
  facility?: Facility;
}

export type Pending =
  | { kind: 'buyShop'; sq: number }
  | { kind: 'invest'; sq: number }
  | { kind: 'buyout'; sq: number }
  | { kind: 'buyLot'; sq: number };

export type Phase = 'roll' | 'decide' | 'stock' | 'over';

export interface LogEntry {
  round: number;
  player: number | null;
  text: string;
}

export interface GameState {
  version: 1;
  mapId: string;
  mode: Mode;
  rng: number;
  players: Player[];
  props: (Property | null)[]; // マスごと（店・空き地のみ）
  demand: number[]; // 通りごとの需給（0.5〜1.8）
  turn: number;
  round: number;
  maxRounds: number;
  phase: Phase;
  pending: Pending | null;
  bankTouched: boolean; // この番に銀行を通った・止まった
  exchangeTouched: boolean; // この番に両替所に止まった
  dice: number | null;
  path: number[]; // 直前の移動経路（画面の演出用）
  deck: number[]; // チャンスカードの山（カード番号）
  lastCard: number | null;
  log: LogEntry[];
  winner: number | null;
  overReason: 'target' | 'bankrupt' | 'rounds' | null;
}

export type Action =
  | { type: 'roll' }
  | { type: 'buyShop' }
  | { type: 'invest'; sq: number; amount: number }
  | { type: 'buyout' }
  | { type: 'buyLot'; facility: Facility }
  | { type: 'skip' }
  | { type: 'buyStock'; street: number; lots: number }
  | { type: 'sellStock'; street: number; lots: number }
  | { type: 'endTurn' };

export const STAMP_NAMES = ['パン', '花', '本', '鍵'] as const;
export const FACILITY_NAMES: Record<Facility, string> = { yatai: '屋台村', ryogae: '両替所' };
