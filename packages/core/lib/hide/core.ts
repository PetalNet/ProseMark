import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import {
  type EditorState,
  Facet,
  type Range,
  StateField,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';
import { type RangeLike, rangeTouchesRange } from '../utils';

const hideTheme = EditorView.theme({
  '.cm-hidden-token': {
    fontSize: '0px',
  },
  '.cm-transparent-token': {
    opacity: 0,
  },
  // Heading tags are block-level by default; CodeMirror lays out inline content
  // within a line, so render them inline-block to keep them on the line.
  '.cm-line :is(h1, h2, h3, h4, h5, h6)': {
    display: 'inline-block',
    margin: 0,
    fontSize: 'inherit',
    fontWeight: 'inherit',
    lineHeight: 'inherit',
  },
});

export const hideInlineDecoration = Decoration.mark({
  class: 'cm-hidden-token',
});
export const hideInlineKeepSpaceDecoration = Decoration.mark({
  class: 'cm-transparent-token',
});
export const hideBlockDecoration = Decoration.replace({
  block: true,
});

const buildDecorations = (state: EditorState) => {
  const decorations: Range<Decoration>[] = [];
  const specs = state.facet(hidableNodeFacet);
  specs.map(checkSpec);

  syntaxTree(state).iterate({
    enter: (node) => {
      const selectionTouchesNodeRange = state.selection.ranges.some((range) =>
        rangeTouchesRange(node, range),
      );

      for (const spec of specs) {
        // Check spec
        if (spec.nodeName instanceof Function) {
          if (!spec.nodeName(node.type.name)) {
            continue;
          }
        } else if (spec.nodeName instanceof Array) {
          if (!spec.nodeName.includes(node.type.name)) {
            continue;
          }
        } else if (node.type.name !== spec.nodeName) {
          continue;
        }

        // Check custom show zone
        if (spec.unhideZone) {
          const res = spec.unhideZone(state, node);
          if (
            state.selection.ranges.some((range) =>
              rangeTouchesRange(res, range),
            )
          ) {
            continue;
          }
        }

        if (spec.nodeDecoration) {
          decorations.push(spec.nodeDecoration.range(node.from, node.to));
        }

        // Semantic decorations that should apply regardless of whether the
        // selection is inside the node (e.g. heading tags, which must persist
        // while the heading is being edited).
        if (spec.alwaysDecoration) {
          const res = spec.alwaysDecoration(state, node);
          if (res instanceof Array) {
            decorations.push(...res);
          } else if (res) {
            decorations.push(res);
          }
        }

        if (selectionTouchesNodeRange) {
          continue;
        }

        // Hide node using one of the provided methods
        if (spec.onHide) {
          const res = spec.onHide(state, node);
          if (res instanceof Array) {
            decorations.push(...res);
          } else if (res) {
            decorations.push(res);
          }
        }
        if (spec.subNodeNameToHide) {
          let names: string[];
          if (!Array.isArray(spec.subNodeNameToHide)) {
            names = [spec.subNodeNameToHide];
          } else {
            names = spec.subNodeNameToHide;
          }

          const cursor = node.node.cursor();

          // Manual traversal to ensure all children are processed
          cursor.iterate((node) => {
            if (names.includes(node.type.name)) {
              decorations.push(
                (spec.block
                  ? hideBlockDecoration
                  : spec.keepSpace
                    ? hideInlineKeepSpaceDecoration
                    : hideInlineDecoration
                ).range(node.from, node.to),
              );
            }
          });
        }
      }
    },
  });
  return Decoration.set(decorations, true);
};

export const hideExtension = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },

  update(deco, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state)
    ) {
      return buildDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => [EditorView.decorations.from(f), hideTheme],
});

export interface HidableNodeSpec {
  nodeName: string | string[] | ((nodeName: string) => boolean);
  nodeDecoration?: Decoration;
  /**
   * Decoration(s) applied to the node regardless of selection state, with a
   * custom range. Unlike `nodeDecoration` (which always spans the whole node),
   * this lets a spec target a sub-range (e.g. just the heading text).
   */
  alwaysDecoration?: (
    state: EditorState,
    node: SyntaxNodeRef,
  ) => Range<Decoration> | Range<Decoration>[] | undefined;
  subNodeNameToHide?: string | string[];
  onHide?: (
    state: EditorState,
    node: SyntaxNodeRef,
  ) => Range<Decoration> | Range<Decoration>[] | undefined;
  block?: boolean;
  keepSpace?: boolean;
  unhideZone?: (state: EditorState, node: SyntaxNodeRef) => RangeLike;
}

const checkSpec = (spec: HidableNodeSpec) => {
  if (spec.block && spec.keepSpace) {
    console.warn(
      'Only inline hide nodes can maintain space currently, but `block` and `keepSpace` are set in:',
      spec,
    );
  }
};

export const hidableNodeFacet = Facet.define<
  HidableNodeSpec,
  HidableNodeSpec[]
>({
  combine(value: readonly HidableNodeSpec[]) {
    return [...value];
  },
  enables: hideExtension,
});
