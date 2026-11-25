# Gradus 対位法ドリル — 中身の一覧(INVENTORY)

道場シリーズの共通部品(書法コア)を検討するための一覧。2026-11-20 時点のコミット `2ebeb08` のコードを読んで書いた。
推測は「(推測)」と明記している。
行番号は目安。

---

## 1. 概要

- **アプリ名**: Gradus 対位法ドリル(リポジトリ `cellish/gradus-dojo`)
- **目的**: フックス『Gradus ad Parnassum』(1725)の類別対位法(第1〜5類、2声)の練習。画面はすべて日本語。
- **主な機能**(タブ: 学ぶ・練習・ドリル・記録。`index.html` の `nav.tabs`)
  - 練習: 定旋律に対旋律を書く。規則の即時判定、罰点による採点、解答例との比較(重ね表示・聴き比べ)、Undo/Redo、下書きの自動保存
  - 定旋律: フックスの6旋法の定旋律、自動生成(全類で解けるか確かめたものだけ)、文字での入力
  - 復習: 苦手な規則の違反を1か所だけ含む問題を作って出す(`makeQuestion`)
  - 穴埋め課題: 解答例の一部を空欄にして埋めさせる(`startFill`・`pickBlanks`)
  - 小ドリル8種: 音程(目/耳)、進行の種類、不協和の種類、平行を聴く、掛留の解決、終止の型、ムジカ・フィクタ
  - 学ぶ: 類ごとの解説、フックスの模範例10例、悪い例と直し方、誘導付き課題
  - 判定の基準の切替(フックス厳格/ゆるめ/規則ごと)、記録(解答の履歴・苦手な規則・ドリルの成績)、記録の書き出し/読み込み
  - 再生(Web Audio)、MIDI 鍵盤のステップ入力、楽譜の拡大(100/130/160%)と追従、ライト/ダーク
- **言語・作り**: 素の JavaScript(IIFE を `<script src>` で順に読む。import/export なし)。フレームワーク・npm 依存・ビルドなし。CSS 1ファイル。テストは Node(`node test/engine.test.js`、26件、約20秒)。スクリーンショットは Python + Playwright(`tools/shot.py`)。
- **公開**: Claude上のページ(Artifact、非公開)。リポジトリ直下をそのまま PWA として配信できるが、GitHub Pages は未公開(`docs/DESIGN.md`「保存・配布・権利」)。
- **ファイル構成**

| ファイル | 行数 | 役割 |
|---|---|---|
| `index.html` | 168 | 画面の骨組み、スクリプトの読み込み、SW の登録、画面下の著作権表示 |
| `js/engine.js` | 516 | 計算部(音・音程・スロット・判定・採点・解答探索・定旋律の生成と検査・復習問題)。`globalThis.GE` |
| `js/drills.js` | 282 | 小ドリルの出題(純粋)。`globalThis.GD` |
| `js/lessons.js` | 252 | 「学ぶ」の教材データと譜例の組み立て。`globalThis.GL` |
| `js/worker.js` | 19 | Web Worker。重い計算を別スレッドで |
| `js/score.js` | 143 | VexFlow による浄書。`globalThis.GScore` |
| `js/app.js` | 1354 | 画面・操作・保存・音・MIDI のすべて |
| `css/app.css` | 390 | 見た目(色トークン、ダーク対応) |
| `sw.js`・`manifest.webmanifest`・`icons/` | | PWA |
| `vendor/` | | VexFlow 5.0.0(Bravura・Academico 埋め込み)とライセンス文 |
| `test/engine.test.js` | 261 | 計算部のテスト |
| `docs/DESIGN.md`・`STATUS.md`・`PLAN.md`・`docs/FUX-EXAMPLES.md` | | 設計の決定、現状、未完了の作業、模範例の書き起こし |
| `docs/legacy/gradus-v5.html` | 1327 | 分割前の1ファイル版(参照用) |

---

## 2. 音楽データの表し方(最重要)

