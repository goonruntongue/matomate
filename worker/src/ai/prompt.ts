// The generation prompt (SPEC 7.3), shaped to the game's own problem format so a generated problem
// plays exactly like a bundled template.
import { GROUP_COUNT, PER_GROUP, type GenParams } from './catalog';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const TIER_AUDIENCE: Record<GenParams['tier'], string> = {
  everyday: 'だれでも思い浮かべられる身の回りの物（専門知識は不要）',
  service: '多くの人が使うサービスやアプリの画面・メニュー',
  web: '実務のWebサイトの情報設計（ページ名・コンテンツ名・機能名）',
};

const SHAPE = `{
  "title": "お題の名前（2〜16字。例: 冷蔵庫の中身）",
  "brief": { "user": "だれのために（40字以内）", "scene": "どんな場面で（40字以内）", "goal": "何を作るか（40字以内）" },
  "axisHint": "考え方のヒント（90字以内）。分け方の切り口を示すが、グループ名は書かない",
  "groups": [
    {
      "label": "グループ名（2〜8字）",
      "altLabels": ["同じくらい良い別案", "もう1つの別案"],
      "items": [ { "text": "キーワード（1〜10字）", "desc": "キーワードの意味（30字以内。グループのことは書かない）" } ]
    }
  ]
}`;

export function generationMessages(p: GenParams): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'あなたは情報アーキテクチャ（IA）の教材作成者です。カードソート演習の問題を、指定のJSONの形に従って1問作ります。出力はJSONだけにしてください。前置き・説明・コードフェンスは書かないでください。',
    },
    {
      role: 'user',
      content: `# 条件
- 領域: ${p.domain}
- 題材: ${TIER_AUDIENCE[p.tier]}
- 分け方（組織化スキーム）: ${p.scheme.label}
- グループ数: ちょうど${GROUP_COUNT}個 / 各グループのキーワード数: ちょうど${PER_GROUP}個（合計${GROUP_COUNT * PER_GROUP}個）

# brief
- user（だれのために）/ scene（どんな場面で）/ goal（何を作るか）を、それぞれ40字以内で。

# キーワード
- その領域に実在しそうな物・ページ名・機能名。1〜10字の名詞を中心に。
- 全部で重複なし。言い換えただけの重複も作らない。
- グループ名の語をそのまま含めない（例: グループ名が「料金」なら「料金表」は不可）。
- desc は、そのキーワードが何かを一言で説明する（どのグループに入るかは書かない）。

# グループ
- すべて同じ分け方で切り分け、互いに重ならないこと。
- label は、brief の利用者がひと目で中身を予測できる2〜8字。全グループで表記の形を揃える。
- altLabels は、同じくらい良い別案を2つ。

# axisHint
- 分け方の切り口に気づけるヒントを、問いかけの形で90字以内。グループ名は書かない。

# 出力の形
${SHAPE}`,
    },
  ];
}

/** The second try: the same request plus what was wrong with the first answer. */
export function retryMessages(first: ChatMessage[], previous: string, problems: string[]): ChatMessage[] {
  return [
    ...first,
    { role: 'assistant', content: previous.slice(0, 6000) },
    { role: 'user', content: `次の点が条件に合っていません。すべて直して、JSONだけをもう一度出力してください。\n- ${problems.slice(0, 12).join('\n- ')}` },
  ];
}
