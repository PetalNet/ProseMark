# @prosemark/katex

LaTeX-style math for ProseMark’s Markdown editor: `$...$` and `$$...$$`, rendered with [KaTeX](https://katex.org/). A drop-in alternative to [`@prosemark/latex`](../latex) (which uses MathJax) with a parallel public API.

KaTeX renders **synchronously** and is bundled with this package (no runtime CDN loading), so widgets paint immediately. You only need to load KaTeX’s stylesheet for fonts.

**`Math` / `MathMark` / `MathFormula`** and **`mathMarkdownSyntaxExtension`** live in **`@prosemark/core`** (included in **`prosemarkMarkdownSyntaxExtensions`**). This package adds KaTeX widgets and theme helpers. **`katexMath*`** exports are re-exports of the core math parser symbols.

### Parser: you must enable math in Markdown

**`katexMarkdownEditorExtensions()` only runs on `Math` syntax nodes.** If the Markdown layer never parses `$...$` / `$$...$$` as math, those widgets never attach and formulas stay plain text.

Do **one** of the following:

- Pass **`prosemarkMarkdownSyntaxExtensions`** from **`@prosemark/core`** inside **`markdown({ extensions: [...] })`** (it already includes **`mathMarkdownSyntaxExtension`**), **or**
- Add **`mathMarkdownSyntaxExtension`** from **`@prosemark/core`**, **or** **`katexMathMarkdownSyntaxExtension`** (re-export) from **`@prosemark/katex`**, to **`markdown({ extensions: [...] })`**.

## Install

```bash
bun add @prosemark/katex
```

KaTeX is bundled as a regular dependency. Load its stylesheet once in your app so glyphs and spacing are correct:

```ts
import 'katex/dist/katex.min.css';
```

## Usage

**Full ProseMark markdown** (math included):

```ts
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { prosemarkMarkdownSyntaxExtensions } from '@prosemark/core';
import {
  katexMarkdownSyntaxTheme,
  katexMarkdownEditorExtensions,
} from '@prosemark/katex';
import 'katex/dist/katex.min.css';

const extensions = [
  markdown({
    extensions: [
      GFM,
      prosemarkMarkdownSyntaxExtensions, // includes mathMarkdownSyntaxExtension → Math nodes
    ],
  }),
  ...katexMarkdownSyntaxTheme,
  ...katexMarkdownEditorExtensions(),
];
```

**Math only** (if you assemble Markdown extensions yourself):

```ts
import { mathMarkdownSyntaxExtension } from '@prosemark/core';
// or: import { katexMathMarkdownSyntaxExtension } from '@prosemark/katex';

markdown({
  extensions: [
    GFM,
    mathMarkdownSyntaxExtension,
    // …your other markdown extensions
  ],
});
```

Then add **`katexMarkdownSyntaxTheme`** and **`katexMarkdownEditorExtensions()`** as in the first example.

- **`katexMathMarkdownSyntaxExtension`** — re-export of **`mathMarkdownSyntaxExtension`** from core.
- **`katexMarkdownSyntaxTheme`** — delimiter and formula highlighting.
- **`katexMarkdownEditorExtensions()`** — fold widgets with KaTeX.

### Styling (CSS variables)

Rendered math widgets and source highlighting use `--pm-*` variables on the editor root:

| Variable                                 | Purpose                                                           |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `--pm-katex-math-delimiter-color`        | `$` / `$$` delimiter color (defaults to `--pm-link-color`)        |
| `--pm-katex-math-formula-color`          | Raw formula text before render                                    |
| `--pm-katex-math-formula-font`           | Monospace stack for formula source (defaults to `--pm-code-font`) |
| `--pm-katex-math-error-color`            | Failed render message (defaults to `--pm-syntax-invalid`)         |
| `--pm-katex-math-error-background-color` | Failed render background (defaults to semi-transparent gray)      |

When KaTeX rejects a formula, the widget shows the error message inline (no console required).

### Block vs inline (hybrid)

- **`$$...$$`** → always **block** (display).
- **`$ ... $`** with **leading or trailing space** inside the delimiters → **block**.
- **`$...$`** with no inner padding → **inline**.

### Options

```ts
katexMarkdownEditorExtensions({
  renderCacheSize: 128, // default; LRU of rendered HTML strings, 0 to disable
  katexOptions: {
    // forwarded to KaTeX (macros, trust, strict, fleqn, …);
    // displayMode / throwOnError / output are managed by this package
  },
});
```

## Caching

This package adds an **LRU cache of rendered HTML strings** keyed on the formula and display mode. Set `renderCacheSize: 0` to disable.
