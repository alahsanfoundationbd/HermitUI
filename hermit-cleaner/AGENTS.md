# HermitUI Cleaner — agent rules

HermitUI Cleaner (`hermit-cleaner/`) cleans AI-written text down to Latin-1, can reword it (by sentence or paragraph, or the whole text in several passes) and adds a few natural typos, through an OpenAI-compatible server or, in the `-wllama` build, a GGUF model in the tab. It ships as two self-contained HTML files, `dist/hermit-cleaner-standalone.html` and `dist/hermit-cleaner-wllama.html`; what each feature does is in the [README](README.md), in full in [docs/guide.md](docs/guide.md). This file extends the root [`../AGENTS.md`](../AGENTS.md); read that first: every root rule applies here unless a line below overrides it. Claude Code reads this file through a local `CLAUDE.md` symlink, gitignored like the root's (never commit it).

## Hard rules
- **Root rules here:** the e2e test asserts that storage stays empty, and the layout is fluid, with no media queries.
- **Output:** model output is text, never HTML. The output pane is built from `textContent` and DOM nodes only, so the root DOMPurify rule has nothing to sanitize; if HTML or Markdown rendering is ever added, `DOMPurify.sanitize()` becomes mandatory.
- **ASCII:** above `// ========== Copied from HermitUI`, `src/script.js` writes every non-ASCII character as a `\uXXXX` escape, and so do the test files: the cleaner's own tables hold invisible and look-alike characters, and these must stay visible in review. Check: `sed '/^\/\/ ========== Copied from HermitUI/q' src/script.js | grep -nP '[^\x00-\x7e]'; grep -nP '[^\x00-\x7e]' tests/*.mjs tests/*.py` (no output).
- **Kept set:** Latin-1 plus € (`KEEP_RE`). Changing it changes what the whole app promises, so update the README with it.
- **Honest UI text:** don't claim the app removes watermarks it can't see, or that it beats AI detectors.
- **Root app:** cleaner work never edits `../src/`, `../build.py`, `../tests/` or `../dist/`, and `build.py` writes only inside this folder.

## Build & test
```bash
python3 build.py                                     # → dist/hermit-cleaner-standalone.html and -wllama.html
node tests/run.mjs                                   # unit tests (pure logic)
../benchmark/.venv/bin/python tests/e2e_cleaner.py   # e2e vs. a mock endpoint, Chromium + Firefox
../benchmark/.venv/bin/python bench/bench.py         # Reword benchmark on llama-server (GPU), judged; see bench/README.md
```
- Unit tests slice the real functions out of `src/script.js` by name (`tests/extract.mjs`, as in `../tests/`), so renaming a function fails the suite: update the lists there. The slicer counts raw braces: an unbalanced `{` or `}` in a sliced function's string, regex or comment breaks the suite, so keep literal braces out of the pure functions. DOM behaviour goes in `tests/e2e_cleaner.py`. Details: [tests/README.md](tests/README.md).
- Every prompt starts with `NO_HIDDEN_MARKS` (`withNoHiddenMarks` in `buildChatBody`, `buildRewriteBody` and the in-browser path); the e2e mock (`tests/mock_openai.py`) skips that first line when it tells the passes apart.
- The page's CSP blocks `eval`, so Playwright's `wait_for_function` can't run in it: poll with `page.evaluate`.
- Prompt changes are measured, not guessed. Run `bench/bench.py` before and after (`--app` takes a patched copy of the build) and read the judge's problem list and `samples.md`, not only the table. Keep `JUDGE_CALIBRATION` passing: a judge that misses the known cases makes the scores meaningless. For an A/B, run each build with `--judge none` and have a strong model read the rewrites of the same sentence side by side; that finds failure modes no 1-5 score shows. German meaning errors are a model limit, not a prompt one: read German rewrites, don't count them.

## Code map (`src/script.js`)
The file runs in sections (`// ========== … ==========`); everything above "Copied from HermitUI" is pure and sliced out by the unit tests.
- Stage 1, character cleanup: `cleanText`, `transliterate`, `homoglyphPositions`. Language: `detectLanguage`.
- Stage 2, rewording: `rewordUnits`, `findStockPhrases`, `findContrasts`, `buildRewriteBody`, `acceptRewrite`, `addressForms`.
- Stage 2b, rewriting the whole text: `wholeRewrite`, `WHOLE_PASSES`, `acceptWholeRewrite`, `acceptSplit`, `factCheckErrors`, `buildChatBody`.
- Stage 3, typos: `addTypos`.
- Copied from HermitUI (table at the end), then the DOM wiring: `rewordOne`, `rewriteWhole`, `chatOnce`, `loadWllamaModel`, `applyGgufLink`, `renderOutput`.

