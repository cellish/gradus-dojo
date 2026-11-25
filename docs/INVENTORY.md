# Gradus 対位法ドリル — 中身の一覧(INVENTORY)

道場シリーズの共通部品(書法コア)を検討するための一覧。2026-11-20 時点のコミット `2ebeb08` のコードを読んで書いた。
推測は「(推測)」と明記している。行数は `wc -l` の値。

---

## 1. 概要

**アプリ名**: Gradus 対位法ドリル(リポジトリ `cellish/gradus-dojo`)

**目的**: フックス『Gradus ad Parnassum』(1725)の類別対位法(第1〜5類・2声)を練習する。画面の文言はすべて日本語。

**主な機能**(`index.html` のタブと `js/app.js` の各 `draw*`)
- 学ぶ: 類ごとの解説、フックスの模範例10例(注釈・再生付き)、悪い例と直し方、4手順の誘導付き課題(`drawLearn`、`js/lessons.js`)
- 練習: 定旋律に対旋律を書き、規則をその場で判定・採点する(`render`、`analyze`、`grade`)。ほかに次の機能がある。
  - 解答例と比べる(`solve`)
  - 穴埋め(`state.fill`)
  - 候補の表示
  - 元に戻す/やり直す
- ドリル: 音程(目・耳)、進行の種類、不協和の種類、平行を聴く、掛留の解決、終止の型、ムジカ・フィクタの8種(`js/drills.js` の `DRILLS`)
- 復習: よく間違える規則について、その誤りを1か所だけ含む問題を自動で作る(`makeQuestion`)
- 記録: 保存した解答の一覧、規則別の集計、書き出し/読み込み(`exportJSON`・`importFrom`)
- 定旋律: フックスの6旋法、自動生成(`genCFChecked`)、音名テキストでの入力(`parseCF`)
- MIDI鍵盤でのステップ入力、判定の基準(フックス厳格/ゆるめ/規則ごと)、楽譜の拡大とスマホでの追従

**言語・フレームワーク・ビルド**
- 素の JavaScript(ES2017〜)、HTML、CSS。フレームワーク、npm 依存、ビルドはない。
- スクリプトはモジュールではなく、`<script src>` で順に読む IIFE。読み込み順は次のとおり。
  `vendor/vexflow-bravura.js` → `js/engine.js` → `js/drills.js` → `js/lessons.js` → `js/score.js` → `js/app.js`
- 各ファイルはグローバルに `GE`(engine)、`GD`(drills)、`GL`(lessons)、`GScore`(score)を公開する。engine・drills・lessons は Node では `module.exports` も持つ。

**公開方法**(`CLAUDE.md`・`README.md`)
- Claude上のページ(Artifact。複数ファイルで公開)
- GitHub Pages(リポジトリ直下をそのまま配信する PWA)。Pages を有効にしたかは、コードからは確かめられない。

**ファイル構成**

| ファイル | 行数 | 役割 |
|---|---|---|
| `index.html` | 168 | 画面の骨組み(タブ、課題バー、操作バー、楽譜、引き出し)。Google Fonts の読み込み、SW の登録 |
| `js/engine.js` | 501 | 純粋な計算部。音の表現と音程、スロット、判定、採点、解答探索、定旋律の規則・生成・入力、復習問題、データ |
| `js/score.js` | 143 | VexFlow 5 による浄書。`GScore.engrave(model)` が SVG の中身と座標 `geo` を返す |
| `js/app.js` | 1267 | 画面・操作・保存・音・MIDI・Worker 呼び出し。重ね表示(選択枠・色・音程行)と手描きの予備表示 |
| `js/drills.js` | 282 | ドリルの出題(純粋)。`GD.make(id)` |
| `js/lessons.js` | 252 | 「学ぶ」の教材データと、譜例を組み立てる関数(純粋)。`GL` |
| `js/worker.js` | 19 | Web Worker。`TASKS` で solve・genCF・question・cfSolvable・drill を実行 |
| `css/app.css` | 390 | 見た目。色は `:root` のトークン、ダークは `prefers-color-scheme` と `[data-theme]` で上書き |
| `sw.js` | 66 | Service Worker(`CACHE='gradus-v11'`) |
| `manifest.webmanifest` | — | PWA の定義 |
| `vendor/` | — | VexFlow 5.0.0(Bravura・Academico 埋め込み)とライセンス文 |
| `test/engine.test.js` | 227 | 計算部のテスト(23件、`node test/engine.test.js`) |
| `tools/shot.py` | 62 | Playwright でスクリーンショット(1280/390px、ライト/ダーク) |
| `docs/` | — | `PLAN.md`(作業計画)、`HISTORY.md`(経緯)、`FUX-EXAMPLES.md`(譜例の書き起こし)、`legacy/gradus-v5.html`(分割前の1ファイル版)、本書 |
| `CLAUDE.md`、`README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md` | — | 作業の手引き、説明、著作権表示、他者の著作物の一覧 |

