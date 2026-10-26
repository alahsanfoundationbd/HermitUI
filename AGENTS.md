# HermitUI — agent rules

HermitUI is a private chat UI for OpenAI-compatible endpoints that ships as one HTML file; an extra build adds in-browser GGUF inference (wllama). This file is the single source of truth for agent rules: Antigravity reads it directly, Claude Code through a local, gitignored `CLAUDE.md` symlink (never commit the symlink).

## Hard rules
- **Single file:** the app ships as one self-contained `.html`. Source lives in `src/` (`index.html`, `style.css`, `script.js`); `build.py` assembles it.
- **Vanilla only:** ES6+ JavaScript and plain CSS. No frameworks (React, Vue, Angular), no CSS frameworks or preprocessors (Tailwind, Bootstrap), no Node tooling (`package.json`, npm, Webpack, Vite).
- **Ephemeral:** never persist anything, for any reason (settings and preferences included): no `localStorage`, `IndexedDB`, cookies or OPFS.
- **Sanitize:** AI text rendered as HTML or Markdown always goes through `DOMPurify.sanitize()`.
- **API:** every request follows the OpenAI chat completions schema.
- **Think tags:** `<think>`, `<thought>` and `<reasoning>` must keep rendering as separate collapsible blocks (`parseThinkSegments`).
- **Style:** keep the glassmorphism look: CSS variables (`data-theme` on `:root`; light and dark both live in `style.css`), smooth animations, the Inter font. Stay responsive with flexbox and `max-width`; add media queries only when unavoidable.

## Build & test
`python3 build.py` regenerates every output from `src/`. Never edit generated files.

| Output | Contents |
|---|---|
| `dist/hermit-ui-standalone.html` | primary deliverable, everything inlined; also copied to root `index.html` (GitHub Pages) |
| `dist/hermit-ui-cdn.html` | same as `src/` (CDN links) |
| `dist/hermit-ui-local.html` | links into `../libs/` (gitignored, like `libs/`) |
| `dist/hermit-ui-wllama.html` | standalone plus the wllama backend, fully offline |

- `build.py` downloads the libraries pinned by the CDN tags in `src/index.html` into `libs/`, verifies them against the tags' `integrity` hashes (where set) and swaps the tags by regex. When you change a CDN tag, keep its regex matching and its `integrity` hash current (`--refresh` re-downloads); the build exits loudly otherwise.
- Mermaid and the wllama engine are inlined gzip+base64 (`window.__MERMAID_INLINE__`, `window.__WLLAMA_INLINE__`) and inflated in the browser (`gunzipToBytes`). Mermaid's version lives only in its CDN tag, wllama's in `WLLAMA_CDN_BASE` (`src/script.js`; the unbuilt source imports it from jsDelivr instead).
- wllama-only code in `src/` sits between `@wllama:start` / `@wllama:end` markers (`<!-- -->`, `/* */`, `//`). The build strips these blocks from every other output, so the code left over must stay valid.
- No linter, no package manager. `node tests/run.mjs` tests pure logic by slicing functions out of `src/script.js` by name (`tests/extract.mjs`), so renaming a tested function fails the suite; update the tests with it. DOM behaviour belongs in the end-to-end tests, which read `dist/` (build first): `benchmark/.venv/bin/python tests/e2e_rendering.py` and `tests/e2e_export_import.py`. Details in `tests/README.md`. Check UI changes in the built `index.html`.

