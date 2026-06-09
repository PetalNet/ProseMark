import { Decoration } from '@codemirror/view';
import {
  type HidableNodeSpec,
  hidableNodeFacet,
  hideInlineDecoration,
} from './core';
import type { InlineContext, MarkdownConfig } from '@lezer/markdown';
import { markdownTags } from '../markdown/tags';
import { stateWORDAt } from '../utils';

export { hideExtension } from './core';

const renderedLinkDecoration = Decoration.mark({
  class: 'cm-rendered-link',
});
const inlineCodeDecoration = Decoration.mark({
  tagName: 'code',
  class: 'cm-inline-code',
});

// Semantic inline tags, so consumers can target strong/em/etc (e.g. with
// Tailwind Typography). Marks wrap the whole node; the syntax marks inside are
// hidden separately via `subNodeNameToHide`.
const strongDecoration = Decoration.mark({ tagName: 'strong' });
const emphasisDecoration = Decoration.mark({ tagName: 'em' });
// GFM renders `~~strikethrough~~` as <del> (matches GitHub + Tailwind
// Typography's `del` styling).
const strikethroughDecoration = Decoration.mark({ tagName: 'del' });

// Heading tags (h1..h6). These persist regardless of selection so the semantic
// element is present even while editing the heading.
const atxHeadingDecorations = Array.from({ length: 6 }, (_, i) =>
  Decoration.mark({ tagName: `h${(i + 1).toString()}` }),
);

const defaultHidableSpecs: HidableNodeSpec[] = [
  {
    nodeName: (name) => name.startsWith('ATXHeading'),
    onHide: (_view, node) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const headerMark = node.node.firstChild!;
      return hideInlineDecoration.range(
        headerMark.from,
        Math.min(headerMark.to + 1, node.to),
      );
    },
    alwaysDecoration: (_state, node) => {
      // Mark the heading text (after the `#` mark) with the matching tag.
      // Range is text-only so the hidden marker isn't wrapped in the heading.
      const level = Number(node.type.name.slice('ATXHeading'.length));
      const deco = atxHeadingDecorations[level - 1];
      if (!deco) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const headerMark = node.node.firstChild!;
      const from = Math.min(headerMark.to + 1, node.to);
      if (from >= node.to) return undefined;
      return deco.range(from, node.to);
    },
  },
  {
    nodeName: (name) => name.startsWith('SetextHeading'),
    subNodeNameToHide: 'HeaderMark',
    block: true,
    alwaysDecoration: (state, node) => {
      // A mark decoration can't span the underline line, so tag just the
      // heading text on the first line; the underline is left as-is.
      const level = Number(node.type.name.slice('SetextHeading'.length));
      const deco = atxHeadingDecorations[level - 1];
      if (!deco) return undefined;
      const to = state.doc.lineAt(node.from).to;
      if (node.from >= to) return undefined;
      return deco.range(node.from, to);
    },
  },
  {
    nodeName: 'StrongEmphasis',
    nodeDecoration: strongDecoration,
    subNodeNameToHide: 'EmphasisMark',
  },
  {
    nodeName: 'Emphasis',
    nodeDecoration: emphasisDecoration,
    subNodeNameToHide: 'EmphasisMark',
  },
  {
    nodeName: 'InlineCode',
    nodeDecoration: inlineCodeDecoration,
    subNodeNameToHide: 'CodeMark',
  },
  {
    nodeName: 'Link',
    subNodeNameToHide: ['LinkMark', 'URL'],
    onHide: (_state, node) => {
      return renderedLinkDecoration.range(node.from, node.to);
    },
  },
  {
    nodeName: 'Strikethrough',
    nodeDecoration: strikethroughDecoration,
    subNodeNameToHide: 'StrikethroughMark',
  },
  {
    nodeName: 'Escape',
    subNodeNameToHide: 'EscapeMark',
    unhideZone: (state, node) => {
      const WORDAt = stateWORDAt(state, node.from);
      if (WORDAt && WORDAt.to > node.from + 1) return WORDAt;
      return state.doc.lineAt(node.from);
    },
  },
  {
    nodeName: 'FencedCode',
    subNodeNameToHide: ['CodeMark', 'CodeInfo'],
    keepSpace: true,
  },
  {
    nodeName: 'Blockquote',
    subNodeNameToHide: 'QuoteMark',
    keepSpace: true,
  },
];

export const defaultHideExtensions = defaultHidableSpecs.map((spec) =>
  hidableNodeFacet.of(spec),
);

export const escapeMarkdownSyntaxExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'EscapeMark',
      style: markdownTags.escapeMark,
    },
  ],
  parseInline: [
    {
      name: 'EscapeMark',
      parse: (cx: InlineContext, next: number, pos: number): number => {
        if (next !== 92 /* \ */) return -1;
        return cx.addElement(
          cx.elt('Escape', pos, pos + 2, [cx.elt('EscapeMark', pos, pos + 1)]),
        );
      },
      before: 'Escape',
    },
  ],
};