---

## 2. 音楽データの表し方(最重要)

### 音高: 綴り(音名)で持つ。異名同音は区別する
- 音は `{s, a}` で表す(`engine.js` の `N`・`midi`・`nameOf`・`noteStr`)。
  - `s` は全音階上の位置で、`s = オクターヴ×7 + 音名番号`(C=0 … B=6)。C4 = 28。
  - `a` は臨時記号で、−1(♭)、0、+1(♯)の3値。重嬰・重変はない。
- C♯4 = `{s:28,a:1}`、D♭4 = `{s:29,a:-1}` なので、異名同音は**別の音**として扱う。
- MIDI 番号は `midi(n) = 12*(floor(s/7)+1) + PC[s%7] + a`(C4=60)で計算するだけで、保存はしない。
- 文字列の形は2つある。保存用は `noteStr` の `"F#4"`、表示用は `nameOf` の `"F♯4"`。
  - `N("F#4")` が読むのは `[A-G][#b]?\d` だけで、オクターヴは1桁。
  - `parseCF` はもっと寛容で、`♯ ♭ is es` を受け付け、オクターヴを省くと直前の音に近い高さを補う。
- 音程 `interval(lo,hi)` は綴りで判定し、`{d, dn, q, semi, perfect, cons}` を返す。
  - `d` は度数−1、`dn` は単音程化した度数、`q` は `P/M/m/A/d`、`semi` は半音数。
  - 増4度と減5度を区別する。
- 例外として、進行の種類 `motion()` と、同音反復・半音階の判定の一部(`melBad`)は MIDI 番号の差を使う。

### 音価・拍・小節: 「スロット」の並び
- 対旋律は `buildSlots(sp, n, rhythm, ties)` が作るスロットの配列で表す。1小節 = 4拍(4分音符=1)で、音価の表は `PATTERNS` にある。
  ```js
  {i, m, b, dur, rest, optRest, tiedFrom, tieTo, tieNext, x}
  // m: 小節(0〜), b: 拍(0〜3.5), dur: 拍数(4,2,1,0.5), x: 手描き表示用の横位置
  ```
- 類ごとに小節内のリズムは固定である。第1類は全音符、第2類は2分音符×2、第3類は4分音符×4、第4類は2分音符×2+タイ。
- 第5類だけ、小節ごとにリズム型を選ぶ(`PATTERNS` の id。例: `hh`、`qqht`、`qeeqq`)。
- 第4類は `ties[m]===false` でタイを切る。
- 値は `cp["m:b"]`(`skey`)に保存し、`valsOf(S, cp)` でスロットごとの音に展開する。タイで続く側は、元のスロットの値を引く。
- 定旋律は各小節に全音符1つで、配列 `cf: [{s,a}]` で持つ(小節番号 = 添字)。

### 声部
- 2声だけで、定旋律と対旋律を別々に持つ。`above: true` なら対旋律が上声。
- 一般の「声部の配列」という形はない。3声以上には対応していない。
- 譜表は声部ごとに1段で、音部記号は声域から選ぶ(`score.js` の `pickClef`)。

