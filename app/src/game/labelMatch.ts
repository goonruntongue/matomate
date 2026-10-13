// Fix 1: how close a player's label is to the model label (no AI).
//   match → same meaning: the model label, one of its listed alternatives, or one of its parts
//           ("切る・貼る" → "切る"), after normalisation
//   close → near: one contains the other (≥2 characters), or the spelling is very similar
//   none  → different wording (which can still be a fine label — it just earns no bonus)
import { LABEL_ALIASES } from '../data/labelAliases';

export type LabelMatch = 'match' | 'close' | 'none' | 'empty';

/** NFKC, lower case, katakana → hiragana, and no spaces or separators. */
export function normalizeLabel(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･,、。.／/|｜\-‐–—_〜~()（）「」『』【】[\]]/g, '');
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Dice coefficient over character bigrams (0..1). */
function similarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  const pool = [...B];
  let hit = 0;
  for (const g of A) {
    const i = pool.indexOf(g);
    if (i >= 0) {
      hit++;
      pool.splice(i, 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

/** The model label, its listed alternatives and its parts, all normalised. */
export function acceptedLabels(problemId: string, modelLabel: string): string[] {
  const parts = modelLabel.split(/[・／/]/).filter((p) => p.length >= 2 || modelLabel.length <= 2);
  const list = [modelLabel, ...parts, ...(LABEL_ALIASES[problemId]?.[modelLabel] ?? [])];
  return [...new Set(list.map(normalizeLabel).filter(Boolean))];
}

export function matchLabel(problemId: string, modelLabel: string, label: string): LabelMatch {
  const mine = normalizeLabel(label);
  if (!mine) return 'empty';
  const accepted = acceptedLabels(problemId, modelLabel);
  if (accepted.includes(mine)) return 'match';
  const close = accepted.some(
    (ok) => (mine.length >= 2 && ok.length >= 2 && (mine.includes(ok) || ok.includes(mine))) || similarity(mine, ok) >= 0.5,
  );
  return close ? 'close' : 'none';
}
