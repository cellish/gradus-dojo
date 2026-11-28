# Gradus 対位法ドリル — 作業の手引き

フックス『Gradus ad Parnassum』(1725)の類別対位法(第1〜5類・2声)を練習するブラウザアプリ。
利用者は日本語話者(大学で教える音楽家)で、画面の文言はすべて日本語。

- リポジトリ: `cellish/gradus-dojo`。配布: Claude上のページ(Artifact、非公開)。リポジトリ直下はそのまま PWA として配信できる作りだが、GitHub Pages での web 公開は内容をもう少し作ってから(利用者の判断)。
- ビルドなし。`index.html` を配信すれば動く。フレームワークも npm 依存もない。
- 現状は `STATUS.md`、未完了の作業は `PLAN.md`、設計の決定は `docs/DESIGN.md`。**計画にない機能は足さない。**

## 作業の決まり

- `PLAN.md` の「作業」を上から順に進める。新しい機能は、`PLAN.md` に仕様と受け入れ条件を書いてから作る。1項目=1コミット。
- 仕様で迷ったら、推測で進めず、`PLAN.md` の「未決」に質問を書いて次へ進む。
- 理論にかかわる判断(規則の内容、判定の線引き、文言が述べる理論)を計画から変えない。変えたほうがよいと思ったら「未決」に書く。

## 文書の決まり

- 役割分担は親フォルダの `DOCS-POLICY.md`。`STATUS.md`(現状・上書き)、`PLAN.md`(未完了の全件)、`docs/DESIGN.md`(設計の決定・理由つき。設計が変わったときだけ更新)。
- 同じ内容を複数の文書に書かない。ほかに計画の文書を作らない。進み具合の記録は git に任せる。

## 確かめ方(コミットの前に必ず)

```
node test/engine.test.js        # 計算部のテスト(約35秒。判定の記録 test/baseline/ との照合を含む)
python3 -m http.server 8000   # 別ターミナルで(リポジトリ直下で)配信し、ブラウザで確かめる
```

- テストが通らないコミットは作らない。
- `test/baseline/record.json` は、乱数の種と時計を固定した判定・解答探索・出題・ドリルの記録。判定を意図して変えたときだけ `node test/baseline/generate.js` で作り直す(作り直したことをコミットに書く)。
- `js/engine.js` を変えたら、テストを足す(規則を足したら「違反する例」と「違反しない例」の両方)。
- 見た目を変えたら、幅 1280px と 390px、ライト/ダークでスクリーンショットを撮って自分の目で確かめる(Playwright が使えれば `python3 tools/shot.py`、なければ手で)。
- Playwright が使えない環境では、その旨を実装メモに書く。

## ファイル構成

スクリプトは `<script src>` で順に読み込む普通のスクリプトで、モジュール(import/export)ではない。
`index.html` の読み込み順が依存関係: `vendor/vexflow-bravura.js` → 書法コア(`vendor/dojo-shared/core/` の `src/pitch.js` → `src/rules.js` → `src/rules/motion.js` → `src/rules/melodic.js` → `data/rulesets/strict-2v.js`) → `js/engine.js` → `js/drills.js` → `js/lessons.js` → `js/score.js` → `js/app.js`。