### 和音
**なし**。コードネーム・ローマ数字・数字付き低音は持たない。扱うのは2音の音程だけ。
- 掛留の数字(7-6・4-3・2-3 など)は、ドリル用に音程から計算する(`drills.js` の `suspNum`)だけで、データとしては持たない。

### 調・転調
- 調号はない。旋法は**定旋律の終止音**で決まる(`modeOf`、`FINAL_MODE`。D=ドリア … C=イオニア)。
- 旋法のデータは `MODES` で、名前と終止音を持つ(`{dorian:{name:'ドリア', f:'D4'}, …}`)。
- 変化音(導音の♯、B♭)は、各音の `a` で直接持つ。
- 移調・転調は**なし**。

### 実際のデータの例
```js
// フックスのドリアの定旋律(engine.js FUX)
['dorian','D4 F4 E4 D4 G4 F4 A4 G4 F4 E4 D4']
// 下書き(localStorage gradus-v2 の drafts['1-dorian-above'])。cp の値は {s,a}
{cp:{'0:0':{s:33,a:0},'1:0':{s:33,a:0}, …}, rhythm:[], ties:[]}
// 第5類のリズム(小節ごとの PATTERNS の id)
['rht','qqqq','qqqq','qqht', …, 'hh','w']
// 判定結果の1件(analyze の issues[])
{id:'parallel', lv:'err', cols:[3,4], t:'平行5度', x:'完全協和音程を同じ方向に…'}
```

---

## 3. 機能ごとの実装

| 項目 | 有無 | ファイル・関数 | 作り |
|---|---|---|---|
| 楽譜表示 | あり | `score.js` `engrave`・`engraveNow`。`app.js` `drawStaffVF`・`drawStaff`・`drawSnippet`・`drawStaffLegacy` | 下に詳述 |
| MIDI入力 | あり | `app.js` `midiEnable`・`bindMidi`・`onMidi`・`midiNote`・`midiToNote`・`MIDI_SPELL` | 下に詳述 |
| 音の再生 | あり | `app.js` `ensureAudio`・`tone`・`playSlot`・`playCols`・`playAll`・`playScore`・`stopPlayback` | 下に詳述 |
| マイク入力・音高判定 | **なし** | — | — |
| 音程・調の計算 | あり(コードはなし) | `engine.js` `interval`・`ivName`・`vInfo`・`motion`・`midi`・`modeOf` | 2音の音程と2声の進行だけ。和音・調の計算はない |
| 規則の判定と採点 | あり | `engine.js` `analyze`・`grade`・`RULES`・`RULE_LV`・`PRESETS`・`POINTS`・`cfIssues`・`melBad` | 下に詳述 |
| 解答探索 | あり | `engine.js` `solve`・`solveOnce`・`solveFor`・`STRICT` | 下に詳述 |
| 課題・問題データ | あり | `engine.js` `FUX`・`MODES`・`SPECIES`・`PATTERNS`・`INJECT`・`makeQuestion`。`drills.js` `DRILLS`。`lessons.js` `LESSONS` | 下に詳述 |
| ファイルの読み書き | JSON のみ | `app.js` `exportJSON`・`exportFile`・`importFrom` | 下に詳述 |
| 言語切替 | **なし** | — | 日本語だけ。文言はコードの中に直書きで、i18n の仕組みはない |
| 保存 | あり | `app.js` `loadStore`・`persist`・`normStore`・`savePrefs` | 下に詳述 |
| PWA・オフライン | あり | `sw.js`、`manifest.webmanifest`、`index.html` の登録部分 | 下に詳述 |
| 著作権表示 | あり | `LICENSE`、`THIRD_PARTY_NOTICES.md`、`index.html` の `footer.credits`、`README.md` | 下に詳述 |

