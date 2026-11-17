# Gradus 対位法ドリル — 作業の手引き

フックス『Gradus ad Parnassum』(1725)の類別対位法(第1〜5類・2声)を練習するブラウザアプリ。
利用者は日本語話者(大学で教える音楽家)で、画面の文言はすべて日本語。

- リポジトリ: `cellish/gradus-dojo`。配布は2つ: Claude上のページ(Artifact)と、リポジトリ直下をそのまま配信するPWA版(GitHub Pages)。
- ビルドなし。`index.html` を配信すれば動く。フレームワークも npm 依存もない。
- 残りの作業は `docs/PLAN.md` にある。**計画にない機能は足さない。**

## 役割の分担

| 役割 | すること |
|---|---|
| 計画(Fable) | `docs/PLAN.md` に、項目ごとの仕様と受け入れ条件を書く。 |
| 実装(Opus) | `docs/PLAN.md` の項目を上から順に実装する。1項目=1コミット。 |
| 確認(Fable) | コミットごとの差分を、受け入れ条件と対位法の理論に照らして見る。 |

実装担当の決まり:

- 仕様で迷ったら、推測で進めず、`docs/PLAN.md` のその項目の「未決」に質問を書いて次の項目へ進む。
- 理論にかかわる判断(規則の内容、判定の線引き、文言が述べる理論)を計画から変えない。変えたほうがよいと思ったら「未決」に書く。
- 項目を終えたら、`docs/PLAN.md` のその項目に「実装メモ」(変えた関数、確かめたこと、気づいた点)を数行で残す。確認担当はそこから読む。
- 公開(Claude上のページの再公開、PWA の ZIP 作成)は計画担当の会話で行う。実装担当は触らない。

## 確かめ方(コミットの前に必ず)

```
node test/engine.test.js        # 計算部のテスト
python3 -m http.server 8000   # 別ターミナルで(リポジトリ直下で)配信し、ブラウザで確かめる
```

- テストが通らないコミットは作らない。
- `js/engine.js` を変えたら、テストを足す(規則を足したら「違反する例」と「違反しない例」の両方)。
- 見た目を変えたら、幅 1280px と 390px、ライト/ダークでスクリーンショットを撮って自分の目で確かめる(Playwright が使えれば `python3 tools/shot.py`、なければ手で)。
- Playwright が使えない環境では、その旨を実装メモに書く。

## ファイル構成

スクリプトは `<script src>` で順に読み込む普通のスクリプトで、モジュール(import/export)ではない。
`index.html` の読み込み順が依存関係: `vendor/vexflow-bravura.js` → `js/engine.js` → `js/score.js` → `js/app.js`。

| ファイル | 中身 |
|---|---|
| `js/engine.js` | **純粋な計算部**。音程 `interval`・`vInfo`、判定 `analyze`、解答探索 `solve`/`solveFor`、定旋律の規則 `cfIssues`・生成 `genCF`・入力 `parseCF`、復習問題 `makeQuestion`、データ(`FUX`・`MODES`・`SPECIES`・`PATTERNS`・`RULES`・`INJECT`)。`globalThis.GE` に公開し、Node では `module.exports`。 |
| `js/worker.js` | `engine.js` を読み込み、重い計算(solve・genCF・question・cfSolvable)を別スレッドで行う。 |
| `js/score.js` | 楽譜の浄書(VexFlow 5)。`GScore.engrave(model)` が SVG の中身と座標 `geo` を返す。 |
| `js/app.js` | 画面・操作・保存(localStorage)・音(Web Audio)・MIDI。`state`、`render`、各パネルの描画、イベント。 |
| `css/app.css` | 見た目。色はすべて `:root` のトークン(ライト)と `prefers-color-scheme: dark` / `[data-theme]` の上書き。 |
| `vendor/` | VexFlow 5.0.0(リハモ道場と同じファイル。編集しない)とライセンス文。 |
| `THIRD_PARTY_NOTICES.md` | 同梱・利用している他者の著作物。ライブラリやフォントを足したらここにも書く。 |
| `test/engine.test.js` | 計算部のテスト。`node test/engine.test.js`。 |
| `docs/legacy/gradus-v5.html` | 分割前の1ファイル版(v5)。参照用。編集しない。 |
| `docs/` | `PLAN.md`(作業計画)、`HISTORY.md`(経緯)。GitHub Pages でも配信されるが、アプリからはリンクしない。 |
| `LICENSE` | 著作権表示(All rights reserved)。 |

## 設計の要点(壊しやすい所)

**1. engine.js は DOM・localStorage・state に触れない。**
ブラウザ本体・Worker・Node のどこでも同じに動くこと。画面の都合(色、座標)は app.js と score.js に置く。