| ファイル | 中身 |
|---|---|
| `js/engine.js` | **純粋な計算部**。音程 `interval`・`vInfo`、判定 `analyze`、採点 `grade`、判定の基準 `RULE_LV`・`PRESETS`、解答探索 `solve`/`solveFor`、定旋律の規則 `cfIssues`・生成 `genCF`・入力 `parseCF`、復習問題 `makeQuestion`、データ(`FUX`・`MODES`・`SPECIES`・`PATTERNS`・`RULES`・`INJECT`・`POINTS`)。`globalThis.GE` に公開し、Node では `module.exports`。 |
| `js/drills.js` | ドリルの出題(純粋)。`GD.make(id)`、`DRILLS`。判定は engine をそのまま使い、規則を二重に書かない。 |
| `js/lessons.js` | 「学ぶ」タブの教材(純粋)。`GL.LESSONS`(解説・模範例・悪い例・誘導付き課題)、`build`(譜例を組み立てる)。模範例の出典と書き起こしは `docs/FUX-EXAMPLES.md`。 |
| `js/worker.js` | `engine.js`・`drills.js` を読み込み、重い計算(solve・genCF・question・cfSolvable・drill)を別スレッドで行う。 |
| `js/score.js` | 楽譜の浄書(VexFlow 5)。`GScore.engrave(model)` が SVG の中身と座標 `geo` を返す。 |
| `js/app.js` | 画面・操作・保存(localStorage)・音(Web Audio)・MIDI。`state`、`render`、各パネルの描画、イベント。 |
| `css/app.css` | 見た目。色はすべて `:root` のトークン(ライト)と `prefers-color-scheme: dark` / `[data-theme]` の上書き。 |
| `vendor/` | VexFlow 5.0.0(リハモ道場と同じファイル。編集しない)とライセンス文。 |
| `vendor/dojo-shared/core/` | 道場シリーズの書法コアのコピー(下の「書法コア」)。**編集しない。** 読み込むのは `src/pitch.js`・`src/rules.js`・`src/rules/*.js`・`data/rulesets/strict-2v.js`。 |
| `THIRD_PARTY_NOTICES.md` | 同梱・利用している他者の著作物。ライブラリやフォントを足したらここにも書く。 |
| `test/engine.test.js` | 計算部のテスト。`node test/engine.test.js`。 |
| `docs/legacy/gradus-v5.html` | 分割前の1ファイル版(v5)。参照用。編集しない。 |
| `STATUS.md`・`PLAN.md` | 現状のスナップショット / 未完了の作業と未決の全件。 |
| `docs/` | `DESIGN.md`(設計の決定)、`FUX-EXAMPLES.md`(模範例の書き起こし)、`INVENTORY.md`(部品の棚卸し)。アプリからはリンクしない。 |
| `sw.js`・`manifest.webmanifest`・`icons/` | PWA。同じサイトのファイルはネットワーク優先(オフライン時だけキャッシュ)。アプリのファイルを変えたら `sw.js` の `CACHE` の番号を上げ、新しいファイルは `SHELL` に足す。 |
| `tools/shot.py` | スクリーンショット(1280/390px、ライト/ダーク)。 |
| `LICENSE` | 著作権表示(All rights reserved)。 |

## 設計の要点(壊しやすい所)

**1. engine.js は DOM・localStorage・state に触れない。**
ブラウザ本体・Worker・Node のどこでも同じに動くこと。画面の都合(色、座標)は app.js と score.js に置く。

**2. 音の表現は `{s, a}`。**
`s` = オクターヴ×7 + 音名番号(C=0 … B=6)、`a` = 臨時記号(−1/0/+1)。C4 = 28。`midi(n)` で MIDI 番号、`nameOf(n)` で「F♯4」、`noteStr(n)` で保存用の「F#4」。
`N`・`midi`・`interval`・`motion` は書法コアの関数を呼ぶ薄い包み(`{s, a}` ⇔ コアの `{step, alter}`)。`N` が読むのは今までどおり `[A-G][#b]?数字` だけ。
音程は**綴りで**判定する(`interval` が `{d, dn, q, perfect, cons}` を返す。`d` は度数−1、`q` は P/M/m/A/d)。MIDI 番号の差で代用しない(増4度と減5度を区別するため)。

