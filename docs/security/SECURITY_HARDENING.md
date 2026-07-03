# Security Hardening: Untrusted Markdown Rendering

## Context

FluxMarkdown renders Markdown by handing it to a bundled TypeScript engine running
inside a `WKWebView`. Markdown files are **untrusted input** — a preview can be
triggered with almost no user intent (selecting a file in Finder and pressing
`Space`), so the renderer must treat every document as potentially hostile.

The QuickLook extension is sandboxed but still holds `com.apple.security.network.client`
(needed for remote images) and read access across the user's home directory and
Downloads. That combination makes a script-execution bug in the WebView equivalent to
**local file disclosure + exfiltration**.

## The risk

Three settings combined to make a malicious `.md` file dangerous:

1. **Raw HTML passthrough without sanitization.** The renderer builds `markdown-it`
   with `html: true` and injected the result straight into the DOM via
   `outputDiv.innerHTML`. Assigning `innerHTML` does not run `<script>` tags, but it
   **does** fire inline event handlers such as `<img src=x onerror="…">`, which
   execute attacker-controlled JavaScript.
2. **`allowUniversalAccessFromFileURLs = true`.** Set on the QuickLook extension, the
   host app, and the CLI exporter. It relaxes the same-origin policy so page script can
   read cross-origin `file://` URLs. This was a leftover from an earlier design that
   loaded the renderer from `file://`; the renderer now loads via the
   `flux-renderer://` custom scheme and local images via `local-md://`, so it was no
   longer needed.
3. **No Content-Security-Policy.** Nothing constrained where the page could connect,
   what scripts could run, or whether inline handlers were allowed.

**Attack chain:** malicious `.md` → previewed in Finder → `<img onerror>` runs script →
script reads arbitrary local files via `fetch('file:///…')` (universal access) →
exfiltrates them to a remote server (network entitlement). No click beyond `Space`.

## The fixes

### 1. Remove `allowUniversalAccessFromFileURLs`

Deleted from all three WebView configurations
(`Sources/MarkdownPreview/PreviewViewController.swift`,
`Sources/Markdown/MarkdownWebView.swift`, `Sources/Markdown/CLIExporter.swift`). The
renderer bundle and local images are served exclusively through custom scheme handlers
(`flux-renderer://`, `local-md://`) that already enforce base-directory containment, so
universal file access is unnecessary. WebKit defaults the setting to `false`; we keep
that secure default and document why.

### 2. Sanitize rendered HTML with DOMPurify

`html: true` is retained so legitimate inline HTML in Markdown keeps working, but the
renderer now runs the generated HTML through DOMPurify before it touches the DOM
(`sanitizeRenderedHtml` in `web-renderer/src/index.ts`). DOMPurify strips `<script>`,
event-handler attributes, `javascript:`/`vbscript:` URLs, `<iframe>`/`<object>`/`<embed>`,
etc., while preserving the markup the renderer depends on: tables, task lists, code
blocks, KaTeX/MathML, inline SVG, footnotes and `local-md://` / `data:` images. The
`local-md:` scheme is explicitly allow-listed via a custom `ALLOWED_URI_REGEXP`.
Sanitization happens **before** `innerHTML` is assigned, because even a detached element
fires resource loads (and thus `onerror`) on assignment.

### 3. Content-Security-Policy (defense in depth)

`web-renderer/index.html` now ships a CSP `<meta>`:

- `script-src` omits `'unsafe-inline'`, so inline event handlers cannot run even if
  they somehow survive sanitization. `'unsafe-eval'` / `'wasm-unsafe-eval'` are kept
  because Vega and the Typst/Graphviz WASM require them.
- `connect-src 'self'` prevents network exfiltration despite the sandbox's network
  entitlement. The renderer's WASM/chunks are same-origin; the only external default
  (Typst font CDN) is never triggered by this app's usage.
- `img-src` permits `local-md:`, `data:` and remote images; `object-src`/`frame-src`
  are `'none'`; `form-action 'none'`.

## Tests

- `web-renderer/test/sanitization.test.ts` covers the XSS vectors (script,
  `onerror`/`onclick`, `javascript:`, iframe/object/embed) and confirms legitimate
  markup survives (`local-md://`/`data:`/`https:` images, task lists, `data-*`
  attributes, inline SVG, `<kbd>`, GFM tables).
- The existing renderer suite doubles as a regression guard: its assertions about
  `local-md://` / `data:` / network image handling now run through the sanitizer.

## Non-goals / residual notes

- Diagram output (Mermaid, Vega, Graphviz, Typst) is injected after sanitization from
  trusted rendering engines; Mermaid runs with its default `strict` security level.
- Network (`http:`/`https:`) images remain enabled and are a minor tracking vector, but
  they cannot read local data, so they are not an exfiltration path on their own.
