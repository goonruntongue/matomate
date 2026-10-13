// Level-up mode: small steps from "6 blocks, 2 boxes of 3" to fully random boards.
// Scaffolds are removed one at a time: equal sizes → unequal sizes → hidden capacities → random counts.
// (No store import: the store imports this module.)
const MIN_TRAYS = 3;
const MAX_TRAYS = 5;

export interface LevelDef {
  level: number;
  title: string;
  /** Fixed block count per box (in tray order before shuffling), or null for a random board. */
  sizes: number[] | null;
  /** For random-size levels: total blocks and number of boxes (null = random total too). */
  total?: number | null;
  trays?: number;
  showCapacity: boolean;
  labelsRequired: boolean;
  goal: string;
}

export const MAX_LEVEL = 10;
export const STARS_TO_LEVEL_UP = 5;

export const LEVELS: LevelDef[] = [
  { level: 1, title: 'はじめの一歩', sizes: [3, 3], showCapacity: true, labelsRequired: true, goal: '6個を2つの箱に3個ずつ分けて、箱に名前を付けよう' },
  { level: 2, title: '3つに分ける', sizes: [3, 3, 3], showCapacity: true, labelsRequired: true, goal: '9個を3つの箱に3個ずつ分けて、名前を付けよう' },
  { level: 3, title: '伝わる名前', sizes: [3, 3, 3], showCapacity: true, labelsRequired: true, goal: 'お題の人がひと目でわかる名前に。模範に近い名前なら★ボーナス' },
  { level: 4, title: '少し大きな箱', sizes: [4, 4, 4], showCapacity: true, labelsRequired: true, goal: '12個を、3つの箱に4個ずつ分けよう' },
  { level: 5, title: '箱が増える', sizes: [3, 3, 3, 3], showCapacity: true, labelsRequired: true, goal: '12個を、4つの箱に3個ずつ分けよう' },
  { level: 6, title: '大きさがばらばら', sizes: [5, 4, 3], showCapacity: true, labelsRequired: true, goal: '箱ごとに入る数が違います。定員を手がかりに分けよう' },
  { level: 7, title: 'ばらばらの4箱', sizes: [5, 4, 3, 3], showCapacity: true, labelsRequired: true, goal: '15個を、大きさの違う4つの箱に分けよう' },
  { level: 8, title: '定員なし', sizes: null, total: 18, trays: 4, showCapacity: false, labelsRequired: true, goal: '箱の定員は隠れています。18個を4つの箱に分けよう' },
  { level: 9, title: '5つの箱', sizes: null, total: 24, trays: 5, showCapacity: false, labelsRequired: true, goal: '24個を5つの箱に。中身の数は自分で見極めよう' },
  { level: 10, title: '最終試験', sizes: null, total: null, showCapacity: false, labelsRequired: true, goal: '最終試験。数も大きさもランダムです。★を5つ集めればクリア！' },
];

/**
 * Titles (二つ名) per level, one consistent lineage: apprentice mage → mage → sorcerer → magus → sage → grand sage.
 * Reaching Lv10 makes you a candidate; clearing the Lv10 final exam earns the 👑 badge.
 */
export const TITLES = [
  'IA見習い魔法使い',
  '仕分けの魔法使い',
  '名付けの魔法使い',
  '整理の魔術師',
  '分類の魔術師',
  '構造の魔導士',
  'ラベルの魔導士',
  '情報の賢者見習い',
  '情報設計の賢者',
  'IA大賢者',
] as const;

/** Earned by passing the Lv10 final exam (★5); one rank above the Lv10 title. */
export const LEGEND_TITLE = '伝説のIA大賢者';

export function titleFor(level: number): string {
  return TITLES[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];
}

export function levelDef(level: number): LevelDef {
  return LEVELS[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Split n into k parts as evenly as possible (e.g. 10, 3 → [4, 3, 3]). */
export function balancedSizes(n: number, k: number): number[] {
  return Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
}

/** Random split of n into k parts, each 3–6 (templates hold 6 per group). */
export function randomSizes(n: number, k: number): number[] {
  const sizes = Array.from({ length: k }, () => 3);
  let rest = n - 3 * k;
  while (rest > 0) {
    const open = sizes.map((s, i) => (s < 6 ? i : -1)).filter((i) => i >= 0);
    if (!open.length) break;
    sizes[open[Math.floor(Math.random() * open.length)]]++;
    rest--;
  }
  return shuffle(sizes);
}

/** Group sizes for a new board at this level. */
export function sizesForLevel(level: number): number[] {
  const def = levelDef(level);
  if (def.sizes) return shuffle(def.sizes);
  const total = def.total ?? 10 + Math.floor(Math.random() * 21);
  const trays = def.trays ?? Math.min(MAX_TRAYS, Math.max(MIN_TRAYS, Math.ceil(total / 6)));
  return randomSizes(total, trays);
}
