# Mürekkep

Mürekkep (Turkish for "ink") is a markup language written in plain text. It does what Markdown does with its own rules. It also knows something Markdown does not: text that is still being written. Alternatives, margin notes, gaps to fill in later and deleted but kept sentences are part of the document.

```
= Liman Gecesi [taslak]

Ece limana indiğinde saat çoktan ?? geçmişti.^[Saati sonra netleştir.]
Liman {sessizdi | ölü gibiydi | uyuyordu}. Rıhtımda tek bir fener yanıyordu.  >> fener sonra önemli olacak
~~Hava çok soğuktu.~~ Rüzgâr denizden /tuz ve pas/ kokusu getiriyordu.
```

## Two modes

- **Clean reading:** The document looks like a finished text. Margin notes, questions and struck lines are hidden, and the first of each set of alternatives is shown.
- **Working:** Everything is visible. Notes sit in the margin, struck lines are crossed out and alternatives can be switched.

Unfilled gaps (`??`) show in both modes, because hiding something that is missing would be misleading.

## Features

- **Writing process:** Alternatives (`{a | b | c}`), notes (`>>` and `^[...]`), questions (`>?`), gaps (`??`), struck lines (`~~...~~`), a drawer for cut text, chapter summaries, word targets and deadlines
- **Chapter status:** A heading can end with `[taslak]` (draft), `[gözden geçir]` (review) or `[bitti]` (done), and the viewer marks the chapter accordingly
- **Variables:** Defined in a `::meta` block and used in the text as `{$name}`
- **Blocks:** Code, tables, notes, warnings, hidden text, scenes, characters, timelines, columns and math (KaTeX)
- **Interactive fiction:** Scenes and flags for branching stories, playable in the editor
- **Data:** Every document can be converted to JSON

The full rules are in [SPEC.mrk](SPEC.mrk), which describes Mürekkep in Mürekkep and doubles as a test document. A short guide is in [rehber.html](rehber.html), and [ornek/Liman Gecesi.mrk](ornek/Liman%20Gecesi.mrk) is a sample that uses every feature. The syntax keywords and the documentation are in Turkish.

## Tools

| | |
|---|---|
| [editor.html](editor.html) | A browser editor with live preview, both modes and scene playback |
| [mrk.js](mrk.js) | A command line tool for HTML and JSON output, statistics and checks |
| [eklentiler/obsidian](eklentiler/obsidian) | An Obsidian plugin that opens `.mrk` files and renders `mrk` blocks inside notes |
| [eklentiler/sublime](eklentiler/sublime) | Syntax highlighting, two color schemes and a preview for Sublime Text |

```
node mrk.js document.mrk               document.html (clean reading)
node mrk.js document.mrk --calisma     document.html (working mode)
node mrk.js document.mrk --json        document.json
node mrk.js document.mrk --istatistik  word count, notes, gaps
node mrk.js document.mrk --kontrol     broken choices, undefined flags
```

Build the Obsidian plugin with `node eklentiler/obsidian/derle.js`. Run the tests with `node test.js`.

Math is rendered with [KaTeX](https://katex.org) (MIT license, in `kutuphane/katex`).

## License

[MIT](LICENSE)
