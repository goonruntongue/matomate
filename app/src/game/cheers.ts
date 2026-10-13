// One-line praise shown on a clear / level up. Picked once per result so the banner and the
// result panel always show the same line.
// The same lines are used for every topic (stores, chores, websites, ...), so keep them free of
// topic-specific words such as 売り場 or 棚.
import type { Grade } from './grading';

const BY_STARS: Record<1 | 2 | 3, string[]> = {
  3: [
    '完璧な仕分け！ これなら探す人が迷いません。',
    'どの言葉も、ちょうどいい居場所に収まりました。',
    '見る人の目線で分けられています。お見事！',
    'ラベルを見ただけで中身がわかる。理想の形です。',
    '情報が気持ちよく整いました。',
    'この箱なら、初めての人もすぐ見つけられます。',
  ],
  2: [
    'いい仕分け！ あと一歩で完璧です。',
    '迷いやすい言葉も、上手にさばけています。',
    '探す人の気持ちが見えてきましたね。',
    '軸がぶれていません。その調子！',
    'ラベルがぐっと伝わるようになりました。',
  ],
  1: [
    'クリア！ 分け方の軸が見えてきました。',
    '一歩前進。間違えた語は、次へのヒントです。',
    '模範と見比べると、もっと強くなれます。',
    'まずは形になりました。ここから磨いていきましょう。',
  ],
};

/** ★0: encouragement instead of praise. */
const CONSOLE = [
  'どんまい！ 赤く光るブロックを見てみよう。',
  'おしい挑戦！ 「だれが・何のため」をもう一度読んでみよう。',
  'ここからが練習本番。模範と見比べてみよう。',
];

/** Keyed by the level just reached. */
const LEVEL_UP: Record<number, string> = {
  2: '言葉を分ける魔法を覚えました。',
  3: '次は、箱に名前を与える力を磨きましょう。',
  4: '散らかった情報も、もう怖くありません。',
  5: '分け方の「軸」を操れるようになりました。',
  6: '情報の骨組みが見えるようになってきました。',
  7: 'ひと目で伝わる名前を生み出す力を得ました。',
  8: '賢者への道が、いま開けました。',
  9: '残るは最終試験のみ。あなたなら届きます。',
  10: '最終試験へ。★5つで、伝説の大賢者に。',
};

const picked = new WeakMap<Grade, string>();

/** The one-line comment for this result (praise, or encouragement on ★0); null in practice mode. */
export function cheerFor(result: Grade, levelUpTo: number | null): string | null {
  if (result.practice) return null;
  const cached = picked.get(result);
  if (cached) return cached;
  // "Perfect" praise only for a fully correct board (★3 can also come from the label bonus).
  const tier = result.stars >= 3 && result.correct < result.total ? 2 : (Math.min(3, result.stars) as 1 | 2 | 3);
  const pool = result.stars <= 0 ? CONSOLE : BY_STARS[tier];
  const line = (levelUpTo && LEVEL_UP[levelUpTo]) || pool[Math.floor(Math.random() * pool.length)];
  picked.set(result, line);
  return line;
}

/** The praise line for reaching a level (used by the debug preview). */
export function levelUpCheer(level: number): string | null {
  return LEVEL_UP[level] ?? null;
}
