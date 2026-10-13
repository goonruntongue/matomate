// What a generated problem is about (SPEC 7.2 ①). The server draws these at random — an LLM left to
// choose repeats itself — and avoids the topics the bundled templates already cover.
import type { Tier } from '../problems';

export const DOMAINS: Record<Tier, string[]> = {
  everyday: [
    'キッチンの戸棚', '洗面所の収納', '車のトランク', '子ども部屋のおもちゃ箱', '防災リュック', '旅行のスーツケース',
    'ベランダのガーデニング用品', 'ペット用品の棚', '手芸の道具箱', '工具箱', '薬箱', '玄関の収納',
    'お弁当づくりの道具', '学校の持ち物', '誕生日パーティーの準備', '大掃除の道具',
  ],
  service: [
    '地域の図書館アプリ', '市役所のサイト', 'ネットスーパー', 'ホテル予約サイト', '美術館のサイト', 'レシピ投稿サイト',
    '子育て支援サイト', '銀行アプリ', 'ゲームのオプション画面', 'オンライン英会話', 'フードデリバリーアプリ',
    '中古品フリマアプリ', '音楽配信アプリ', '地図アプリ', '天気予報アプリ', 'ふるさと納税サイト',
  ],
  web: [
    '病院の外来案内サイト', '社内ポータルの総務ページ', '業務用SaaSの設定画面', '不動産検索サイト', '自治体の防災ページ',
    'ECサイトのヘルプセンター', 'オンライン診療アプリ', '大学院の入試サイト', '観光協会のサイト', '保険会社の契約者ページ',
    '学習管理システム（LMS）', '病児保育の予約サイト', 'NPOの寄付サイト', '電力会社のマイページ', '鉄道会社のサイト',
  ],
};

export interface Scheme {
  id: 'topic' | 'task' | 'audience' | 'lifecycle';
  /** How the prompt names it. */
  label: string;
}

/** Ambiguous organization schemes only (SPEC 7.2): never exact ones like 五十音 or geography. */
export const SCHEMES: Scheme[] = [
  { id: 'topic', label: 'トピック別（何についての情報か）' },
  { id: 'task', label: 'タスク別（利用者が何をしたいか）' },
  { id: 'audience', label: '利用者別（だれのための情報か）' },
  { id: 'lifecycle', label: '時系列（使う順番・段階）' },
];

/** Everyday things are sorted by kind or by use; the other schemes need a site or app. */
export const SCHEMES_BY_TIER: Record<Tier, Scheme['id'][]> = {
  everyday: ['topic', 'task'],
  service: ['topic', 'task', 'audience', 'lifecycle'],
  web: ['topic', 'task', 'audience', 'lifecycle'],
};

/** Same size as the bundled templates, so the game can play either: 5 groups × 6 keywords. */
export const GROUP_COUNT = 5;
export const PER_GROUP = 6;

export interface GenParams {
  tier: Tier;
  domain: string;
  scheme: Scheme;
}

export function drawParams(tier: Tier, theme?: string, random = Math.random): GenParams {
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  const schemeId = pick(SCHEMES_BY_TIER[tier]);
  return { tier, domain: theme?.trim() || pick(DOMAINS[tier]), scheme: SCHEMES.find((s) => s.id === schemeId)! };
}
