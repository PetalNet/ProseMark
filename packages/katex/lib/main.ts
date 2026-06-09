import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import {
  foldableSyntaxFacet,
  selectAllDecorationsOnSelectExtension,
  SOFT_INDENT_LINE_CLASS,
} from '@prosemark/core';
import type { EditorState, Extension } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import katex from 'katex';
import type { KatexOptions } from 'katex';

import { katexMathDelimiterTag, katexMathFormulaTag } from './markdown';

export {
  katexMathDelimiterTag,
  katexMathFormulaTag,
  katexMathMarkdownSyntaxExtension,
} from './markdown';

const WIDGET_CLASS = 'cm-katex-math';
const WIDGET_ERROR_CLASS = `${WIDGET_CLASS}-error`;
const WIDGET_ERROR_MESSAGE_CLASS = `${WIDGET_CLASS}-error-message`;

export interface KatexMarkdownEditorOptions {
  /**
   * Max entries for the in-memory render cache (rendered HTML string per hit).
   * Helps when the same formula is re-folded while moving the caret. Set to `0`
   * to disable.
   * @default 128
   */
  renderCacheSize?: number;
  /**
   * Extra options forwarded to {@link https://katex.org/docs/options.html KaTeX}
   * (e.g. `macros`, `trust`, `strict`, `fleqn`). `displayMode`,
   * `throwOnError`, and `output` are managed by this package and ignored if
   * provided here.
   */
  katexOptions?: Omit<KatexOptions, 'displayMode' | 'throwOnError' | 'output'>;
}

/** Move key to MRU end in O(1) using a Map as insertion-ordered list. */
class RenderLru {
  private readonly max: number;
  private readonly map = new Map<string, string>();

  constructor(max: number) {
    this.max = max;
  }

  get(key: string): string | undefined {
    const html = this.map.get(key);
    if (html === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, html);
    return html;
  }

  set(key: string, html: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, html);
    while (this.map.size > this.max) {
      const iter = this.map.keys().next();
      if (iter.done) break;
      this.map.delete(iter.value);
    }
  }
}

let renderCache: RenderLru | null = null;
let renderOptions: KatexMarkdownEditorOptions['katexOptions'] | undefined;

const cacheKey = (display: boolean, tex: string): string =>
  `${display ? '1' : '0'}\n${tex}`;

/**
 * Render TeX to an HTML string via KaTeX, using the LRU cache when available.
 * KaTeX throws on parse errors (with `throwOnError: true`); callers route those
 * through {@link formatKatexRenderError}.
 */
const renderToHtml = (tex: string, display: boolean): string => {
  const key = cacheKey(display, tex);
  const cached = renderCache?.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const html = katex.renderToString(tex, {
    ...renderOptions,
    displayMode: display,
    throwOnError: true,
    output: 'htmlAndMathml',
  });

  renderCache?.set(key, html);
  return html;
};

/**
 * Normalizes KaTeX / render failures into a single user-visible message.
 *
 * @internal Exported for unit tests.
 */
export function formatKatexRenderError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.trim();
    return msg || 'KaTeX render failed';
  }
  if (typeof err === 'string') {
    const msg = err.trim();
    return msg || 'KaTeX render failed';
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const raw = (err as { message?: unknown }).message;
    const msg = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (msg) return msg;
  }
  return 'KaTeX render failed';
}

/** Populates a math widget with the render error message. */
const populateKatexMathErrorDom = (
  wrap: HTMLElement,
  err: unknown,
  display: boolean,
): void => {
  const message = formatKatexRenderError(err);

  const messageEl = document.createElement(display ? 'div' : 'span');
  messageEl.className = WIDGET_ERROR_MESSAGE_CLASS;
  messageEl.setAttribute('role', 'alert');
  messageEl.textContent = message;

  wrap.replaceChildren(messageEl);
  wrap.classList.add(WIDGET_ERROR_CLASS);
  wrap.setAttribute('title', message);
};

const blockMathEstimatedHeightPx = 72;

const katexWidgetResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

class KatexMathWidget extends WidgetType {
  constructor(
    public readonly tex: string,
    public readonly display: boolean,
  ) {
    super();
  }

  eq(other: KatexMathWidget): boolean {
    return this.tex === other.tex && this.display === other.display;
  }

  get estimatedHeight(): number {
    return this.display ? blockMathEstimatedHeightPx : -1;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement(this.display ? 'div' : 'span');
    wrap.className = WIDGET_CLASS;
    wrap.setAttribute('data-latex', this.tex);
    wrap.setAttribute('data-display', this.display ? 'block' : 'inline');

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        view.requestMeasure();
      });
      ro.observe(wrap);
      katexWidgetResizeObservers.set(wrap, ro);
    }

    try {
      // KaTeX renders synchronously; render straight into the widget DOM.
      wrap.innerHTML = renderToHtml(this.tex, this.display);
    } catch (err: unknown) {
      populateKatexMathErrorDom(wrap, err, this.display);
    }
    view.requestMeasure();

    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }

  destroy(dom: HTMLElement): void {
    katexWidgetResizeObservers.get(dom)?.disconnect();
    katexWidgetResizeObservers.delete(dom);
    dom.remove();
  }
}

const katexMathSourceTheme = EditorView.theme({
  '.cm-katex-math-delimiter': {
    color: 'var(--pm-katex-math-delimiter-color, var(--pm-link-color))',
  },
  '.cm-katex-math-formula': {
    color: 'var(--pm-katex-math-formula-color, inherit)',
    fontFamily: `var(
      --pm-katex-math-formula-font,
      var(
        --pm-code-font,
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        'Liberation Mono',
        'Courier New',
        monospace
      )
    )`,
    fontSize: '0.92em',
  },
});

