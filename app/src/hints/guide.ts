// The thinking guide: a procedure that works for any problem, plus a coach that reads the board
// and points at the step the player is on. It never reveals the reference answer.
import { labelIssues } from './labelRules';

export interface GuideStep {
  title: string;
  why: string;
  todo: string[];
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    title: '「誰が・どんな場面で」をつかむ',
    why: '正しい分け方は、使う人と場面で変わります。まず相手を決めましょう。',
    todo: ['上のお題を読み、「この人は何をしに来る？」を一言で言ってみる。'],
  },
  {
    title: 'ブロックを「何のため？」で読む',
    why: 'モノの名前ではなく目的で見ると、仲間どうしが見えてきます。',
    todo: [
      '全部をざっと眺め、それぞれを「〜するためのもの」と心の中で言い換える。',
      '例: 「パスポート」→「出国するためのもの」',
    ],
  },
  {
    title: '確実なペアから始める',
    why: '最初から全部を決めようとすると手が止まります。小さく始めましょう。',
    todo: [
      '「これとこれは絶対に一緒」という2つを見つけて、同じトレイに入れる。',
      'そういうペアを3組ほど、それぞれ別のトレイに作る。',
    ],
  },
  {
    title: '分け方の「切り口」を1つに決める',
    why: '切り口が混ざると、ラベル同士がぶつかって利用者が迷います。',
    todo: [
      '次のどれで分けると一番すっきりするか試す:',
      '・時間の流れ（〜の前／〜の最中／〜の後）',
      '・やりたいこと（「〜したい」で言える）',
      '・対象（モノ・人・お金・情報）',
      '・場所や窓口',
      '1つ選んだら、すべてのトレイをその切り口で揃える。',
    ],
  },
  {
    title: '残りを振り分け、迷うものは保留する',
    why: '迷うブロックは、ほかが片付くと行き先が見えてきます。',
    todo: [
      '残りをどんどん入れる。2つのトレイで迷うものは、未分類に残して後回しにする。',
      '最後に「この利用者なら、どっちの箱を開けて探す？」で決める。',
    ],
  },
  {
    title: '箱の大きさを見直す',
    why: '箱の数はキーワード数から決まっています。極端に大きい箱や小さい箱は、切り口がずれているサインです。',
    todo: [
      '箱ごとの個数がだいたい揃っているかを見る（目安は「キーワード数 ÷ 箱の数」個）。',
      '1つの箱に偏っていたら → その中に2つの仲間が混ざっていないか。片方を、空いている箱の仲間にできないか考える。',
      '1〜2個しかない箱 → その箱だけ切り口がずれていないか。ほかの箱から、ここに入るべきものを探す。',
    ],
  },
  {
    title: 'ラベルを付ける',
    why: 'ラベルは、利用者が中身を開けずに選ぶための「約束」です。',
    todo: [
      '中身を「全部」覆う言葉にする（中の1語を借りない）。',
      '利用者が使う言葉で、2〜8文字くらい。',
      'すべてのラベルの形を揃える（名詞で揃える／「〜する」で揃える）。',
      '「その他」は使わない。',
    ],
  },
  {
    title: 'ラベルだけでテストする',
    why: 'ラベルで中身が予測できれば、利用者は迷いません。',
    todo: [
      '中身を見ずにラベルだけを読み、「この箱には何が入っていそう？」と予測する。',
      '予測が外れる、または2つの箱で迷うなら、ラベルか仕分けを直す。',
    ],
  },
];

export interface BoardSnapshot {
  total: number;
  sorted: number;
  trays: { label: string; contents: string[] }[];
}

export interface CoachAdvice {
  step: number;
  tips: string[];
}

/** Which guide step fits the current board, and concrete nudges for it. */
export function coach(board: BoardSnapshot): CoachAdvice {
  const { total, sorted, trays } = board;
  const used = trays.filter((tray) => tray.contents.length);
  const tips: string[] = [];

  if (sorted === 0) {
    tips.push('まずは「これとこれは絶対に一緒」という2つを探して、同じトレイに入れてみましょう。');
    return { step: 2, tips };
  }
  if (sorted < total * 0.4) {
    tips.push('いくつかペアができたら、それぞれのトレイに「どんな切り口の仲間か」を心の中で名付けてみましょう。');
    if (used.length === 1) tips.push('今は1つのトレイだけに入っています。別の仲間は別のトレイに分けて始めましょう。');
    return { step: 3, tips };
  }

  const big = used.find((tray) => tray.contents.length > total * 0.5);
  const tiny = sorted >= total * 0.6 ? used.filter((tray) => tray.contents.length <= 2) : [];
  if (sorted < total) {
    tips.push(`残り${total - sorted}個です。迷うものは未分類に残して、ほかを先に片付けましょう。`);
    if (big) tips.push('1つのトレイに半分以上が集まっています。その中に、さらに2つの仲間が隠れていないか見てみましょう。');
    return { step: 4, tips };
  }

  if (big || tiny.length) {
    if (big) tips.push('1つのトレイに半分以上が集まっています。中に2つの仲間が混ざっていないか、片方を別の箱に移せないか考えてみましょう。');
    if (tiny.length) tips.push('1〜2個しか入っていないトレイがあります。ほかの箱から、ここに入るべきものがないか探してみましょう。');
    return { step: 5, tips };
  }

  const labels = used.map((tray) => tray.label);
  const unlabeled = used.filter((tray) => !tray.label.trim()).length;
  const issues = used.flatMap((tray, i) =>
    labelIssues(
      tray.label,
      tray.contents,
      labels.filter((_, j) => j !== i),
    ).filter((issue) => issue.level !== 'error'),
  );
  if (unlabeled) {
    tips.push(`ラベルのないトレイが${unlabeled}つあります。中身を「全部」覆う言葉を探しましょう。`);
    tips.push('中身を声に出して読み、「つまり〜のこと」と言い換えると、ラベルの候補になります。');
    return { step: 6, tips };
  }
  if (issues.length) {
    tips.push(...new Set(issues.map((issue) => issue.message)));
    return { step: 6, tips };
  }
  tips.push('ラベルだけを読んで、中身を当てられるか試してみましょう。当てられたら提出の準備完了です。');
  return { step: 7, tips };
}