**楽譜表示**
- VexFlow 5.0.0 を同梱した `vendor/vexflow-bravura.js` を、グローバル `VexFlow` として `<script src>` で読む。
- 小節ごとに上下2段の `Stave` を作り、`Voice`(SOFT モード)・`Formatter`・`Beam`(8分音符の対)・`StaveTie`・`StaveConnector` を使う。
- 座標 `geo` は次の値を持ち、app.js がこれを使って SVG で重ね描きする。
  `{slotX, slotL, slotR, cfX, measX, measW, up/lo:{topY, topS, clef}, step, top, bottom, rowY, W, H}`
- 浄書の結果は `JSON.stringify(model)` をキーにして、最大40件まで再利用する。
- フォントの準備は `waitFonts` が `document.fonts.check('30px Bravura')` で待つ。
- VexFlow が使えないときは、手描きの `drawStaffLegacy` に切り替わる。
  - ト音・ヘ音の大譜表に固定で、`y()`・`stepAt()`・`SMIN=14`・`SMAX=45` を使う。
  - 音部記号は Noto Music の文字で描く(`CLEF_FONT`)。

**MIDI入力**
- Web MIDI の `requestMIDIAccess({sysex:false})` を使う。note-on(0x9n、ベロシティ>0)だけを受ける。
- 綴りは固定表で決める。白鍵は幹音、黒鍵は C♯・E♭・F♯・G♯・B♭。
- 押した音は選択中のスロットに入り、選択は次の位置へ進む(ステップ入力)。
- 使えない環境ではボタンを隠す。

**音の再生**
- Web Audio で合成する。三角波に、1オクターヴ上のサイン波を足し、ローパスとエンベロープをかける。
- 定旋律は左、対旋律は右に定位する(`StereoPanner`)。
- 音源ファイル・サンプラーは**なし**。
- 再生中は、`setTimeout` で `state.playSlot` を更新して枠を動かす。テンポは `#tempo`。

**規則の判定と採点**
- `analyze(ctx)` は `ctx = {sp, cf, above, slots, vals, rhythm, ties, levels?}` を受け取り、次を返す。
  `{issues, iv, mo, dis, missing, complete, la, stats}`
- 規則は `RULES` に33個ある。指摘は `{id, lv:'err'|'warn', cols, t, x}` の形。
- 判定の基準は `ctx.levels` で決まり、各規則を誤り/注意/無視に置き換える(`PRESETS`: `fux`・`lenient`)。
- 採点は `grade`。罰点は規則ごとに3・2・1点(`POINTS`)で、3度・6度の連続は累進、完全協和の使いすぎは全体から減点する。合格 = 書き終えていて誤りが0。
- 定旋律の規則は別の関数 `cfIssues` で、文字列の配列を返す。

**解答探索**
- `solve` は、時間の上限付きのランダムな深さ優先探索。各候補を `analyze` にかけて刈り込む。
- 厳しめの探索(`STRICT` の規則も避ける)を先に試し、だめなら緩い探索をする。

**課題・問題データ**
- すべてコードの中の定数で、外部ファイルの読み込みはない。
  - 定旋律: `FUX`(文字列)
  - 類の定義: `SPECIES`
  - 復習で出題できる類: `INJECT`
  - 教材: `LESSONS`(対旋律は空白区切りの音名文字列。位置は `'小節-拍'`)
- 生成するもの: 定旋律(`genCF`・`genCFChecked`)、復習問題(`makeQuestion`。解答例の1音を変えて誤りを作る)、ドリル(`GD.make`)。
- 重い生成は Worker で行う(`app.js` `task(type,args)`。Worker が使えなければ `runLocal`)。

**ファイルの読み書き**
- 書き出しは `{app:'gradus', format:2, exported, data:store}` の形の JSON。
  - ダウンロードできない環境(Claude上のページ)では、テキストを表示してコピーしてもらう。
- 読み込みは貼り付けたテキストから。
- MusicXML・MIDI ファイル・ABC は**なし**。