### Reword (by sentence or paragraph)
What these rules are based on: [bench/README.md](bench/README.md).
- Name no other language in the prompt, since that pulls small models into it. `STOCK_PATTERNS` holds one list of regular expressions per detected language; the prompt names only the phrases found in the passage itself, never in its context, and a passage with none gets examples in its own language (`STOCK_PHRASES`; English when the language isn't detected).
- A phrase belongs on the list only if cutting it, or saying it plainly, loses nothing: flagging ordinary words ("however", "important") makes the model "fix" good text, and `tests/stock.test.mjs` keeps a sentence of ordinary uses ("foster care", "Yours truly", "is simply wrong") that must stay unflagged. A pattern names only the empty part (for "Nur so kann gewährleistet werden" just the passive, or the "only" goes too). Add a source to the list in `docs/guide.md` when you add a batch; the benchmark keeps its own fixed list (`stock_phrases` in `bench/corpus.json`), so every build is scored against the same yardstick.
- In a pattern a space matches any whitespace and a match must be whole words: an optional last part starts with its space (`(?: about)?`), never ends with one, and a phrase after a comma uses a lookbehind (`(?<=,\s{0,3})ensuring`).
- A sentence that is only a stock phrase never goes to the model. It is removed in code (`isStockOnly`, `deletionRange`) and left out of the context too: sent, it comes back as nonsense, and left in the context, it gets written back.
- The prompt says "keep the sentence grammatical": cutting an adjective or a participle breaks the grammar around it.
- `PREAMBLE_RE` compares the first three words, so an original that starts with "Here's" can't wave a "Here is the revised passage: …" reply through.
- `acceptRewrite` refuses a reply with more stock phrases than its original, naming them, which the second try then sees: models bring in stock phrases of their own even when told not to.
- Set-up contrasts (`CONTRAST_PATTERNS`) need both halves, or ordinary text gets flagged. After a full stop, only a subject plus a non-negated verb counts, or "It is not just me. It isn't late" matches. German counts only the rhetorical "kein …, sondern" and "nicht nur …, sondern"; "nicht am Montag, sondern am Dienstag" is plain German. The prompt names the shapes per language (`CONTRAST_RULES`): told only to drop a contrast, models dodge ("just" → "only", a full stop between the halves), and naming the shapes worked better than another few-shot example.
- The contrast refusal is soft, and the fallback is the first try: the second runs hotter under the retry note and can garble German.
- Greetings and sign-offs are never sent (`SALUTATION_RE`, in `isRewritable` and by sentence in `rewordUnits`): models rewrote the greeting and turned the sign-off above the name into the name.
- German form of address is checked in code (`addressForms`): models switch a "Sie" e-mail to "du", and a retry note helps only when it names the form to keep.

### Rewrite whole text
The passes and each check are described in the code next to them (the comment at the top of Stage 2b lists the passes in order).
- `wholeRewrite` stays pure: it runs the passes of `WHOLE_PASSES` with the model call injected (`chat(passId, messages, maxTokens, think)`), so `tests/whole.test.mjs` scripts every pass, and every text reply goes through `acceptWholeRewrite`. The DOM side (`rewriteWhole`, `chatOnce`) only feeds it the chosen backend.
- Rewrite freely (`o.free`) adds a `plan` pass (`buildPlanMessages`) and swaps the keep-every-claim rules for content rules; its fact check allows dropped points and counts a lost number only where its point is still there. The plan asks for no limit or doubt: asked for one, it made claims up.
- Plainer (`o.plain`, German and English, off by default) gives each pass one job, since a single prompt holding all the rules was followed only in part. German: `words` (never splits or joins sentences), `split`, `openers`. English: a `kind` pass (`TEXT_KINDS`), then the five passes of `WHOLE_PLAIN_EN`; the two that cut (`verdicts`, `alternatives`) may halve the text.
- The German must stay easy to understand. A single prompt once split everything into 3-5 word sentences and lost the logic and sometimes the meaning: don't trade that back for a shorter rhythm. A split keeps the link word, both sides of a contrast, every condition and number, and a "statt/ohne/um … zu" part with its clause (`acceptSplit`, `SPLIT_KEEP`, `SPLIT_LINKS`, then the `splitcheck` call, whose prompt stays loose: judging strictly, it refuses good splits that refer back across the full stop). The German spots notes keep both sides of a contrast and a concession's "aber", and the slop cut leaves sentences with "aber", "sodass", "deshalb" and the like (`FILLER_KEEP_RE`).
- English speaker lines come only in the forms of the text's kind (`speakerRule`): at most one per paragraph, on a judgement only, never on a fact or a step. Told to word every one differently, the model put a speaker on plain facts.
- Count in code, not in the model: long sentences (`longSentences`, over 12 words), lost and invented numbers (`missingNumbers`, `addedNumbers`), points said twice (`repeatedSentences`), runs of alike openers (`sameOpenerRun`) and the spots for the spots pass (`wholeSpotNotes`). Code-found errors go first in the fact-check list, so its cap of 12 never cuts them off.
- An edit gets a second try: the sentences pass, German `words` and the English Plainer passes run through `edit`, which retries a reply refused for a run of alike openers (or, in German `words`, for a split sentence) once, with a note naming it; refusing German `words` outright loses most of what Plainer does. The review flags at most a third of the sentences (at most 6), so the sentences pass stays an edit.
- The fact check reads the whole text in one call: checking one paragraph at a time found nothing more on fresh texts and took much longer.
- German proofreading is a find list applied in code (`buildProofFindMessages`, `applyProofFixes`): asked for the whole text back, the model returned it unchanged. A fix never changes a number. English keeps the whole-text proofreading.
- Letters (`splitLetterFrame`): the greeting line and the sign-off block never go to the model here either; the body's rewrite may come to a quarter of it (0.3 otherwise) when it keeps every number; after a German greeting ending in a comma, the body's first word is written small when the original's was (`greetingCase`).
- Thinking is asked of a server only, with English Plainer (`think: "low"` → `chat_template_kwargs` `{enable_thinking, reasoning_effort}`); the in-browser model never thinks. Known issue: small models can think until the token limit there, and a pass cut off that way returns nothing; the app sends no `max_tokens` on a server, so such a pass runs until the context is full.

### In-browser model (`-wllama` build only)
- All wllama code sits between `@wllama:start`/`@wllama:end` markers (`<!-- -->`, `/* */`, `//`), as in the root app; `build.py` strips them for the standalone file and fails on unbalanced markers. The engine is pinned only by `WLLAMA_CDN_BASE` in `src/script.js` and inlined as `window.__WLLAMA_INLINE__`.
- The root app's wllama rules hold here too: models load into memory (`MemBlob`), never through wllama's `loadModelFromUrl` (it persists to OPFS); `reasoning_format: "none"`; a `success: false` context is a failed load.
- The `-wllama` CSP needs `connect-src data: blob:`: the engine's worker reads the wasm from a `data:` URL with XHR, and without it Emscripten aborts inside the worker and `loadModel` never settles (the page shows "Loading…" forever). It also needs `script-src blob: 'wasm-unsafe-eval'` and `worker-src blob:`. The standalone policy stays without all of these (`STANDALONE_CSP`, `WLLAMA_CSP` in `build.py`); the root app has no CSP.

## Git & workflow
- Every commit that changes `hermit-cleaner/` bumps the version: `APP_VERSION` in `src/script.js` and the README's status line.
- Subject line: `hermit-cleaner: vX.Y.Z; <what changed>`.

## Copied from HermitUI
| Function / block | From (`../src/…`) | Source commit | Adapted how |
|---|---|---|---|
| `isLocalEndpoint`, `apiEndpoint`, `normalizeApiUrl`, `isBlockedMixedContent` | `script.js` | `7773cdd` | default URL in the error text says :9931; `isBlockedMixedContent` tolerates a missing `location` |
| `chatErrorHint` | `script.js` | `7773cdd` | wllama branch dropped; context advice talks about the paragraph |
| `showToast`, toast and settings-modal CSS | `script.js`, `style.css` | `7773cdd` | unchanged apart from theme variables |
| `tests/check.mjs`, `tests/run.mjs`, the `extract.mjs` approach | `../hermit-agent/tests/` | `7773cdd` | the extractor also slices multi-line `const` tables |
| `build.py` techniques (Inter woff2 inlining, `</script` escaping, strict CSP) | `../hermit-agent/build.py` | `7773cdd` | only the Latin Inter subsets, one block each |
| `strip_wllama`, the inlined wllama engine | `../build.py` | `7773cdd` | a second output beside the standalone one; its own CSP |
| `#gguf=` link banner (`applyGgufLink`) | `../src/script.js` (`handleWllamaHashParams`) | `7773cdd` | a banner in the page, not over the chat; only `gguf`, no `api`/`model`/`key` params |
| `normalizeGgufUrl`, `ggufFileName`, `MemBlob`, `downloadGgufToBlob`, `resolveWllamaEngine`, `gunzipToBytes`, the model load loop | `../src/script.js` | `7773cdd` | no debug console or chat formats; context default 4096, retry floor 2048; the reply streamed and collected, so Stop is immediate |
