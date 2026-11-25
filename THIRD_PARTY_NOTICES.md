# 同梱・利用している他者の著作物

Gradus 対位法ドリル(gradus-dojo)は、次のソフトウェアとフォントを使っています。このアプリ自身の著作権表示は `LICENSE` にあります。それぞれの著作権は各権利者にあり、各ライセンスに従って利用しています。

## 同梱しているもの(`vendor/`)

| 名前 | 用途 | 権利者 | ライセンス | ライセンス文 |
|---|---|---|---|---|
| VexFlow 5.0.0 | 楽譜の描画 | VexFlow contributors、Mohit Muthanna Cheppudira | MIT License | `vendor/VEXFLOW-LICENSE` |
| Bravura 1.392 | 楽譜の記号のフォント(`vexflow-bravura.js` に埋め込み) | Steinberg Media Technologies GmbH | SIL Open Font License 1.1 | `vendor/BRAVURA-LICENSE.txt` |
| Academico 0.902 | 楽譜の文字のフォント(同上) | Steinberg Media Technologies GmbH | SIL Open Font License 1.1 | `vendor/ACADEMICO-LICENSE.txt` |

`vendor/vexflow-bravura.js` はリハモ道場(cellish/reharm-dojo)で使っているものと同じファイルです。

## 外部から読み込んでいるもの(同梱していない)

| 名前 | 用途 | 提供元 | ライセンス |
|---|---|---|---|
| Noto Sans JP、Shippori Mincho、IBM Plex Mono | 本文・見出し・数字のフォント | Google Fonts | SIL Open Font License 1.1 |
| Noto Music | VexFlow が読み込めないときの予備の楽譜表示 | Google Fonts | SIL Open Font License 1.1 |

外部から読み込んでいるフォントをアプリに同梱する場合(オフライン専用の配布など)は、SIL Open Font License 1.1 のライセンス文も同梱する必要があります。

## 収めている作品(譜例・定旋律)

| 作品 | 作者と没年 | 状態 |
|---|---|---|
| 6つの定旋律(ドリア・フリギア・リディア・ミクソリディア・エオリア・イオニア) | J. J. フックス(1741年没)『Gradus ad Parnassum』1725年 | 保護期間終了(日本・米国とも) |
| 「学ぶ」タブの模範例(第1〜5類、上声・下声の計10例) | 同上の英訳『Practical Rules for Learning Composition』(ロンドン、Welcker 刊、18世紀) | 保護期間終了(日本・米国とも) |
| 自動生成した定旋律、解答例、復習・練習の課題 | このアプリが作成 | jun の著作物として扱う |

定旋律はフックスの1725年原典(IMSLP などのスキャン)から、模範例は18世紀の英訳(IMSLP #370587)から書き起こしたものです。書き起こしの方法と原書のページは [`docs/FUX-EXAMPLES.md`](docs/FUX-EXAMPLES.md) にあります。現代の翻訳や校訂版からは写していません。