**3. 対旋律は「スロット」の並び。**
`buildSlots(sp, n, rhythm, ties)` が `{i, m, b, dur, rest, optRest, tiedFrom, tieTo}` の配列を作る(`m` 小節、`b` 拍(0〜3)、`dur` 拍数)。
値は `cp["m:b"]`(`skey(slot)`)に保存し、`valsOf(S, cp)` で各スロットの音に展開する。タイで続く側(`tiedFrom != null`)は編集不可で、値は元のスロットから引く。
判定 `analyze(ctx)` の `ctx` は `{sp, cf, above, slots, vals, rhythm, ties, levels?}`。`levels`(`{規則id: 'err'|'warn'|'off'}`)は判定の基準で、指摘の段階を置き換えるだけで線引きは変えない。解答探索・復習・ドリル・「学ぶ」には渡さない(常にフックス厳格)。

**4. 判定結果の形。**
`issues[]` の各要素は `{id, lv:'err'|'warn', cols:[slot index…], t:見出し, x:説明}`。声部対の規則(交差・平行・反行・隠伏・大きな跳躍・音域)は書法コアの `judge`(ruleset `strict-2v`)が判定し、`analyze` が今までの id(`antiparallel`・`leapBig`・`range`)とこの形に戻して、今までと同じ位置に並べる(下の「書法コア」)。`id` は `RULES` のキーで、復習の集計と出題(`INJECT`)がこれに依存する。**新しい規則は `RULES` に名前を足し、`INJECT` に出題できる類を書く。**
`err` は規則違反、`warn` は注意(様式上の推奨)。採点は `grade(r, ctx)`(授業用の罰点表: 規則ごとに3・2・1点、`POINTS`。3度・6度の連続は累進、完全協和の使いすぎは全体減点)。合格 = 書き終えていて `err` が0。

**5. 保存。**
localStorage キー `gradus-v2`、構造 `{drafts, prefs, history, stats, cfs, cfSeq, drillStats}`(`prefs` に判定の基準 `levels`・拡大率 `zoom` も入る)。旧 `gradus-drafts-v1` は読み込み時に移行。**構造を変えるときは移行処理を書き、書き出し/読み込み(`exportJSON`・`importFrom`)も合わせる。**
保存のたびに `persist()`(書き込みは400msにまとめ、ページを閉じるときに書き切る。すぐ書く必要があるときは `persistNow()`)。保存データ・読み込んだデータは `normStore()` が1項目ずつ検査するので、項目を足したらそこにも検査を足す。`state` の変更で Undo に残すものは `commit(snapshot)` を通す。

**6. 重い計算は Worker。**
`task(type, args, chan)` が Promise を返す(`solve`・`genCF`・`question`・`cfSolvable`・`drill`)。`chan`(`'drill'`・`'review'`)を付けると、同じ `chan` の古い依頼は Worker ごと打ち切られ、reject される(呼ぶ側は try/catch で受ける)。Worker が作れない環境では本体スレッドで同じ関数を実行する。新しい重い処理は `worker.js` の `TASKS` と `app.js` の `runLocal` の両方に足す。

**7. 楽譜。**
音符・臨時記号・休符・タイ・音部記号は VexFlow が置く。選択枠、誤り/注意の色、音程と進行の行、平行線、最高音の印、候補の点、解答例の重ね表示は、`geo`(各スロットの x、枠の左右、各段の第5線の y と音)から app.js が描く。
`.vfw text{font-family:Bravura,Academico}` は必須(これがないと符頭が文字化けする)。
楽譜が横にはみ出すときは、画面の幅にかかわらず小節の縮小図を出し、選んだ音を追う(`staffOverflows`)。再生中は楽譜を描き直さず、再生位置の枠 `#playMark` だけを `markPlaying` で動かす。
VexFlow が使えないときは手描き表示(`drawStaffLegacy`)に切り替わる。この経路は壊さない範囲で放置してよい(新機能で対応しなくてよい)。

**8. 著作権。**
オープンソースのライセンスは付けない(`LICENSE`: All rights reserved、著作権者 jun)。ライブラリ・フォント・素材を足したら `THIRD_PARTY_NOTICES.md` と画面下の表示に書く。収める譜例は、保護期間の終わった出典(フックス1725年原典など)から書き起こしたものか、このアプリの解答例だけ。

