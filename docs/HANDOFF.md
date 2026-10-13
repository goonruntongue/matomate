# 引き継ぎメモ（2026-10-03 時点）

> 新しいスレッドで作業を再開するときは、まずこの文書と `CLAUDE.md`、`docs/PORTAL_DEPLOY.md` を読む。
> ユーザーとのやりとりは日本語。前回の引き継ぎ（10-01）以降の経緯は 4 にまとめた。

## 1. いまの状態

- **Label Drop**（practice IA シリーズ）：IA のグルーピングとラベリングを練習する 3D ゲーム。
- **P0〜P3 完了。AI 作問（P4）は試したうえで取りやめ**（決定事項 #25）。アプリは**静的に動く**。お題は **43問**（テンプレ30＋Claude 監修13）。
- 最新: label-drop `main` の `76ebe7b`（アプリ本体は `59e3d6d`）。
- ポータル（＝`C:\Users\owner\Desktop\knowledge-sorrounding-AI`）にも反映済み: `main` の **`db9d94b`**（label-drop `59e3d6d`、静的な版）。
  - Cloudflare Pages（今後の本番）: https://knowledge-surrounding-ai.pages.dev/ （Label Drop は `/about-ia/app/dist/`）
  - GitHub Pages（並行して公開中）: https://goonruntongue.github.io/knowledge-sorrounding-AI/about-ia/app/dist/
- 開発版: https://goonruntongue.github.io/label-drop/app/ （`main` に push すると自動デプロイ。静的な版）
- ポータル側で作業する Codex 向けの引き継ぎ: `knowledge-sorrounding-AI/CODEX_HANDOFF_LABEL_DROP.md`（Git 管理外。ユーザーが Codex に読ませる）。

## 2. 守ること（ユーザーとの取り決め）

- **改変はすべて IA-DX（ここ）で行う。** ここが唯一の正。
- 「ポータルに反映して」と言われたら `docs/PORTAL_DEPLOY.md` の手順で反映する。
  - **反映先のブランチは毎回ユーザーに確認する**（これまでは毎回「main に直接」）。
  - 反映前に、ポータルの `origin/main` に Label Drop への直接の変更（Codex など）がないか確認し、あれば先に IA-DX へ取り込む。
  - ポータルの `origin/main` から一時 worktree を作り、`about-ia/app/dist` だけを差し替えて push。**同じコミットを Cloudflare Pages（`knowledge-surrounding-ai`）にも上げる**（`AGENTS.md`・`.codex/` は除く。3-5）。ユーザーが開いているブランチ（`git-github-lottie-illustrations`）には触らない。参照用ソース（`about-ia/app/src` など、Git 管理外）も IA-DX と同じにする。
  - ポータル LP（`about-ia/index.html` など）は触らない。
- **Cloudflare は無料プランのまま**。従量課金が起きるものは使わない。リソースを作る前にユーザーに確認する（SPEC 8.1）。
- **お題は Claude が作る**（Workers AI は使わない、#25）。頼まれたら `app/src/data/topics-curated.ts` に足す：5グループ×6語（語に1行の意味）、brief（だれ・場面・目的）、グループ名を書かない axisHint、各グループに altLabels 2つ。軸は1つ、境目のあいまいな語なし、同じ物の重複なし、何でも入る受け皿グループなし。

## 3. 構成のメモ

- `app/`：ゲーム本体（Vite＋React＋R3F）。AI 関連の機能（AI ENERGY メーター、API 通信、AI の問題の先読み）は `VITE_AI=on` のときだけ有効。既定は無効。
- `worker/`：Cloudflare Worker `label-drop-api`（Hono＋D1）。https://label-drop-api.goonruntongue.workers.dev 。**今のアプリは呼ばない**。将来の教室モード用に残している。
  - D1 `label-drop`（id `ee4485e7-…`）：テンプレ30問、AI の問題（監修済み13・下書き・不合格）、`ai_calls`、`ai_budget`。
  - **Cron は停止**（`wrangler.jsonc` の `triggers.crons` が空。Cloudflare 側のトリガーも削除済み）。
  - secret: `ADMIN_EMAILS`、`ANON_SALT`。
  - 2026-10-03、Worker 本体の最後の再デプロイは、このパソコンのメモリ不足で `npm test` が起動できず止まった（コードは無関係）。公開中の版は「生成は下書きのみ・`/api/generate` 停止」の版で、運用に支障はない。次に Worker を触るときに `npm --prefix worker run deploy` で入れ直す。
