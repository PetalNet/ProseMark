# @prosemark/katex

## 0.0.0

### Patch Changes

- Add **`@prosemark/katex`**: a KaTeX-based alternative to `@prosemark/latex` with a parallel public API. CodeMirror fold widgets render core **`Math`** nodes (`$...$` / `$$...$$`) via KaTeX (`renderToString`, `output: 'htmlAndMathml'`), with delimiter/formula source highlighting, an optional LRU render cache, inline error UI, and **`requestMeasure`** / **`ResizeObserver`** for block math. Re-export the syntax as **`katexMath*`**. Hybrid display rules match `@prosemark/latex`: `$$...$$` always block; padded single-dollar block; tight single-dollar inline.