**9. Claude上のページでは使えないもの。**
ダウンロード、MIDI、マイク、Service Worker、外部サイトへの fetch。機能は「使えなければ隠す/代替する」で作る(例: 書き出しはテキスト表示でも渡せる)。

## 書法コア(dojo-shared)

- 使っている版: **core 0.4.1**(`vendor/dojo-shared/core/VERSION`)。親フォルダの `dojo-shared/core/` からコピーしたもの。
- 使っているもの: `pitch.js`(`N`・`midi`・`interval`・`motion` の中身)と、規則エンジン `rules.js`・`rules/*.js`・ruleset `data/rulesets/strict-2v.js`(声部対の規則6つ。`analyze` の `coreView` が判定の入力を作り、`fromCore` が結果を GR の形に戻す)。
- コアの規則 id は統一後のもの(`contrary`・`leap`・`ambitus`)。画面・保存・プリセット・出題(`INJECT`)には今までの id(`antiparallel`・`leapBig`・`range`)を使う。id の変更と利用者の設定の移行は段階3a。
- **コアのコピーは直接編集しない。直すときは `dojo-shared` で直して版を上げ、コピーし直す。** アプリの都合はコアの外(engine.js の包み)で吸収する。
- 取り込み直す手順: `dojo-shared/core/` の `VERSION`・`CHANGELOG.md`・`src/`(`src/rules/` を含む。`.gitkeep` などは要らない)・`data/rulesets/strict-2v.js` と `.json` を `vendor/dojo-shared/core/` に上書きでコピー → 新しく読み込むファイルを `index.html`・`js/worker.js` の `importScripts`・`sw.js` の `SHELL` に足す → `sw.js` の `CACHE` を上げる → `node test/engine.test.js` と画面の確認。コピーとアプリの変更は、dojo-shared の変更とは別のコミット。
- コアの版で何が変わったかは `vendor/dojo-shared/core/CHANGELOG.md`。判定結果が変わる版(MINOR が上がる)では、変わった判定を作者が確認してから取り込む。

## 文言の決まり

- 画面の文は「です・ます」で、短く。専門用語は初めて出る所で一言説明する。
- 既存の用語を使う: 定旋律、対旋律、類、拍頭(強拍)・弱拍、協和・不協和、完全協和・不完全協和、反行・斜行・並行・平行、隠伏、経過音・刺繍音・カンビアータ・掛留(準備・解決)、導音、終止、頂点(最高音)、変化音。新しい呼び名を作らない。
- 指摘の文(`x`)は「何がだめか → どうすればよいか」の順で、1〜2文。
- コードの中のコメントは英語でも日本語でもよいが、「なぜそうしているか」を書く。

## コミット

- コミットメッセージは英語。件名は命令形で50文字以内を目安、末尾にピリオドを付けない。詳細は1行空けて本文に、72文字程度で折り返す。本文に箇条書きで要点。
- 1項目=1コミット。テストが通ってから。

## ブランチと公開(D25)
- 作業は `dev` ブランチで行う。`main` は公開中の版だけにする。`main` への取り込みと push は作者が頼んだときだけ。
- 公開のたびに版のタグ(`v1.3.0` など)を打つ。問題が出たら直前のタグに戻す。
- 保存データ(localStorage など)の移行は新しいキーに書き、古いキーは消さずに残す(古い版に戻しても壊れないように)。
- `sw.js` があるので、公開のたびに `CACHE` の番号を上げる。

## ドキュメント更新
- 作業の終わりに STATUS.md を上書き更新（50行以内、updated を更新）
- 完了した作業は PLAN.md から削除し、STATUS の「実装済み」に要約
- 外部素材を追加・削除したら THIRD_PARTY_NOTICES.md を更新
- OS・ブラウザ対応が変わったら STATUS の os: と対応状況を更新（未確認を「対応」と書かない）
- 詳細方針は道場シリーズ親フォルダの DOCS-POLICY.md を参照
