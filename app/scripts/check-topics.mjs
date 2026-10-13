// Checks the team-game problems against the rules in .claude/skills/label-drop-topic/SKILL.md
// (counts, lengths, duplicates, answers given away by the wording).
// Run: npm --prefix app run topics:check
import { MATOMATE_A } from '../src/data/topics-matomate-a.ts';
import { MATOMATE_B } from '../src/data/topics-matomate-b.ts';

const problems = [...MATOMATE_A, ...MATOMATE_B];
const errors = [];
const len = (s) => [...s].length;
const between = (where, what, text, min, max) => {
  if (typeof text !== 'string' || len(text) < min || len(text) > max) errors.push(`${where}: ${what}「${text}」は ${min}〜${max}字にする（今 ${len(String(text))}字）`);
};
// Same thing written differently (full/half width, katakana/hiragana) counts as the same word.
const fold = (s) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・ー]/g, '');

const ids = new Set();
for (const p of problems) {
  const at = p.id;
  if (!/^[a-z][a-z0-9-]*$/.test(p.id)) errors.push(`${at}: id は英小文字とハイフン`);
  if (ids.has(p.id)) errors.push(`${at}: id が重なっている`);
  ids.add(p.id);
  between(at, 'title', p.title, 2, 20);
  for (const key of ['user', 'scene', 'goal']) between(at, `brief.${key}`, p.brief[key], 2, 48);
  between(at, 'axisHint', p.axisHint, 8, 110);
  if (p.groups.length !== 5) errors.push(`${at}: グループは5つ（今 ${p.groups.length}）`);
  if (!Array.isArray(p.examples) || p.examples.length < 2 || p.examples.length > 3) errors.push(`${at}: 別の目的の例は2〜3個`);
  for (const [i, ex] of (p.examples ?? []).entries()) {
    for (const key of ['user', 'scene', 'goal']) between(`${at} 例${i + 1}`, key, ex[key], 2, 48);
    // The team's purpose box takes 120 characters: an example must fit when it is picked.
    if (len(`${ex.user}が、${ex.scene}、${ex.goal}`) > 120) errors.push(`${at} 例${i + 1}: つなげると120字を超える`);
  }
  const labels = p.groups.map((g) => g.label);
  if (new Set(labels.map(fold)).size !== labels.length) errors.push(`${at}: グループ名が重なっている`);
  const seen = new Map();
  for (const g of p.groups) {
    const where = `${at}／${g.label}`;
    between(where, 'label', g.label, 2, 10);
    if (g.altLabels?.length !== 2) errors.push(`${where}: altLabels は2つ`);
    for (const alt of g.altLabels ?? []) between(where, 'altLabel', alt, 1, 14);
    if (g.items.length !== 6) errors.push(`${where}: 語は6つ（今 ${g.items.length}）`);
    if (/その他|いろいろ|便利グッズ|雑多/.test(g.label)) errors.push(`${where}: 受け皿のグループ名`);
    // The hint must not name a group.
    for (const part of g.label.split('・')) if (len(part) >= 2 && p.axisHint.includes(part)) errors.push(`${at}: axisHint にグループ名「${part}」が入っている`);
    for (const item of g.items) {
      between(where, '語', item.text, 1, 12);
      between(where, `「${item.text}」の意味`, item.desc, 2, 40);
      const key = fold(item.text);
      if (seen.has(key)) errors.push(`${where}: 「${item.text}」が「${seen.get(key)}」と重なっている`);
      seen.set(key, g.label);
      // A word must not contain its own group's name (the answer would show), nor a meaning that names any group.
      for (const part of g.label.split('・')) if (len(part) >= 2 && fold(item.text).includes(fold(part))) errors.push(`${where}: 語「${item.text}」にグループ名「${part}」が入っている`);
      for (const other of labels) if (len(other) >= 3 && item.desc.includes(other)) errors.push(`${where}: 「${item.text}」の意味にグループ名「${other}」が入っている`);
    }
  }
}

console.log(`${problems.length} 問、${problems.reduce((n, p) => n + p.groups.reduce((m, g) => m + g.items.length, 0), 0)} 語`);
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} 件の問題`);
  process.exit(1);
}
console.log('ルールどおりです');