### 音高: 綴りで持つ `{s, a}`(`js/engine.js` 冒頭)
- `s` = オクターヴ×7 + 音名番号(C=0 … B=6)、`a` = 臨時記号 −1/0/+1。**C4 = 28**(科学式オクターヴ。`midi()` で C4 = 60)。
- **異名同音を区別する**(C♯4 = `{s:28,a:1}`、D♭4 = `{s:29,a:-1}`)。重嬰・重変(±2)は扱わない(`N()` の正規表現が `#`/`b` 1つだけ)。
- 関数: `N('F#4')`(文字→音)、`midi(n)`、`nameOf(n)`(表示用「F♯4」)、`noteStr(n)`(保存用「F#4」)、`cpy(n)`。
- 保存・データ中は文字列(`'D4 F4 E4 …'`)、計算中は `{s,a}`。
- MIDI からの変換は app.js の `midiToNote`(黒鍵を C♯・E♭・F♯・G♯・B♭ に固定で綴る)。
- 周波数は app.js の `freq(n) = 440·2^((midi−69)/12)`(平均律)。

### 音程(`interval(lo, hi)`)
- 返り値 `{d, dn, q, semi, perfect, cons}`。`d` = 度数−1(複音程そのまま)、`dn` = `d % 7`、`q` = `P/M/m/A/d`、`semi` = 半音数。
- 綴り(`s` の差)で度数を、MIDI の差で質を決める。増4度と減5度を区別する。
- `cons` は2声の厳格対位法の協和(完全1・5・8度、長短3・6度)。**完全4度は不協和**。
- `vInfo(cf, cp, above)` が上下を入れ替えて音程を求め、交差を `crossed` で返す。
- `ivName(v)` → 「長6度」。`motion(a0,a1,b0,b1)` → `contrary/oblique/similar/none`(MIDI 差の符号で判定)。

### 音価・拍・小節: 「スロット」(`buildSlots(sp, n, rhythm, ties)`)
- 4/4 固定。定旋律は1小節に全音符1つ(`cf[m]`)。
- 対旋律はスロットの配列。1つは `{i, m, b, dur, rest, optRest, tiedFrom, tieTo, tieNext, x}`(`m` 小節、`b` 小節内の拍 0〜3.5、`dur` 拍数 4/2/1/0.5)。
- 類ごとにリズムが決まる(第1類 [4]、第2類 [2,2]、第3類 [1,1,1,1]、第4類 [2,2]+タイ)。第5類だけ小節ごとに型を選ぶ(`PATTERNS` の id、例 `'hqq'` = 2分+4分2つ)。
- 値は `cp["m:b"]`(`skey(slot)`)に置き、`valsOf(S, cp)` でスロット順の配列に展開する。タイの後ろ側は元のスロットの値を引く。
- 拍子・テンポ・調号の情報は持たない(テンポは再生時に画面の値を読む)。

### 声部
- **2声だけ**。定旋律 `cf: [{s,a}…]`(1小節1音)と対旋律 `cp`(スロット)を別の形で持つ。対旋律が上か下かは `above: boolean`。
- 3声以上や、2声が同じ形(どちらもスロット)になる表し方はない。

### 和音
- **なし**。コードネーム・ローマ数字・数字付き低音のいずれも持たない。判定は2音間の音程だけ。

### 調・旋法
- 調号・転調はない。旋法(教会旋法6つ)を終止音で判定する: `MODES`(id → 日本語名、終止音)、`FINAL_MODE`、`modeOf(notes)`(最後の音の音名から)。
- 変化音は臨時記号として音ごとに持つ(導音の♯、B♭)。判定 `ficta` が「終止の導音の♯と B♭ 以外」を注意にする。

### データの例
```js
// 定旋律(engine.js FUX)
['dorian','D4 F4 E4 D4 G4 F4 A4 G4 F4 E4 D4']
// 判定に渡す ctx(analyze の引数)
{sp:2, cf:[{s:30,a:0},…], above:true, slots:buildSlots(2,11,[],[]),
 vals:[{s:37,a:0}, null, …], rhythm:[], ties:[], levels:{hidden:'warn'}}
// 判定結果の1件
{id:'parallel', lv:'err', cols:[3,4], t:'平行5度', x:'完全協和音程を同じ方向に続けると…'}
// 保存される下書き(store.drafts['2-dorian-above'])
{cp:{'0:0':'…'}, rhythm:[], ties:[]}   // cp の値は {s,a}(JSON)
```

---

## 3. 機能ごとの実装

| 項目 | 有無 | 場所・作り |
|---|---|---|
| 楽譜表示 | あり | `js/score.js` `GScore.engrave(model)`。VexFlow 5.0.0 を `vendor/vexflow-bravura.js`(同梱、`<script src>`、`window.VexFlow`)で使う。2段(声部ごとに1段)、音部記号は加線の少ないほうを `pickClef` で選ぶ。SVG を画面外の div に描き、`innerHTML` と座標 `geo`(`slotX`・`slotL/R`・各段の第5線の y など)を返す。選択枠・色・音程の行・平行線などは app.js `drawStaffVF` が `geo` から SVG を重ねる。結果は最大40件キャッシュ。VexFlow かフォントが使えないときは app.js `drawStaffLegacy`(手描き、Noto Music)。`.vfw text{font-family:Bravura,Academico}` が必須。 |
| MIDI 入力 | あり | app.js `midiEnable`・`onMidi`・`midiNote`・`midiToNote`。Web MIDI、ノートオンだけ。選択中のスロットに入れて次へ進むステップ入力。黒鍵の綴りは固定(`MIDI_SPELL`)。Claude上のページでは使えない旨を表示。 |
| 音の再生 | あり | app.js `ensureAudio`・`tone`・`playSlot`・`playCols`・`playAll`。Web Audio の発振器(三角波+1オクターヴ上の正弦波、ローパス、エンベロープ)。定旋律を左、対旋律を右へパン。サンプル音源なし。ドリルは `playScore`・`playSnippet`。 |
| マイク入力・音高判定 | なし | 段階3の候補(`PLAN.md`)。 |
| 音程・調の計算 | あり | engine.js `interval`・`vInfo`・`motion`・`modeOf`・`melBad`。コードの計算はなし。 |
| 規則の判定 | あり | engine.js `analyze(ctx)`。規則 id 33個(`RULES`)、既定の段階 `RULE_LV`、プリセット `PRESETS`(`fux`・`lenient`)。不協和の種類(経過音・刺繍音・カンビアータ・掛留)を `dis[]` に返す。定旋律だけの検査は `cfIssues`。 |
| 採点 | あり | engine.js `grade(r, ctx)`。罰点表 `POINTS`(3・2・1点)、3度・6度の連続は累進、完全協和の使いすぎは全体減点。合格 = 書き終えていて `err` が0。 |
| 解答探索 | あり | engine.js `solve`/`solveOnce`/`solveFor`。乱数つき深さ優先探索、時間制限つき。各手で `analyze` を呼ぶ。厳しい段階(`STRICT` の注意も避ける)は、短い時間で乱数を変えて何度もやり直し、見つからなければゆるい段階で探す。Worker で実行(`js/worker.js` `TASKS`、app.js `task()`・`runLocal`。`task` の第3引数(ドリル・復習)が同じ新しい依頼は、古い依頼を打ち切る `supersede`)。 |
| 課題・問題データ | あり | JS の中に直接書く。定旋律 `FUX`(engine.js)、模範例 `GL.LESSONS`(lessons.js、対旋律を文字列で、注釈の位置は `'3-2'` 形式)、ドリルは出題関数 `DRILLS[].make`(drills.js、問題は毎回生成。形は drills.js 冒頭のコメント)。復習問題は `makeQuestion` が生成。外部ファイルの課題データはない。 |
| ファイルの読み書き | 一部 | 記録全体の JSON だけ(app.js `exportJSON`・`exportFile`・`importFrom`。形は `{app:'gradus', format:2, exported, data:store}`)。ダウンロードできないときはテキスト表示。定旋律の文字入力は `parseCF`(`D4 F#4 Bb3`、`is/es`、オクターヴ省略可)。**MusicXML・MIDI ファイルはなし**(段階3の候補)。 |
| 言語切替 | なし | 日本語のみ(`<html lang="ja">`)。文言は各 JS に直接書いている。 |
| 保存 | あり | localStorage `gradus-v2`(app.js `loadStore`・`persist`。書き込みは400msにまとめ、ページを閉じるときに `persistNow` で書き切る。失敗したら知らせる。読み込み時は `normStore` が1項目ずつ検査し、壊れた項目を捨てる)。構造 `{drafts, prefs, history, stats, cfs, cfSeq, drillStats}`。旧キー `gradus-drafts-v1` から移行。下書きのキーは `` `${sp}-${mode}-${above?'above':'below'}` ``。履歴は最大300件、生成した定旋律は最大60件。 |
| PWA・オフライン | あり | `sw.js`(`CACHE='gradus-v13'`、`SHELL` を事前キャッシュ、同じサイトのファイルはすべてネットワーク優先でキャッシュを更新、Google Fonts は別キャッシュ `gradus-fonts`)。登録は https のときだけ(`index.html` 末尾)。`manifest.webmanifest`。 |
| 著作権表示 | あり | `LICENSE`(All rights reserved、jun)、`THIRD_PARTY_NOTICES.md`、`index.html` の `footer.credits`。模範例の出典は `docs/FUX-EXAMPLES.md` と `GL.SOURCE`。 |

保存の中身の形(app.js から読み取ったもの):
- `history[]`: `{id, t, key, sp, mode, label, cfNotes:'D4 F4 …', above, cp, rhythm, ties, preset, pts, pass, errs, warns, complete}`
- `stats[規則id]`: `{n, nw, r, w, sp, t}`(誤りの回数、注意の回数、復習の正解・不正解)
- `cfs[]`: `{id, kind:'gen'|'user', label, notes:'…', t}`
- `drillStats[ドリルid]`: `{n, ok, streak, best}`
- `prefs`: `{sp, mode, above, hint, fb, ivMode, levels, zoom, tempo, midi}`

### 規則の一覧(`RULES` の id。ほかのアプリの規則と突き合わせる用)

既定の段階は `RULE_LV`。「注意」以外は誤り。罰点は `POINTS`(書いていないものは1点)。

| 分類 | id(既定が注意のものに ※、罰点が1点でないものに点数) |
|---|---|
| 縦の響き | `dissonance`(2)、`weakdis`(2)、`first`、`last`、`unison`、`spacing`※、`crossing` |
| 掛留(第4・5類) | `susp`(2)、`prep`(2)、`syncBreak`※ |
| 進行 | `parallel`(3)、`antiparallel`(3)、`hidden`(2)、`beatpar`(2。第4類と第3・5類は注意)、`run`※(累進) |
| 旋律 | `chromatic`、`repeat`※、`leapBig`、`leapAug`、`sixth`※、`comp`※、`twoLeaps`※、`range`※、`climax`※、`ficta`※ |
| 終止 | `cadStep`、`leading`、`cadForm` |
| 第5類 | `rhythm`※、`eighthStep`(2)、`eighthPlace`、`eighthUp`※、`eighthMany`※ |

- 復習で出題できる規則と類は `INJECT`(例 `parallel:[1,2,3,5]`)。
- 解答探索は「注意」の一部も避ける(`STRICT`)。

---

## 4. 依存関係

- **同梱**: VexFlow 5.0.0(2025-03-05 ビルド、MIT)。Bravura 1.392・Academico 0.902(OFL 1.1)を埋め込んだ版 `vendor/vexflow-bravura.js`。
- **外部(CDN)**: Google Fonts の Noto Sans JP、Shippori Mincho、IBM Plex Mono、Noto Music(`index.html` の `<link>`)。
- **npm・バンドラ**: なし。テストは Node の `assert` だけ。
- **開発用**: Python 3、Playwright(`tools/shot.py`)。
- **他のアプリからのコピー**
  - `vendor/vexflow-bravura.js` は reharm-dojo のものと同じファイル(md5 が一致することを確かめた)。
  - そのほかのコードがほかの道場から来たかは、コードからは分からない。`docs/legacy/gradus-v5.html` はこのアプリ自身の旧版。

---

## 5. 共通化の候補

### 共通にしやすいもの
- **音の表し方 `{s,a}` と `N`・`midi`・`nameOf`・`noteStr`・`interval`・`ivName`**(engine.js 冒頭の約30行)。
  DOM に依存しない小さな純粋関数。綴りで音程を判定するので、和声や声部書法のアプリでも使える。ただし重嬰・重変(±2)は扱わない。ほかの道場で調の多い課題を扱うなら広げる必要がある(推測)。
- **`motion`(反行・斜行・並行)と、平行・隠伏5度・8度の判定の考え方**(`analyze` の中)。
  声部書法のアプリ全般に共通する。ただし今は「定旋律と対旋律の2声」という形の中に書かれていて、取り出すには書き直しが要る。
- **判定結果の形 `{id, lv, cols, t, x}` と、段階の上書き `levels`(err/warn/off)・`RULE_LV`・`PRESETS`**。
  規則エンジンを持つアプリなら、同じ形で画面(色付け・一覧・集計)を共通にできる。
- **罰点採点 `grade` の枠組み**(規則ごとの点数表+全体減点)。規則 id と点数表を差し替えれば流用できる。
- **浄書の分担**: 「VexFlow で描き、座標 `geo` を返し、重ね表示はアプリが描く」という `score.js` の形。VexFlow の同じファイルを reharm-dojo と共有している。
- **Web Audio の簡易音源 `tone`**、**Web MIDI のステップ入力**、**Worker の呼び出し `task()` と本体スレッドでの代替 `runLocal`**。
- **保存の決まり**(1キーにまとめる、移行処理、JSON の書き出し/読み込み、ダウンロードできないときはテキスト表示)、**PWA の `sw.js` の作り**、**著作権表示の3点セット**。
- **Claude上のページで使えない機能を隠す/代替する作り**(MIDI、ダウンロード、SW)。

### 共通にしにくいもの
- **スロット `buildSlots` と第1〜5類のリズム**: 「定旋律1小節=全音符1つ、4/4 固定」が前提。一般の楽譜データ(任意の拍子・音価・複数声部)にはそのままでは使えない。
- **判定 `analyze` の大部分**: 掛留・カンビアータ・8分音符の扱いなど、フックスの2声類別対位法に固有。規則が1つの関数の中にまとまっていて、規則ごとに分かれていない。
- **解答探索 `solve`・定旋律の生成 `genCF`・`cfIssues`**: 厳格対位法の旋律の規則に固有で、`analyze` に依存する。
- **`score.js` の中身**: 2段・定旋律が全音符・音部記号の選び方が対位法用。和音(1つの符尾に複数の符頭)や調号、大譜表の多声部には対応していない。
- **小ドリル・「学ぶ」の教材・文言**: 内容がこのアプリの理論に固有。ドリルの問題の形(`{prompt, score, choices, explain}`)は流用できるかもしれない(推測)。
- **app.js**: 1354行に画面・状態・保存・音・MIDI が一緒に入っていて、部品として切り出すには分割が要る。

---

## 6. 既知の問題

- `engine.js` に画面の座標が残っている(`LEFT`、スロットの `x`、`SPECIES[].MW`)。計算部は画面の都合を持たないという方針に合わない。app.js も `G.LEFT` を使う。
- 同じ処理の重複: `drills.js` の `cpy`・`ivLabel` は engine.js の `cpy`・`ivName` と同じ。app.js の `ivLabel(v)` は別物(表示の切替用)で、名前が重なっている。
- 解答探索は乱数つき深さ優先探索で、時間切れで「見つからない」ことがある(第4類の下声で起きやすい。`PLAN.md`「既知の問題」)。厳しい段階で答えが見つからない定旋律では、解答例に注意が多く残る(第2類エオリアの上声など)。
- 第4類で対旋律が下のとき、最初の掛留が規則上成り立たない定旋律がある(自動生成では全類で解けるものだけを使う)。
- 定旋律の自動生成はフックスのものほど自然でないことがある。
- MIDI の黒鍵は固定の綴り(D♯・A♭ などは入力後に直す必要がある)。
- 手描き表示 `drawStaffLegacy` は新しい機能に対応していない(方針として放置)。
- 未決(`PLAN.md`): 声部の交差の扱い、ドリル 2f・2b の設定、講義の分量、第2〜5類の罰点の割り当て、教科書別の判定の基準。2026-11-25 の点検の未決(変化音の注意の範囲、埋め合わせの厳しさ、メニューの配置、狭い画面の操作の行、フィクタのドリル、Claude上のページの書体)。
- TODO・FIXME のコメントはない(js・css・index.html・sw.js・test を検索)。
- 気になる設計
  - `analyze` が約170行の1関数で、規則の追加がこの関数の編集になる。
  - `solve` が各候補で `analyze` を丸ごと呼ぶ(計算量が大きい。Worker・時間制限・やり直しで吸収している)。
  - `app.js` の操作はテストされていない(テストは計算部・ドリル・教材だけ)。
  - 問題データ・教材・文言が JS に直接書かれていて、言語切替や外部データ化の余地がない。
  - `motion` は MIDI 差で、音程は綴りで判定している(意図どおりだが、混在に注意)。

---

## 7. 作者のメモ

### 共通にしたい部分:

### このアプリに残したい部分:
