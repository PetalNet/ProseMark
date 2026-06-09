/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import katex from 'katex';
import { formatKatexRenderError } from '../lib/main.ts';

describe('formatKatexRenderError', () => {
  test('uses Error.message', () => {
    expect(
      formatKatexRenderError(
        new Error('KaTeX parse error: Undefined control sequence: \\foo'),
      ),
    ).toBe('KaTeX parse error: Undefined control sequence: \\foo');
  });

  test('trims whitespace', () => {
    expect(formatKatexRenderError(new Error('  bad input  '))).toBe(
      'bad input',
    );
  });

  test('handles plain strings', () => {
    expect(formatKatexRenderError('KaTeX is not loaded')).toBe(
      'KaTeX is not loaded',
    );
  });

  test('reads message from plain objects', () => {
    expect(formatKatexRenderError({ message: 'render failed' })).toBe(
      'render failed',
    );
  });

  test('falls back when message is empty', () => {
    expect(formatKatexRenderError(new Error('   '))).toBe('KaTeX render failed');
    expect(formatKatexRenderError(null)).toBe('KaTeX render failed');
  });

  test('formats a real KaTeX ParseError', () => {
    let thrown: unknown;
    try {
      katex.renderToString('\\foo', { throwOnError: true });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(formatKatexRenderError(thrown)).toContain('KaTeX parse error');
  });
});

describe('katex.renderToString', () => {
  test('renders inline math to HTML with mathml', () => {
    const html = katex.renderToString('a^2 + b^2 = c^2', {
      displayMode: false,
      throwOnError: true,
      output: 'htmlAndMathml',
    });
    expect(html).toContain('katex');
    expect(html).toContain('math');
  });

  test('renders display math', () => {
    const html = katex.renderToString('\\int_0^1 x\\,dx', {
      displayMode: true,
      throwOnError: true,
      output: 'htmlAndMathml',
    });
    expect(html).toContain('katex-display');
  });
});