/**
 * Syntax highlighting for raw `$...$` / `$$...$$` spans before they are replaced
 * by rendered math widgets. Add next to {@link prosemarkBaseThemeSetup} or your
 * editor theme so delimiter and formula regions pick up theme variables.
 */
export const katexMathSyntaxHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: katexMathDelimiterTag,
      class: 'cm-katex-math-delimiter',
    },
    {
      tag: katexMathFormulaTag,
      class: 'cm-katex-math-formula',
    },
  ]),
);

const katexMathWidgetTheme = EditorView.theme({
  [`.${WIDGET_CLASS}`]: {
    display: 'inline-block',
    verticalAlign: 'middle',
  },
  // Soft-indent lines use negative text-indent; inline-block math overlaps the
  // hanging margin unless the widget flows like text (see @prosemark/core softIndentExtension).
  [`.${SOFT_INDENT_LINE_CLASS} .${WIDGET_CLASS}[data-display="inline"]`]: {
    display: 'inline',
    verticalAlign: 'baseline',
  },
  [`.${WIDGET_CLASS}[data-display="block"]`]: {
    display: 'block',
    textAlign: 'center',
    // Block widget docs: no vertical *margins* (they confuse layout); padding is OK.
    padding: '0.5em 0',
  },
  [`.${WIDGET_CLASS}-error`]: {
    color:
      'var(--pm-katex-math-error-color, var(--pm-syntax-invalid, #c62828))',
    backgroundColor:
      'var(--pm-katex-math-error-background-color, rgb(128 128 128 / 0.12))',
    fontFamily: `var(
      --pm-katex-math-formula-font,
      var(
        --pm-code-font,
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        'Liberation Mono',
        'Courier New',
        monospace
      )
    )`,
    borderRadius: '0.4rem',
    padding: '0.2rem',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  [`.${WIDGET_CLASS}[data-display="block"].${WIDGET_CLASS}-error`]: {
    textAlign: 'left',
    padding: '0.5em 0.2rem',
  },
  [`.${WIDGET_CLASS}-error[data-display="inline"]`]: {
    display: 'inline',
    verticalAlign: 'baseline',
  },
  [`.${WIDGET_ERROR_MESSAGE_CLASS}`]: {
    fontSize: '0.85em',
    lineHeight: 1.35,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  [`.${WIDGET_CLASS}-error[data-display="inline"] .${WIDGET_ERROR_MESSAGE_CLASS}`]:
    {
      display: 'inline',
    },
});

/**
 * CodeMirror extensions that replace core **`Math`** syntax nodes with rendered
 * KaTeX output.
 *
 * @remarks
 * **Markdown parser:** widgets attach only to `Math` nodes. Enable math in the
 * Markdown config with **`prosemarkMarkdownSyntaxExtensions`** (includes
 * **`mathMarkdownSyntaxExtension`**) from **`@prosemark/core`**, or add
 * **`mathMarkdownSyntaxExtension`** from **`@prosemark/core`** or
 * {@link katexMathMarkdownSyntaxExtension} from this package to
 * **`markdown({ extensions: [...] })`**. Without that, `$...$` / `$$...$$` are not
 * parsed as math and these extensions have nothing to render.
 *
 * Add {@link katexMathSyntaxHighlighting} (via {@link katexMarkdownSyntaxTheme})
 * for delimiter/formula source coloring.
 *
 * **Fonts:** KaTeX needs its stylesheet (`katex/dist/katex.min.css`) loaded in
 * the page for correct glyphs and spacing. Import it once in your app.
 */
export function katexMarkdownEditorExtensions(
  options: KatexMarkdownEditorOptions = {},
): ReturnType<typeof foldableSyntaxFacet.of>[] {
  const cacheSize = options.renderCacheSize ?? 128;
  renderCache = cacheSize > 0 ? new RenderLru(cacheSize) : null;
  renderOptions = options.katexOptions;

  return [
    foldableSyntaxFacet.of({
      nodePath: 'Math',
      buildDecorations: (state: EditorState, node: SyntaxNodeRef) => {
        const opensDouble =
          state.doc.sliceString(node.from, node.from + 2) === '$$';
        const innerFrom = opensDouble ? node.from + 2 : node.from + 1;
        const innerTo = opensDouble ? node.to - 2 : node.to - 1;
        const body = state.doc.sliceString(innerFrom, innerTo);
        const tex = body.trim();
        if (!tex) return;

        // `$$...$$` always block; `$ ... $` with inner padding block; tight `$...$` inline.
        const display = opensDouble || /^\s|\s$/.test(body);

        return Decoration.replace({
          widget: new KatexMathWidget(tex, display),
          block: display,
          inclusive: true,
          // Skipped by revealBlockOnArrowExtension so ↑ through blank lines after math is normal.
          proseMarkSkipAdjacentArrowReveal: true,
        }).range(node.from, node.to);
      },
    }),
    katexMathWidgetTheme,
    selectAllDecorationsOnSelectExtension(WIDGET_CLASS),
  ];
}

/**
 * Convenience bundle: source highlighting theme + delimiter/formula tag
 * styles. Does not include {@link katexMarkdownEditorExtensions} (widgets).
 */
export const katexMarkdownSyntaxTheme: Extension[] = [
  katexMathSyntaxHighlighting,
  katexMathSourceTheme,
];
