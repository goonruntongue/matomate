// Fix 2: keywords that honestly fit two boxes. Putting one in either its model group or a group
// listed here counts as correct, and the result marks it "◇ どちらの箱でも正解".
// Keyed by problem id → keyword text → other model labels that are also right.
export const FLEXIBLE_ITEMS: Record<string, Record<string, string[]>> = {
  stationery: { 色鉛筆: ['書く'], ペンケース: ['書く'] },
  closet: { カーディガン: ['トップス'], レギンス: ['ボトムス'] },
  camping: { ライター: ['料理する'] },
  'music-store': { 鍵盤ハーモニカ: ['管楽器'], 木琴: ['鍵盤楽器'] },
  chores: { 冷蔵庫の整理: ['掃除'], 玄関の掃き掃除: ['掃除'], 宅配便の受け取り: ['買い物'] },
  bookstore: { 学習マンガ: ['子どもの本'], ライトノベル: ['小説・文芸'], 家計の本: ['ビジネス・学び'] },
  electronics: { ゲーム機: ['パソコン・スマホ'], 加湿器: ['生活家電'], ヘッドホン: ['パソコン・スマホ'] },
  recipes: { オムライス: ['主菜'], カレーライス: ['主菜'] },
  zoo: { ペンギン: ['水の生き物'], アザラシ: ['ほ乳類'], カワウソ: ['ほ乳類'], カメ: ['水の生き物'], ウサギ: ['ほ乳類'], ヒヨコ: ['鳥'] },
  'sports-store': { ラッシュガード: ['ウェア・シューズ'], レインウェア: ['ウェア・シューズ'], 登山靴: ['ウェア・シューズ'] },
  'hundred-yen': { ゴム手袋: ['キッチン用品'], ジップ付き袋: ['収納用品'], 保存容器: ['収納用品'] },
  library: { 子ども向け行事: ['イベント'], ヤングアダルト: ['本を探す'], 利用カード: ['施設・利用案内'] },
  hospital: { ATM: ['お金・保険'] },
  'phone-settings': { パスワード管理: ['プライバシー・安全'], 通知: ['画面・音'], ソフトウェア更新: ['アカウント・アプリ'], VPN: ['プライバシー・安全'] },
  mypage: { 領収書の発行: ['支払い'], 送料: ['支払い'], 届かない荷物: ['配送'] },
  streaming: { レンタル作品: ['作品を探す'], 視聴中の作品: ['視聴する'] },
  'budget-app': { 引き落とし予定: ['見る・分析'] },
  'fitness-app': { ランニング記録: ['体の記録'], グラフ: ['体の記録'], 目標体重: ['体の記録'] },
  'restaurant-booking': { 駐車場あり: ['お店の特徴'], 食べ放題: ['予算・支払い'], コース料理: ['お店の特徴'] },
  university: { 資格講座: ['学部・学び'], 取得できる資格: ['就職・進路'], 学生相談室: ['キャンパスライフ'], アルバイト紹介: ['キャンパスライフ'] },
  corporate: { 中期経営計画: ['企業情報'], 統合報告書: ['株主・投資家'] },
  bag: { スマホ: ['貴重品'], ハンドクリーム: ['健康・衛生'], ウェットティッシュ: ['身だしなみ'], 社員証: ['仕事道具'], ノートPC: ['デジタル機器'] },
  supermarket: { アイスクリーム: ['パン・お菓子'] },
  house: { 観葉植物: ['玄関'], 読書灯: ['リビング'] },
  travel: { 手荷物制限: ['渡航の準備'] },
  portal: { 情報セキュリティ: ['IT・ツール'], 資格支援: ['お金・福利厚生'] },
  city: { 予防接種: ['子育て'], 乳幼児健診: ['健康・医療'], 水道開始: ['生活・環境'] },
};

/** Other model labels that also count as right for this keyword (empty when only one is right). */
export function alsoRight(problemId: string, text: string): string[] {
  return FLEXIBLE_ITEMS[problemId]?.[text] ?? [];
}
