# CLAUDE.md

## このリポジトリ

- **Label Drop**（practice IA シリーズ）：情報アーキテクチャのグルーピングとラベリングを練習する 3D ゲーム。
- アプリ本体は `app/`（Vite + React + React Three Fiber）。API は `worker/`（Cloudflare Worker＋D1、P3〜）。仕様は `docs/SPEC.md`。
- Cloudflare は**無料プランのまま**使い、従量課金が起きるものは使わない（SPEC 8.1 の決定）。Cloudflare 上にリソースを作る前にユーザーに確認する。
- `main` に push すると、GitHub Actions で GitHub Pages（https://goonruntongue.github.io/label-drop/app/ ）に自動デプロイされる。アプリはどの公開先でも**静的に動く**（AI 機能は `VITE_AI=on` のときだけ。既定は無効。2026-10-03 決定 #25）。お題は Claude が作って `app/src/data/` に入れる（Workers AI は使わない）。作るときはローカルスキル `.claude/skills/label-drop-topic/SKILL.md` に従う。将来の教室モードの構想は `docs/CLASSROOM_SPEC.md`。

## 開発場所と最終デプロイ先（必読）

- **アプリの改変は、すべてここ（`C:\Users\owner\Desktop\Apps\IA-DX`）で行う。ここがソースの唯一の正。**
- 完成したら、`C:\Users\owner\Desktop\knowledge-sorrounding-AI\about-ia` の適切な場所に上書きし、`goonruntongue/knowledge-sorrounding-AI` の `about-ia/app/dist` にアップする。
- ポータル側の LP（`about-ia/index.html` など）はポータル専用に改変済みなので、上書きしない。
- 手順と、上書きしてよい場所／いけない場所は `docs/PORTAL_DEPLOY.md` を参照。ポータル側へのコミット・push は、ブランチを毎回ユーザーに確認してから行う。

## よく使うコマンド

```bash
npm --prefix app run dev        # 開発サーバー（LAN にも公開。ヘッダーの「共有」で QR）
npm --prefix app run typecheck
npm --prefix app run build
npm --prefix app run icons      # app/icons/icon.svg から PWA アイコンを再生成
npm --prefix worker run dev     # API（Cloudflare Worker）をローカルで起動（:8787、ローカルの D1）
npm --prefix worker run db:local  # ローカルの D1 にマイグレーションを当てる
npm --prefix worker test        # API のテスト（AUTH_MODE の両方）
```
