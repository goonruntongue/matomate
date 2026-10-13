# CLAUDE.md

## このリポジトリ

- **Mato mate（マトメイト）**：チームで情報アーキテクチャのグルーピングとラベリングを練習する、グループワーク用の 3D ゲーム。
- Label Drop（https://github.com/goonruntongue/label-drop ）を元に作り変えたもの。Label Drop とは**完全に分離**していて、コードは共有しない。
- 仕様は `PRD.md`（末尾の「決定事項」が最新）。元になった Label Drop の仕様は `docs/LABELDROP_SPEC.md`（参考用）。
- アプリ本体は `app/`（Vite + React + React Three Fiber）。リアルタイム通信・ログインは **Firebase**（Auth＋Realtime Database）。
- Firebase は**無料の Spark プランのまま**使う。従量課金（Blaze）に上げない。Firebase 上にプロジェクトやリソースを作る前にユーザーに確認する。
- push 先は `https://github.com/goonruntongue/matomate.git`。
- **2つの版を、この1つのソースから出す**（`app/src/room/edition.ts`）。ゲームの中身は同じで、アバターだけがちがう。
  - **ピン版** https://matomate.web.app ：アバターは選ばない。全員が色違いのピン（色はチーム内の入室順で自動）。
  - **DX版** https://matomate-dx.web.app ：21体のミニキャラから選ぶ。
  - 部屋（データベースの置き場所）は版ごとに別（`room` と `roomDx`）。2つのクラスが同時に別々の版を使える。
- アバターの 3D モデルは `app/public/avatars/`（DX版：avatar1〜21.glb とサムネイル、ピン版：avatar-pin.glb）。ピンの元データは `app/models-src/avatar-pin.gltf`。
- アクセス権のルールは **`database.rules.room.json` を編集**し、`npm --prefix app run rules:build` で `database.rules.json`（2部屋分。デプロイされるのはこちら）を作り直す。
- お題は Claude が作って `app/src/data/` に入れる。チームのゲームで配るのは `topics-matomate-a.ts`・`topics-matomate-b.ts` の24問だけ（`team: true`。後半用の「別の目的の例」`examples` を持つ）。作るときはローカルスキル `.claude/skills/label-drop-topic/SKILL.md` に従い、`npm --prefix app run topics:check` を通す。

## よく使うコマンド

```bash
npm --prefix app run dev        # 開発サーバー（ピン版。LAN にも公開）
npm --prefix app run dev:dx     # 開発サーバー（DX版）
npm --prefix app run typecheck
npm --prefix app run build      # 両方の版をビルド（app/dist-pin と app/dist-dx）
npm --prefix app run rules:build   # database.rules.room.json → database.rules.json
npm --prefix app run topics:check  # お題のルールチェック
firebase deploy --only database,hosting --project matomate   # ルールと両方のサイトを公開
```