**保存**
- localStorage のキーは `gradus-v2`。構造は次のとおり。
  ```
  {drafts, prefs, history(最大300件), stats, cfs, cfSeq, drillStats}
  ```
  - `drafts` のキー: `"類-定旋律id-above|below"`
  - `prefs`: `{sp, mode, above, hint, fb, ivMode, levels, zoom, tempo, midi}`
  - `history` の各要素: `{id, t, key, sp, mode, label, cfNotes, above, cp, rhythm, ties, preset, pts, pass, errs, warns, complete}`
  - `stats`: 規則 id ごとの `{n, nw, r, w, sp, t}`
- 旧キー `gradus-drafts-v1` は、読み込むときに移行する(`loadStore`)。

**PWA・オフライン**
- `sw.js` はアプリ本体のファイル(`SHELL`)を先にキャッシュする。
  - ページ本体はネットワーク優先、それ以外はキャッシュ優先。
  - Google Fonts は別のキャッシュ(`gradus-fonts`)。
- SW の登録は `https:` のときだけ。

**著作権表示**
- `LICENSE`: All rights reserved、著作権者 jun。
- `THIRD_PARTY_NOTICES.md`: VexFlow(MIT)、Bravura・Academico(OFL)、Google Fonts(OFL)。
- 画面の下にも同じ内容を表示する。
- 譜例は、フックス原典と18世紀の英訳から書き起こした(`docs/FUX-EXAMPLES.md`)。

---

## 4. 依存関係

| 名前 | 版 | 読み込み方 |
|---|---|---|
| VexFlow(Bravura・Academico 埋め込み) | 5.0.0(ファイル先頭の表記: 2025-03-05 ビルド)。Bravura 1.392、Academico 0.902(`THIRD_PARTY_NOTICES.md`) | 同梱の `vendor/vexflow-bravura.js` を `<script src>` で読む。グローバル `VexFlow` |
| Noto Sans JP、Shippori Mincho、IBM Plex Mono、Noto Music | 指定なし | Google Fonts の CSS を `<link>` で読む(CDN) |
| Playwright(Python) | 環境にあるもの | 開発用の `tools/shot.py` だけで使う。アプリは依存しない |
| Node.js | — | テストの実行だけに使う(`assert` 以外の依存はない) |

**他のアプリからコピーしたコード**
- `vendor/vexflow-bravura.js` は、リハモ道場(`cellish/reharm-dojo`)と同じファイル(`THIRD_PARTY_NOTICES.md`、`docs/HISTORY.md` の 2026-11-17 の項)。
- `score.js`・`app.js` の中には、他アプリから写したと書かれたコードは見当たらない。VexFlow の使い方をリハモ道場にそろえた、という記述は `docs/HISTORY.md` にある。具体的にどの関数が同じかは確かめていない。
- `docs/legacy/gradus-v5.html` は、このアプリ自身の旧版。

---

## 5. 共通化の候補

**他の音楽アプリでも使えそうな部分**
- **音の表現と音程の計算**(`engine.js` 先頭の `N`・`midi`・`nameOf`・`noteStr`・`interval`・`ivName`・`motion`)。
  - DOM に依存せず、綴りで判定するので異名同音を区別でき、テストもある。
  - 和声・フーガの道場でもそのまま使える形(推測)。
  - ただし重嬰・重変、2桁のオクターヴには対応していない。
- **音名テキストの入力** `parseCF`: `♯ ♭ is es` を受け付け、オクターヴを補う。旋律を文字で入れる機能に流用できる。
- **浄書の仕組み** `score.js`: 「VexFlow に音符を置かせ、座標 `geo` を返し、重ね表示はアプリ側で描く」という分担。
  - ただし今の `engraveNow` は「2段・1声ずつ・定旋律は全音符」が前提。共通化するなら、段と声部の数を一般化する必要がある。