**2. 音の表現は `{s, a}`。**
`s` = オクターヴ×7 + 音名番号(C=0 … B=6)、`a` = 臨時記号(−1/0/+1)。C4 = 28。`midi(n)` で MIDI 番号、`nameOf(n)` で「F♯4」、`noteStr(n)` で保存用の「F#4」。
音程は**綴りで**判定する(`interval` が `{d, dn, q, perfect, cons}` を返す。`d` は度数−1、`q` は P/M/m/A/d)。MIDI 番号の差で代用しない(増4度と減5度を区別するため)。

**3. 対旋律は「スロット」の並び。**
`buildSlots(sp, n, rhythm, ties)` が `{i, m, b, dur, rest, optRest, tiedFrom, tieTo}` の配列を作る(`m` 小節、`b` 拍(0〜3)、`dur` 拍数)。
値は `cp["m:b"]`(`skey(slot)`)に保存し、`valsOf(S, cp)` で各スロットの音に展開する。タイで続く側(`tiedFrom != null`)は編集不可で、値は元のスロットから引く。
判定 `analyze(ctx)` の `ctx` は `{sp, cf, above, slots, vals, rhythm, ties}`。

**4. 判定結果の形。**
`issues[]` の各要素は `{id, lv:'err'|'warn', cols:[slot index…], t:見出し, x:説明}`。`id` は `RULES` のキーで、復習の集計と出題(`INJECT`)がこれに依存する。**新しい規則は `RULES` に名前を足し、`INJECT` に出題できる類を書く。**
`err` は規則違反、`warn` は注意(様式上の推奨)。採点は `grade(r, ctx)`(授業用の罰点表: 規則ごとに3・2・1点、`POINTS`。3度・6度の連続は累進、完全協和の使いすぎは全体減点)。合格 = 書き終えていて `err` が0。

**5. 保存。**
localStorage キー `gradus-v2`、構造 `{drafts, prefs, history, stats, cfs, cfSeq}`。旧 `gradus-drafts-v1` は読み込み時に移行。**構造を変えるときは移行処理を書き、書き出し/読み込み(`exportJSON`・`importFrom`)も合わせる。**
保存のたびに `persist()`。`state` の変更で Undo に残すものは `commit(snapshot)` を通す。

**6. 重い計算は Worker。**
`task(type, args)` が Promise を返す(`solve`・`genCF`・`question`・`cfSolvable`)。Worker が作れない環境では本体スレッドで同じ関数を実行する。新しい重い処理は `worker.js` の `TASKS` と `app.js` の `runLocal` の両方に足す。

**7. 楽譜。**
音符・臨時記号・休符・タイ・音部記号は VexFlow が置く。選択枠、誤り/注意の色、音程と進行の行、平行線、最高音の印、候補の点、解答例の重ね表示は、`geo`(各スロットの x、枠の左右、各段の第5線の y と音)から app.js が描く。
`.vfw text{font-family:Bravura,Academico}` は必須(これがないと符頭が文字化けする)。
VexFlow が使えないときは手描き表示(`drawStaffLegacy`)に切り替わる。この経路は壊さない範囲で放置してよい(新機能で対応しなくてよい)。

**8. 著作権。**
オープンソースのライセンスは付けない(`LICENSE`: All rights reserved、著作権者 jun)。ライブラリ・フォント・素材を足したら `THIRD_PARTY_NOTICES.md` と画面下の表示に書く。収める譜例は、保護期間の終わった出典(フックス1725年原典など)から書き起こしたものか、このアプリの解答例だけ。

**9. Claude上のページでは使えないもの。**
ダウンロード、MIDI、マイク、Service Worker、外部サイトへの fetch。機能は「使えなければ隠す/代替する」で作る(例: 書き出しはテキスト表示でも渡せる)。

## 文言の決まり

- 画面の文は「です・ます」で、短く。専門用語は初めて出る所で一言説明する。
- 既存の用語を使う: 定旋律、対旋律、類、拍頭(強拍)・弱拍、協和・不協和、完全協和・不完全協和、反行・斜行・並行・平行、隠伏、経過音・刺繍音・カンビアータ・掛留(準備・解決)、導音、終止、頂点(最高音)、変化音。新しい呼び名を作らない。
- 指摘の文(`x`)は「何がだめか → どうすればよいか」の順で、1〜2文。
- コードの中のコメントは英語でも日本語でもよいが、「なぜそうしているか」を書く。

## コミット

- コミットメッセージは日本語。1行目に何をしたか、本文に箇条書きで要点。
- 1項目=1コミット。テストが通ってから。