## Code map (`src/script.js`)
- Personas: `PERSONAS`, `switchPersona`, `activePersona`/`SYSTEM_PROMPT`.
- Streaming: `fetchAndStreamChat` (SSE loop with `onChunk`/`onDone`/`onError`); `createThrottle` limits re-renders.
- Rendering: `updateMessageUI`, `appendMessage`, `injectCopyButtons` (Marked, then DOMPurify; Highlight.js; copy buttons; edit and regenerate).
- Math: marked extensions plus `renderMathTex`, KaTeX in MathML-only mode inside the normal `marked.parse` → `DOMPurify.sanitize` path.
- Mermaid: `loadMermaid`/`renderMermaidBlocks`, final renders only, `securityLevel: "strict"` with HTML labels off. The output must stay pure SVG or DOMPurify guts it; invalid diagrams fall back to code blocks.
- SVG: `renderSvgBlocks` turns ```` ```svg ```` fences into an `<img>` (DOMPurify SVG profile, then a `data:` URL; an image runs no scripts and fetches nothing), final renders only. `wrapDiagram` keeps the hidden source block and its toggle beside both diagram kinds.
- Settings: modal handlers, `testConnectionBtn`, `updateGlobalStats`. Sampling params go through `buildSamplingParams` (unset = not sent; llama.cpp's `top_k`/`min_p`/`repeat_penalty` too). `stripReasoning` drops earlier reasoning from the request copy only (`DROP_REASONING`); history keeps it.
- Context gauge: `lookupContextSize` (llama.cpp `/props`, vLLM `max_model_len`, once per endpoint and model, after the first reply), `wllamaContextSize` from the loaded GGUF, `contextGauge`/`updateContextGauge`.
- Versions: `forks` keyed by the uid of the message before the fork (0 = chat start), each holding detached `{msgs, nodes}` per version; `forkAt`, `switchVersion`, `refreshBranchNav` (also restores the previous version when a regenerate stopped before its first token). Edit only marks the message (`startEdit`); the fork happens on send.
- Continue: `continueReply` sends the latest reply's answer (`splitForContinue`) as a final assistant message; `runStreamingResponse({continueFrom})` merges what streams back with `continuedAnswer` (llama.cpp echoes the prefill first, others don't). Raw view: `setRawView`.
- Errors: `chatErrorHint` (pure, unit-tested) picks one line of advice per failure class; add new classes there, never at a call site. An empty hint means the error says enough. `chatErrorHtml` renders it; Test Connection reuses it in `showToast(msg, { error: true })`.
- Attachments: `processFiles`, `renderChips`, `isTextFile`. Export/import: `exportBtn`/`importBtn`, a Markdown round-trip (format notes in `tests/README.md`).
- The wllama build's Firefox WebGPU notice is UA-sniffed on purpose (a Firefox bug, [1870699](https://bugzilla.mozilla.org/show_bug.cgi?id=1870699)); remove it once the fix ships.

### Reasoning effort (all builds)
`thinkingControl`/`setThinkingLevel`, `parseReasoningTemplateSupport`, `buildReasoningParams`, `probeReasoningSupport`, `updateThinkingControl`. Off/Low/Med/High: wllama sends `chat_template_kwargs {enable_thinking, reasoning_effort}`, remote endpoints get `reasoning_effort`; Off is `chat_template_kwargs {enable_thinking: false}` for both.
- Never send a level the template doesn't list. Qwen3.5/3.8 accept only `xhigh`, `medium` and `low` and raise on `high` (wllama reports it as `Invalid magic number`); "High" means the template's maximum.
- Support detection: a GGUF's chat template is scanned; a remote endpoint uses **Check Reasoning Support** (llama.cpp `/props`, then Ollama `/api/show`); unknown means the control is shown. Never probe with a throwaway completion: llama.cpp answers 200 to parameters it ignores. A 400 strips `REASONING_PARAM_KEYS`, retries once and hides the control.

### Composer
`#chatForm` (bare wrapper; JS toggles `is-generating` on it) → `.input-shell` (owns all card styling) → `.composer-toolbar` (persona select, reasoning control, `.composer-actions`). The toolbar's `flex-wrap: wrap` plus `margin-left: auto` on the actions keeps a 420px screen from overflowing; don't swap it for fixed widths. The reasoning control is a `role="radiogroup"` with roving tabindex, and every segment needs `type="button"`, or a click submits the form.

### In-browser inference (wllama build only)
`backendMode`, `CHAT_TEMPLATES`, `buildWllamaPrompt`, `loadWllamaModel`, the wllama branch of `fetchAndStreamChat`. Models come from a file picker or a URL (`normalizeGgufUrl`: direct `.gguf`, HF `/blob/` rewritten to `/resolve/`, `hf:user/repo/file.gguf`).
- Downloads go into an in-memory Blob (`downloadGgufToBlob`). Never use wllama's `loadModelFromUrl`: it writes to OPFS even with `useCache: false`.
- Keep `reasoning_format: "none"`, or a long reasoning trace streams no content and the answer renders empty. Retest with a hard prompt; short ones don't trigger thinking.
- Keep the `getLoadedContextInfo().success === false` check: `loadModel` resolves even when the context can't be allocated, and the check turns that into the halve-`n_ctx` retry. Test CPU mode at the default context (16384), not only at the benchmark's 4096.
- Don't bring back the `patchWllamaGetResponse` override for cut-off answers: wllama 3.6.0 fixed the bug upstream (ngxson/wllama#269), and the override breaks 3.6's `getResponse(options, isStream, reqId)`.

## Benchmark (`benchmark/`)
A Playwright harness that runs GGUF ladders (Qwen3, Gemma-4, gpt-oss-20b) through the unmodified `dist/hermit-ui-wllama.html` and recommends a model. Setup, flags and reference results are in `benchmark/README.md`.
- Every harness script line-buffers stdout (`sys.stdout.reconfigure(line_buffering=True)`) and prints a progress line *before* each long step (model load, each question); otherwise a run redirected to a log looks dead.
- Start long runs detached (`nohup … > run.log 2>&1 &`) and watch the log.
- Before quoting a timing, warm the model up with at least one discarded request; the first request after a load is much slower (Qwen3.8-27B: 24 s vs 17 s TTFT).
- `--gpu` (WSL2) drives Windows Edge over CDP; close it with CDP `Browser.close`, since Playwright's `close()` only disconnects. The GPU must be idle (`check_gpu_idle()` enforces it): a busy GPU still loads models but under-reports tok/s by up to 23×.
- After bumping `WLLAMA_CDN_BASE`, rerun and compare against the reference results.

## Sibling apps
`hermit-agent/` (a supervised agent that writes and runs Python in the tab via Pyodide) and `hermit-cleaner/` (cleans AI-written text down to Latin-1 and can reword it) have their own `src/`, `build.py`, `tests/` and an `AGENTS.md` that extends this file; read it before working there. They never touch the root `src/`, and the root build doesn't build them.

## Git & workflow
- Always check origin for new changes before starting a task.
- Commit or push only when the user explicitly asks; otherwise report and leave the changes uncommitted. Before a commit, run `python3 build.py`, then review the whole diff against these rules.
- When a version is tagged, update the version in `src/index.html` to match.
- No implementation plan or plan approval unless the user asks for one.