- **フォント待ちと浄書キャッシュ**(`waitFonts`・`engrave` のキャッシュ)。VexFlow を使うアプリならどれでも必要になる。
- **Web Audio の簡易音源** `tone` と再生の予約(`playAll` の時刻計算)。小さく、依存がない。
- **MIDI のステップ入力**(`midiEnable`〜`midiNote`)。ただし綴りの表 `MIDI_SPELL` は対位法向けに固定されているので、調に応じた綴りが要るアプリでは差し替えが必要。
- **Worker の呼び出し口** `task(type,args)`。Worker が使えないときは、本体スレッドで同じ関数を実行する。
- **判定結果の形と基準の切替**: `{id, lv, cols, t, x}`、`RULE_LV`・`PRESETS`・`ctx.levels`、`grade` の罰点表。規則の中身はアプリごとに違っても、この枠組みは共通にできる(推測)。
- **保存の枠組み**: 1つの localStorage キーに `{drafts, prefs, history, stats…}` を入れ、版を移行し、JSON で書き出す。書き出しは「ダウンロードできなければテキスト表示」で、Claude上のページでも動く。
- **PWA 一式**(`sw.js` の方針、manifest)と、色トークン・ダークモードの CSS の作り。

**このアプリ固有で、共通化しにくい部分**
- **スロットのモデル** `buildSlots`・`PATTERNS`・`skey`。類別対位法の「1小節=定旋律1音」と、類ごとに固定のリズムが前提。和声の「1拍に1和音」やフーガの自由なリズムとは合わない。
- **判定 `analyze` の規則の中身**: 2声の類別対位法の規則(掛留・カンビアータ・類ごとの終止など)が、1つの関数(170行あまり)に書かれている。規則ごとに分かれていないので、一部だけ取り出すのは難しい。
- **解答探索 `solve`・定旋律の生成 `genCF`・復習問題 `makeQuestion`**: 対位法の規則に強く結びついている。
- **教材 `LESSONS`・ドリル `DRILLS`**: 中身がフックスの対位法そのもの。
- **重ね表示**(選択枠、音程・進行の行、平行線、候補の点)は `app.js` の中で `state` と密に結びついている。
- **手描きの予備表示** `drawStaffLegacy`: 大譜表に固定で、新しい機能に追従していない(`CLAUDE.md` で「放置してよい」とされている)。

---

## 6. 既知の問題

- **計算部に画面の値が混ざっている**: `engine.js` の `LEFT=78` と、スロットの `x`(`buildSlots`)は手描き表示のための横位置。「engine は画面の都合を持たない」という方針に反する。`SPECIES[].MW`(小節幅)も同じ。
- **音の表現の範囲**
  - `a` は −1〜+1 だけで、重嬰・重変がない。
  - `N()` が読めるオクターヴは1桁だけ。
  - 手描き表示で書ける範囲は `SMIN=14`〜`SMAX=45`(C2〜F6)。
- **MIDI の綴りが固定**: D♯・A♭ などは MIDI から入力できない(画面のボタンでは入力できる)。
- **`motion()` は MIDI の差で判定する**: 綴りの違う同じ高さの音(例: B♭→A♯)は「動かない」と判定される。対位法ではまず起きない(推測)。
- **同じ処理が2か所にある**: `drills.js` の `cpy`・`ivLabel` は `engine.js` の `cpy`・`ivName` と同じ。
- **解答探索は乱数と時間の上限つき**: 同じ入力でも結果が変わり、時間内に見つからなければ `null` を返す。呼び出し側は、見つからない場合も扱っている。
- **未決**(`docs/PLAN.md`)
  - 声部の交差は誤りのまま(フックス自身の例に、交差する箇所が2つある)。
  - 教科書ごとの判定の基準は作らない(当面)。
- **言語**: 文言はすべて日本語で、コードに直書き。英語版にするには全面的に手が要る。
- **外部フォントに依存する**: 本文のフォントは Google Fonts。初めての表示がオフラインだと、代わりのフォントになる。楽譜のフォントは同梱。
- **`sw.js` のコメントが古い**: 冒頭に「v1 → v2」とある(実際は v11)。害はない。
- `TODO`・`FIXME` のコメントは、`js/`・`css/`・`index.html`・`sw.js` には見当たらない。

---

## 7. 作者のメモ

### 共通にしたい部分:


### このアプリに残したい部分:

