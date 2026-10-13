// Local grading (no AI): best one-to-one matching of trays to reference groups, then stars.
import { alsoRight } from '../data/flexibleItems';
import { PROBLEMS } from '../data/problems';
import { labelIssues } from '../hints/labelRules';
import { matchLabel, type LabelMatch } from './labelMatch';
import type { Item, Tray } from '../state/store';

/** Reference group index encoded in the item id (`<problem>-<group>-<index>`). */
export function refGroupOf(itemId: string): number {
  const parts = itemId.split('-');
  return Number(parts[parts.length - 2]);
}

export interface GradedItem {
  id: string;
  text: string;
  ok: boolean;
  /** Fix 2: this keyword honestly fits two boxes; either one counts as right. */
  flexible: boolean;
  /** Where the reference puts it (tray id matched to its group), when wrong. */
  shouldTrayId: string | null;
}

export interface GradedTray {
  trayId: string;
  label: string;
  modelLabel: string;
  /** How close the player's label is to the model label (fix 1). */
  labelMatch: LabelMatch;
  items: GradedItem[];
}

export interface Grade {
  correct: number;
  total: number;
  stars: number;
  /** Stars before deductions (from accuracy alone). */
  rawStars: number;
  /** Rounds that used "おまかせ" are practice: they never earn stars. */
  practice: boolean;
  notes: string[];
  trays: GradedTray[];
  wrongIds: string[];
}

function permutations<T>(list: T[]): T[][] {
  if (list.length <= 1) return [list];
  return list.flatMap((head, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [head, ...rest]));
}

export function grade(input: {
  problemIndex: number;
  items: Item[];
  trays: Tray[];
  assign: Record<string, string | null>;
  labelsRequired: boolean;
  axisHintShown: boolean;
  assistUsed: { some: number; all: boolean };
}): Grade {
  const { items, trays, assign } = input;
  const problem = PROBLEMS[input.problemIndex];
  const groups = [...new Set(items.map((item) => refGroupOf(item.id)))];

  // An item is right in group g when g is its model group, or one of its "either box" groups (fix 2).
  const rightIn = (item: Item, g: number) => refGroupOf(item.id) === g || alsoRight(problem.id, item.text).includes(problem.groups[g].label);
  // count[t][j] = how many items in tray t would be right if tray t were group j
  const count = trays.map((tray) => groups.map((g) => items.filter((item) => assign[item.id] === tray.id && rightIn(item, g)).length));
  // Try every assignment of groups to trays (≤ 5! = 120) and keep the best.
  const slots = trays.map((_, i) => i);
  let best: number[] = [];
  let bestScore = -1;
  for (const perm of permutations(slots)) {
    // perm[j] = tray index for group j (only the first groups.length entries are used)
    const score = groups.reduce((sum, _, j) => sum + (perm[j] !== undefined ? count[perm[j]][j] : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = perm;
    }
  }
  const trayOfGroup = new Map<number, string>();
  groups.forEach((g, j) => {
    if (best[j] !== undefined) trayOfGroup.set(g, trays[best[j]].id);
  });
  const groupOfTray = new Map<string, number>();
  trayOfGroup.forEach((trayId, g) => groupOfTray.set(trayId, g));

  const gradedTrays: GradedTray[] = trays.map((tray) => {
    const g = groupOfTray.get(tray.id);
    return {
      trayId: tray.id,
      label: tray.label.trim(),
      modelLabel: g !== undefined ? problem.groups[g].label : '—',
      labelMatch: g !== undefined ? matchLabel(problem.id, problem.groups[g].label, tray.label) : 'none',
      items: items
        .filter((item) => assign[item.id] === tray.id)
        .map((item) => {
          const ok = g !== undefined && rightIn(item, g);
          const flexible = alsoRight(problem.id, item.text).length > 0;
          return { id: item.id, text: item.text, ok, flexible, shouldTrayId: ok ? null : (trayOfGroup.get(refGroupOf(item.id)) ?? null) };
        }),
    };
  });

  const total = items.length;
  const correct = Math.max(0, bestScore);
  const accuracy = total ? correct / total : 0;
  const rawStars = accuracy >= 1 ? 3 : accuracy >= 0.8 ? 2 : accuracy >= 0.6 ? 1 : 0;
  let stars = rawStars;
  const notes: string[] = [];

  const labels = trays.map((tray) => tray.label);
  const labelWarn = trays.some((tray, i) =>
    labelIssues(
      tray.label,
      items.filter((item) => assign[item.id] === tray.id).map((item) => item.text),
      labels.filter((_, j) => j !== i),
    ).some((issue) => issue.level === 'warn'),
  );

  // Label bonus (fix 1): labels with the model's meaning (or close to it) on at least half the
  // matched trays lift ★1–2 by one. Not with label warnings (e.g. the same label everywhere).
  const matched = gradedTrays.filter((t) => t.modelLabel !== '—');
  const near = matched.filter((t) => t.labelMatch === 'match' || t.labelMatch === 'close').length;
  if (matched.length && near * 2 >= matched.length && !labelWarn) {
    if (stars >= 1 && stars < 3) {
      stars += 1;
      notes.push(`ラベルボーナス ★+1：模範と同じ意味・近いラベルが ${near}/${matched.length} 箱`);
    } else if (stars === 3 && near === matched.length) {
      notes.push('ラベルもすべて模範と同じ意味です。お見事！');
    }
  }

  if (input.labelsRequired) {
    if (labelWarn && stars > 2) {
      stars = 2;
      notes.push('ラベルに注意（「その他」や重複など）が残っているので最大★2です');
    }
  }
  if (input.axisHintShown && stars > 0) {
    stars -= 1;
    notes.push('切り口ヒントを使ったので★−1');
  }
  const practice = input.assistUsed.all || input.assistUsed.some > 0;
  if (practice) {
    stars = 0;
    notes.push('おまかせ仕分けを使った回は、練習扱いで星は付きません');
  }

  return {
    correct,
    total,
    stars,
    rawStars,
    practice,
    notes,
    trays: gradedTrays,
    wrongIds: gradedTrays.flatMap((t) => t.items.filter((i) => !i.ok).map((i) => i.id)),
  };
}
