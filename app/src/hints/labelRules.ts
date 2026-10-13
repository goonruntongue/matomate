// Rule-based label checks (spec 4.5). Zero AI cost; shared by the live hints and the thinking guide.

export type IssueLevel = 'error' | 'warn' | 'tip';

export interface LabelIssue {
  level: IssueLevel;
  message: string;
}

const CATCH_ALL = /^(その他|そのほか|他|ほか|いろいろ|色々|雑多|misc|etc|others?)$|その他|いろいろ|など$/i;
const VERB_FORM = /(する|したい|できる|しよう|ます|ない)$/;

export const LABEL_SOFT_MAX = 12;

function normalize(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

export function isVerbForm(label: string): boolean {
  return VERB_FORM.test(normalize(label));
}

/** Issues for one tray's label, given its contents and the other labels. */
export function labelIssues(label: string, contents: string[], otherLabels: string[]): LabelIssue[] {
  const text = label.trim();
  const issues: LabelIssue[] = [];
  if (!text) {
    if (contents.length) issues.push({ level: 'error', message: 'ラベルを入力してください' });
    return issues;
  }
  if (CATCH_ALL.test(normalize(text))) {
    issues.push({ level: 'warn', message: '「その他」系のラベルは、中身が予測しにくい受け皿になります' });
  }
  if ([...text].length > LABEL_SOFT_MAX) {
    issues.push({ level: 'warn', message: `ナビに収まる長さ（目安${LABEL_SOFT_MAX}文字以内）にしましょう` });
  }
  if (otherLabels.some((other) => other.trim() && normalize(other) === normalize(text))) {
    issues.push({ level: 'warn', message: '同じラベルの箱があります。違いが伝わる名前にしましょう' });
  }
  if (contents.some((item) => normalize(item) === normalize(text))) {
    issues.push({ level: 'tip', message: '中の1語をそのまま借りています。全体を表す言葉にしましょう' });
  }
  const others = otherLabels.filter((other) => other.trim());
  if (others.length && others.some((other) => isVerbForm(other) !== isVerbForm(text))) {
    issues.push({ level: 'tip', message: '「〜する」形と名詞形が混ざっています。ラベルの形を揃えましょう' });
  }
  return issues;
}
