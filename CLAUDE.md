# CLAUDE.md

## このリポジトリ

- **Mato mate（マトメイト）**：チームで情報アーキテクチャのグルーピングとラベリングを練習する、グループワーク用の 3D ゲーム。
- Label Drop（https://github.com/goonruntongue/label-drop ）を元に作り変えたもの。Label Drop とは**完全に分離**していて、コードは共有しない。
- 仕様は `PRD.md`（末尾の「決定事項」が最新）。元になった Label Drop の仕様は `docs/LABELDROP_SPEC.md`（参考用）。
- アプリ本体は `app/`（Vite + React + React Three Fiber）。リアルタイム通信・ログインは **Firebase**（Auth＋Realtime Database）。
- Firebase は**無料の Spark プランのまま**使う。従量課金（Blaze）に上げない。Firebase 上にプロジェクトやリソースを作る前にユーザーに確認する。
- push 先は `https://github.com/goonruntongue/matomate.git`。
- アバターの 3D モデルは `app/public/avatars/`（avatar1〜21.glb）。
- お題は Claude が作って `app/src/data/` に入れる。作るときはローカルスキル `.claude/skills/label-drop-topic/SKILL.md` に従う。

## よく使うコマンド

```bash
npm --prefix app run dev        # 開発サーバー（LAN にも公開）
npm --prefix app run typecheck
npm --prefix app run build
```
