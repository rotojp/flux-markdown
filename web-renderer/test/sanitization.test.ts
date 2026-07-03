jest.mock('mermaid', () => ({
  initialize: jest.fn(),
  render: jest.fn().mockResolvedValue({ svg: '<svg>mocked diagram</svg>' }),
}));

import '../src/index';
import { sanitizeRenderedHtml } from '../src/index';

describe('sanitizeRenderedHtml (unit)', () => {
  test('strips <script> elements', () => {
    const out = sanitizeRenderedHtml('<p>ok</p><script>window.__pwned = 1;</script>');
    expect(out).toContain('ok');
    expect(out.toLowerCase()).not.toContain('<script');
  });

  test('strips inline event-handler attributes (onerror/onload/onclick)', () => {
    const out = sanitizeRenderedHtml('<img src="x" onerror="window.__pwned=1"><div onclick="steal()">x</div>');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out.toLowerCase()).not.toContain('onclick');
  });

  test('neutralizes javascript: and vbscript: URLs', () => {
    const out = sanitizeRenderedHtml('<a href="javascript:alert(1)">a</a><a href="vbscript:msgbox(1)">b</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out.toLowerCase()).not.toContain('vbscript:');
  });

  test('drops <iframe>/<object>/<embed> elements', () => {
    const out = sanitizeRenderedHtml('<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">');
    expect(out.toLowerCase()).not.toContain('<iframe');
    expect(out.toLowerCase()).not.toContain('<object');
    expect(out.toLowerCase()).not.toContain('<embed');
  });

  test('preserves local-md:// image sources', () => {
    const out = sanitizeRenderedHtml('<img src="local-md:///Users/me/docs/pic.png?v=42">');
    expect(out).toContain('local-md:///Users/me/docs/pic.png?v=42');
  });

  test('preserves data: image sources', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const out = sanitizeRenderedHtml(`<img src="${dataUrl}">`);
    expect(out).toContain(dataUrl);
  });

  test('preserves https: image sources', () => {
    const out = sanitizeRenderedHtml('<img src="https://example.com/image.png">');
    expect(out).toContain('https://example.com/image.png');
  });

  test('preserves task-list checkboxes and data-* attributes', () => {
    const out = sanitizeRenderedHtml(
      '<li class="task-list-item"><input class="task-list-item-checkbox" disabled type="checkbox"> item</li>' +
      '<p data-source-line="3">line</p>'
    );
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('data-source-line="3"');
  });

  test('preserves inline SVG (diagram/icon markup)', () => {
    const out = sanitizeRenderedHtml('<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"></path></svg>');
    expect(out.toLowerCase()).toContain('<svg');
    expect(out.toLowerCase()).toContain('<path');
  });
});

describe('renderMarkdown (end-to-end sanitization)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="markdown-preview"></div>';
    delete (window as any).__pwned;
    jest.clearAllMocks();
  });

  test('does not inject <script> from raw HTML in markdown', async () => {
    await window.renderMarkdown('# Title\n\n<script>window.__pwned = true;</script>\n');
    const preview = document.getElementById('markdown-preview');
    expect(preview?.querySelector('script')).toBeNull();
    expect((window as any).__pwned).toBeUndefined();
  });

  test('strips onerror handler from <img> in markdown', async () => {
    await window.renderMarkdown('<img src="x" onerror="window.__pwned = true">');
    const preview = document.getElementById('markdown-preview');
    const img = preview?.querySelector('img');
    // The image element may survive, but its event-handler attribute must not.
    expect(img?.getAttribute('onerror')).toBeNull();
    expect(preview?.innerHTML.toLowerCase()).not.toContain('onerror');
  });

  test('keeps legitimate inline HTML (kbd) and GFM tables', async () => {
    const md = 'Press <kbd>Cmd</kbd>\n\n| A | B |\n| - | - |\n| 1 | 2 |\n';
    await window.renderMarkdown(md);
    const preview = document.getElementById('markdown-preview');
    expect(preview?.querySelector('kbd')?.textContent).toBe('Cmd');
    expect(preview?.querySelector('table')).toBeTruthy();
    expect(preview?.querySelectorAll('td').length).toBe(2);
  });
});
