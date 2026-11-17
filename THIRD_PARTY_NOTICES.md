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