- 教室モード（将来）：ログイン、講師の管理画面、チーム戦（共有盤面・チームチャット・未／済バッジ）、結果発表、管理者なしの「セルフモード」。仕様の下書きは **`docs/CLASSROOM_SPEC.md`**。Durable Objects（無料プランで可）＋自前の Google OAuth を推奨。

## 4. 10-01 以降の経緯（主なもの）

- 10-02：スマホでキャラが「答え合わせ」ボタンの上へついてくる／P2 の突き合わせと仕上げ（設定パネル＝文字サイズ・モーション・色覚サポート、ダイアログのフォーカス、タッチ44px、ヘッダーの2行化）／レベルアップ演出を長く／文字サイズ「大」を強化／お題カードのボタンを「くわしく」「－」に分離／音が最初のタッチから鳴るように修正／ブロックがお題カードの下に隠れないよう配置を改善（キャラの下も使う）／ピンチ拡大の禁止。
- 10-02：ポータルを Cloudflare Pages で公開開始。P3（Worker＋D1、AI ENERGY メーター、`/api/problem`）。
- 10-02〜03：P4（Workers AI で作問）を作って試したが、問題があいまいで質が低いと判断。監修制（#24）を経て、AI をやめて静的運用に（#25）。監修済み13問をアプリへ移した。
- 決定事項は `docs/SPEC.md` の「13.」#19〜#25（設定パネル、ヘッダー、AI の出し方、撤退条件、公開先ごとの版、監修制、AI を使わない）。

## 5. 次の候補

- 新しいお題を作って足す（頼まれたら）。
- 教室モードの論点を決める（`docs/CLASSROOM_SPEC.md` の 7）。決まったら段階1（ログインと部屋）から。
  - 2026-10-03：目的と課題の進め方を決めた（CLASSROOM_SPEC の 0、SPEC #26：固定課題→発表→自由課題→発表、教室モードはレベルアップなし）。同日、7.0・7.1 の論点もすべて決定（別アプリ「みんなでラベル」、`classroom/` に `app/` をコピーして育てる、SPEC #27）。次は段階1（ログインと部屋）から。
  - 教室モード用にお題を作り直す（ローカルスキル `.claude/skills/label-drop-topic/SKILL.md` の 5）。
- GitHub Pages 版のポータルを止めるかどうか（Cloudflare 版で問題がないと確かめてから）。

## 6. 開発のコツ

- `npm --prefix app run dev`（5173）、`npm --prefix app run typecheck`、`npm --prefix app run build`。本番ビルドの確認は `.claude/launch.json` の `app-build-preview`（4173）。
- ブラウザから store を触るときは、HMR で読み込み直された版を使う：
  `performance.getEntriesByType('resource').map(e => e.name).filter(n => /state\/store\.ts/.test(n)).pop()` を `import()`。
- `?debug` を URL に付けるとデバッグパネル（レベル・★の変更、レベルアップ演出のプレビュー、全クリア演出の再生、図鑑、👑の消去）。
- 内蔵ブラウザのプレビューは、ペインが非表示だと `requestAnimationFrame` が止まり、3D やスクロール連動の確認ができない。数値の確認（配置の計算を直接呼ぶなど）で補う。
- このパソコンでは、bash のヒアドキュメントに日本語の長文を入れると失敗することがある。長いファイルはファイル作成ツールで書く。
- コミットの末尾には `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
