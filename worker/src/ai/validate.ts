// Checking a generated problem (SPEC 7.2 ③): shape and lengths with zod, then the rules a schema
// can't express — exact counts, no duplicates, no label word inside its own keywords, no group named
// in the hint. Problems come back as Japanese sentences, so they can be sent back for the retry.
import { z } from 'zod';
import { GROUP_COUNT, PER_GROUP } from './catalog';

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const GeneratedSchema = z.object({
  title: text(2, 20),
  brief: z.object({ user: text(2, 48), scene: text(2, 48), goal: text(2, 48) }),
  axisHint: text(8, 110),
  groups: z.array(
    z.object({
      label: text(2, 10),
      altLabels: z.array(text(1, 14)).max(4).default([]),
      items: z.array(z.object({ text: text(1, 12), desc: text(2, 40) })),
    }),
  ),
});
export type Generated = z.infer<typeof GeneratedSchema>;

/** Same word for the duplicate check: width, case and spacing don't count. */
export const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s・･·]/g, '');

/** The JSON object in a model reply (tolerates code fences or a sentence around it). */
export function extractJson(reply: string): unknown {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('JSONが見つかりません');
  return JSON.parse(reply.slice(start, end + 1));
}

export type Checked = { ok: true; problem: Generated } | { ok: false; problems: string[] };

export function checkGenerated(raw: unknown): Checked {
  const parsed = GeneratedSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || '全体'}: ${i.message}`) };
  }
  const p = parsed.data;
  const problems: string[] = [];
  if (p.groups.length !== GROUP_COUNT) problems.push(`グループはちょうど${GROUP_COUNT}個にしてください（今は${p.groups.length}個）`);
  const seenItems = new Map<string, string>();
  const seenLabels = new Set<string>();
  for (const g of p.groups) {
    if (g.items.length !== PER_GROUP) problems.push(`「${g.label}」のキーワードはちょうど${PER_GROUP}個にしてください（今は${g.items.length}個）`);
    const label = normalize(g.label);
    if (seenLabels.has(label)) problems.push(`グループ名「${g.label}」が重複しています`);
    seenLabels.add(label);
    for (const item of g.items) {
      const key = normalize(item.text);
      const other = seenItems.get(key);
      if (other !== undefined) problems.push(`キーワード「${item.text}」が重複しています（${other === g.label ? '同じグループ内' : `「${other}」と`}）`);
      seenItems.set(key, g.label);
      if (label.length >= 2 && key.includes(label)) problems.push(`キーワード「${item.text}」がグループ名「${g.label}」を含んでいます`);
    }
  }
  const hint = normalize(p.axisHint);
  for (const g of p.groups) {
    if (normalize(g.label).length >= 2 && hint.includes(normalize(g.label))) problems.push(`axisHint にグループ名「${g.label}」が書かれています`);
  }
  return problems.length ? { ok: false, problems } : { ok: true, problem: p };
}
