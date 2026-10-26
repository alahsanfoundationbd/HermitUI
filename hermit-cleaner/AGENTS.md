# Agent & Contributor Rules — `hermit-cleaner/`

These rules apply to everything inside `hermit-cleaner/`. They **extend** the root
[`../AGENTS.md`](../AGENTS.md): every root rule still applies unless this file
explicitly overrides it. If you are an AI agent, read the root file first.

> Local tooling: Claude Code reads `CLAUDE.md`. As in the root folder, a gitignored
> `CLAUDE.md -> AGENTS.md` symlink can be created here; don't commit it.

## Status
v0.4.0: cleanup; rewording by sentence or paragraph at three change levels (Light, the
default, Medium, Strong), with a tone and an extra instruction, through an
OpenAI-compatible server or, in the `-wllama` build, a GGUF model in the tab; AI stock
phrases and set-up contrasts found per language, named in the prompt and reworded first;
greetings and sign-offs left alone; typos. v0.4.0 adds **Rewrite whole text**: the
whole text rewritten in several passes (critique, rewrite, sentence review, fact check
and fix, contrasts, proofreading), with optional facts about the writer (About you).

## Build & test
```bash
python3 build.py                                     # → dist/hermit-cleaner-standalone.html and -wllama.html
node tests/run.mjs                                   # unit tests (pure logic)
../benchmark/.venv/bin/python tests/e2e_cleaner.py   # e2e vs. a mock endpoint, Chromium + Firefox
../benchmark/.venv/bin/python bench/bench.py        # reword benchmark on llama-server (GPU), judged; see bench/README.md
```
The page's CSP blocks `eval`, so Playwright's `wait_for_function` can't run inside it:
poll with `page.evaluate` instead.

## Inherited from the root (unchanged)
- **One HTML file is the deliverable.** It is assembled by a Python `build.py`. No
  npm, bundlers or Node build tools.
- **Vanilla JS and CSS only.** Glassmorphism, Inter, CSS variables plus `data-theme`,
  and a fluid layout with no media queries.
- **Strict ephemerality.** No `localStorage`, `IndexedDB` or cookies, for any reason,
  including settings. The e2e test asserts that storage stays empty.
- **OpenAI chat-completions schema** for all model traffic.
- Git workflow: check origin first, review before commit, and **never commit or push
  unless the user asks**.

## Specific to this folder
- **Don't touch the root app.** Never edit `../src/`, `../build.py`, `../tests/` or
  `../dist/` as part of Cleaner work. `build.py` must not write outside this folder.
- **Model output is rendered as text, never HTML.** The output pane is built with
  `textContent` and DOM nodes only, so the root DOMPurify rule has nothing to
  sanitize. If HTML or Markdown rendering is ever added, `DOMPurify.sanitize()` becomes
  mandatory.
- **Keep the pure section of `src/script.js` ASCII.** Everything above
  `// ========== Copied from HermitUI` writes non-ASCII characters as `\uXXXX` escapes:
  the cleaner's own tables hold invisible and look-alike characters, and these must
  stay visible in review. The test files follow the same rule. Check with
  `grep -nP '[^\x00-\x7e]' src/script.js tests/*.mjs tests/*.py`.
- **The kept set is Latin-1 plus €** (`KEEP_RE`). Changing it changes what the whole
  app promises, so update the README with it.
- **Be honest in UI text.** Don't claim the app removes watermarks it can't see, or
  that it beats AI detectors.
- **A version bump in every commit** that changes this folder: `APP_VERSION` in
  `src/script.js` and the status line in `README.md`.
- **In-browser model (`-wllama` build).** All wllama code sits between
  `@wllama:start`/`@wllama:end` markers (`<!-- -->`, `/* */`, `//`), as in the root app;
  `build.py` strips them for the standalone file and fails on unbalanced markers. The
  engine is pinned only by `WLLAMA_CDN_BASE` in `src/script.js` and inlined as
  `window.__WLLAMA_INLINE__`. The rules learned in the root app hold here too: models
  load into memory (`MemBlob`), never through wllama's `loadModelFromUrl` (it persists
  to OPFS); `reasoning_format: "none"`; a `success: false` context is a failed load.
- **The `-wllama` CSP needs `connect-src data: blob:`.** The engine's worker reads the
  wasm from a `data:` URL with XHR. Without it, Emscripten aborts inside the worker and
  `loadModel` never settles: the page just shows "Loading…" forever. It also needs
  `script-src blob: 'wasm-unsafe-eval'` and `worker-src blob:`. The standalone policy
  stays without all of these; the root app has no CSP, so it never had this problem.
- **Prompt changes are measured, not guessed.** Run `bench/bench.py` before and after
  (`--app` takes a patched copy of the build), and read the judge's problem list and
  `samples.md`, not only the table. Keep `JUDGE_CALIBRATION` passing; a judge that
  misses the known cases makes the scores meaningless. Better still, for an A/B: run
  each build with `--judge none` and have a strong model read the rewrites of the same
  sentence side by side. That is how v0.3.0 was judged, and it found failure modes no
  1-5 score shows (below).
- **Name no other language in the reword prompt.** Stock phrases are listed in the
  passage's language only (`STOCK_PHRASES`). Naming German in an English prompt made
  Qwen3-1.7B answer in German 18 % of the time on one sentence. Findings so far (2026-10-09): an example exchange per level moved small models
  far more than rule wording did (1.7B Medium vs Strong: 24 % vs 40 % median words
  changed, unchanged replies 13 → 7 of 48); every model kept numbers and names; 1.7B
  German turns ungrammatical past Light edits; Qwen3-4B separates the levels best
  (18 / 37 / 50 %) but once flipped a meaning ("unterschätzen" → "überschätzen");
  Gemma-4-E2B writes the best German but changes ~23 % even at Light.
- **Stock phrases (`STOCK_PATTERNS`).** One list of regular expressions per detected
  language; the prompt names only the phrases found in the passage itself (never in its
  context), so no other language and no absent phrase is ever mentioned. A phrase
  belongs on the list only if cutting it, or saying it plainly, loses nothing: flagging
  ordinary words ("however", "important") makes the model "fix" good text, and
  `tests/stock.test.mjs` keeps a sentence of ordinary uses ("foster care", "Yours
  truly", "is simply wrong") that must stay unflagged. In a pattern a space matches any
  whitespace and a match must be whole words, so an optional last part starts with its
  space (`(?: about)?`), never ends with one; a phrase after a comma uses a lookbehind
  (`(?<=,\s{0,3})ensuring`). Add a source to the README list when you add a batch.
  The benchmark measures with its own fixed list in `bench/corpus.json`, not with
  this one, so that every build is scored against the same yardstick.
  Learned on 2026-10-09 (4 models x 11 texts x 3 levels x 2 runs, read side by side):
  - Naming the phrases found beats a fixed example list: at Light the share removed
    rose from 35-68 % to 70-89 % (README table), at no extra meaning or grammar cost on
    Gemma-4 E2B. The best-guess list alone (before the research) got 56-82 %.
  - A sentence that is *only* a stock phrase must not go to the model. Told to cut it
    but "keep every sentence", Qwen3-4B answered "This email finds you well." and
    Qwen3-1.7B "This email hopes you're doing well." Such units are removed in code
    (`isStockOnly`, `deletionRange`) and left out of the context too: with the removed
    "Let that sink in." still in the context, Qwen3-4B wrote it back three times.
  - Name only the empty part: with "Nur so kann gewährleistet werden" on the list,
    Gemma cut "Nur so" as well and lost the "only". The pattern is now just the passive.
  - Cutting an adjective or a participle breaks the grammar around it ("a comprehensive
    overview" -> "a overview"), hence "keep the sentence grammatical" in the prompt.
  - `PREAMBLE_RE` must not wave a reply through because the original starts with
    "Here's": "Here is the revised passage: ..." got accepted until the check compared
    the first three words.
  - Models bring in stock phrases of their own even when told not to: Qwen3.5-4B put
    "Moreover," before an otherwise untouched sentence and called it a Light edit,
    Qwen3-4B swapped "Par ailleurs" for "En outre". `acceptRewrite` refuses a reply with
    more stock phrases than its original, naming them, which the second try then sees.
  - Small models change more and break more when a passage is dense with phrases:
    Qwen3-1.7B at Strong once dropped a "40 %" and turned "Frau Weber" into "Herr Müller".
    Every build also switched a formal German e-mail to "du" now and then (mostly
    Gemma at Medium/Strong), hence the form-of-address rule.
- **Set-up contrasts, greetings, form of address (v0.3.2).** Read side by side on the
  small ladder (`bench/results/20261010-claude-judging/`, A = v0.3.1, B = v0.3.2):
  - Contrasts (`CONTRAST_PATTERNS`) need both halves, or ordinary text gets flagged.
    Told to drop them, models dodge: "just" -> "only"/"simply", a full stop between
    the halves ("isn't just a cost. It's ..."), no adverb at all ("isn't code; it's
    people"). After a full stop, only a subject plus a non-negated verb counts, or "It
    is not just me. It isn't late" matches. German: only the rhetorical "kein ...,
    sondern" and "nicht nur ..., sondern"; "nicht am Montag, sondern am Dienstag" is
    plain German. A rule naming the shapes (`CONTRAST_RULES`, per language) beat an
    extra few-shot example (27B at Strong: 4/15 -> 1/15 kept vs 2/15).
  - The contrast refusal is soft and the fallback is the *first* try: the second runs
    hotter under the retry note and garbled German ("Man baut Vertrauen nicht einfach
    so auf, sondern man legt es in den Alltag").
  - Only Qwen3.5-4B of the small models drops contrasts; Qwen3 1.7B/4B and Gemma-4 E2B
    keep "It's not just about X, it's about Y" through the retry. No time cost measured
    (within +-15 %).
  - Greetings and sign-offs are never sent (`SALUTATION_RE`, in `isRewritable` and by
    sentence in `rewordUnits`): "Sehr geehrte Frau Weber," came back "Hallo"/"Liebe",
    and "Mit freundlichen Grüßen" on the line above the name came back as the name
    (Qwen3-4B, in v0.3.1 too).
  - German form of address is checked in code (`addressForms`): Gemma-4 E2B switched
    the Sie e-mail to "du" in every Medium/Strong run. A generic retry note didn't help
    (0/4); naming the form to keep did (8/8).
  - Qwen3.8-27B at Medium, German, by sentence turned "wir bedauern zutiefst" into "wir
    sind froh" with no retry involved: German meaning errors are a model limit, not a
    prompt one. Read German rewrites, don't count them.
- **Rewrite whole text.** `wholeRewrite` (pure section, "Stage 2b") runs the passes of
  `WHOLE_PASSES` with the model call injected (`chat(passId, messages, maxTokens, think)`), so
  `tests/whole.test.mjs` scripts every pass. Each text reply goes through
  `acceptWholeRewrite`; `wholeSpotNotes` finds the spots for the spots pass in code. The
  DOM side (`rewriteWhole`, `chatOnce`) only feeds it the chosen backend.
  **Rewrite freely** is the same call with `o.free`: a `plan` pass
  (`buildPlanMessages`) before the rewrite, content rules in place of the keep-every-claim
  ones, a fact check that allows dropped points, and no missing-number errors for the fix.
  The plan asks for no limit or doubt: asked for one, it made a claim up in nearly half
  the texts and once turned the writer's position around.
  **Plainer** (`#optPlain`, `o.plain`, German and English text, off by default): passes
  before the proofreading, then the fact check and fix once more. German: one job per pass, as for English, since one `plain` prompt holding all the
  rules was followed only in part. `words` (`buildPlainRuleMessages` with
  `PLAIN_DE_WORDS`): everyday verbs for noun chains, no sentence split or joined
  (`acceptWholeRewrite` refuses a reply with clearly more sentences). `split`: each
  sentence over 12 words (`longSentences`, counted in code since the model can't count)
  goes to the model on its own (`buildSplitMessages`) and comes back as two or three
  whole sentences, the link word kept ("deshalb", "aber"), both sides of a contrast kept,
  a "statt/ohne/um ... zu" part left with its clause (split off, "verbraucht, statt ihn
  einzuspeisen" became "Stattdessen muss man ihn einspeisen", the opposite);
  `acceptSplit` keeps the original sentence when the answer is still one sentence, has a
  fragment, opens two parts alike, loses a number or changes the length much. It also
  counts the words that carry the logic (`SPLIT_KEEP`: "dass", "damit", "ohne", "wenn",
  "oder", "nicht", a conjunction "während" ...; "weil" may become "denn" or "deshalb"):
  fewer of them in the parts means a lost condition, purpose or contrast ("ohne dass es
  schlechter wird" -> "Es wird nicht schlechter"). A part that is only a "Statt/Ohne/Um
  ... zu" phrase is a fragment, and three words in a row that come back in a second part
  were said twice. A split that passes goes to one more short call (`splitcheck`,
  `buildSplitCheckMessages`) that answers "nein" only for a changed claim, a broken
  sentence or a repeat: told to judge strictly (a reference across the full stop, "Das
  ...", "Er ..."), it refused 40 % of good splits. A part may open with "Deshalb", "Trotzdem" or "Stattdessen" only when the
  sentence had that link (`SPLIT_LINKS`; "Dabei" never): "verbunden und bleibt" became
  "verbunden. Deshalb bleibt". `info.splits` is [kept, tried]. `openers`:
  only when a row of sentences opens alike ("Sie sehen ... Sie koennen ..."), one edit
  naming the words. **The German must stay easy to understand:** the single prompt once
  split everything into 3-5 word sentences and lost the logic and sometimes the meaning
  ("weniger fuer schnelle Loesungen, sondern ..." -> "brauchte mich");
  don't trade that back for a shorter rhythm. For the same reason the German
  spots notes keep both sides of a contrast and the "aber" of a concession (dropping
  only "natuerlich"), and the slop cut leaves a German sentence with "aber", "sodass",
  "deshalb" and the like (`FILLER_KEEP_RE`): it once cut the payoff of a cost sentence. English: the five
  passes of `WHOLE_PLAIN_EN` (`buildOneRuleMessages`), one kind of sentence each; a
  single prompt holding all five rules did not work. With English Plainer the rewrite and
  these passes ask a server for thinking (`think: "low"` -> `chat_template_kwargs`
  `{enable_thinking, reasoning_effort}`); the in-browser model never thinks. The passes
  that cut (`verdicts`, `alternatives`) may shorten the text to half. Before the five, a
  `kind` pass (`buildTextKindMessages`, `parseTextKind`) reads from the original whether
  the writer tells about their own work, gives instructions, or argues (`TEXT_KINDS`), and
  the speaker pass gets only that kind's forms (`speakerRule`, `TEXT_KINDS[k].forms`): at
  most one per paragraph, on a judgement only, never on a fact, a step or tacked on at the
  end, and a form may come back. Told to word every one differently, the model put a
  speaker on plain facts ("We noticed you save money on heating") and reached for "you'll
  come to notice"; an unreadable answer keeps the rule with all three.
- **Checks shared by the passes.** `acceptWholeRewrite` refuses a later pass (not the
  fix) that starts more sentences in a row with the same two words than its input had,
  three or more (`sameOpenerRun`): "You can see ... You can download ..." is a list
  chopped up. German also counts the first word alone, from four in a row ("Sie sehen
  ... Sie koennen ... Sie muessen ..."). The sentences pass, German `words` and the English Plainer passes run
  through `edit`, which gives such a refusal (and a `words` split refusal) one second
  try with a note: refusing German `words` outright loses most of what Plainer does. The review flags at most a third of the sentences (at most 6), so the
  sentences pass stays an edit. With Rewrite freely the fact checks get the numbers the
  rewrite lost (`missingNumbers`, `24/7` counting as one) and list one only where its
  point is still there; without it, every lost number is an error. Two more errors are
  found in code and go to both fixes: a number the original never had (`addedNumbers`;
  the free rewrite turned "24/7" into "3 a.m."; written-out numbers up to 99 count as the
  same, `numberWords`), and a point said twice (`repeatedSentences`: content-word overlap
  of 60 % past `REPEAT_COMMON`, not a question, not a repeat the original had). Word
  overlap flags echoes too, so that error asks to say it once "unless the second adds
  something" and the model decides. These code-found errors go first in the list, ahead
  of the model's, so the cap of 12 never cuts them off. The fact check reads the whole
  text: checked one paragraph at a time against the whole original, it found more changed
  meanings in known cases, but not in fresh texts, at two to three times the time.
- **Proofreading, German** (`buildProofFindMessages`, `applyProofFixes`): the model lists
  `- "quote" -> "fix"` and the code applies a line only when the quote is found once, the
  fix changes no number (not even inside a word: "dreistelligen" -> "fünfstelligen"
  corrected a fact of the original) and it is a small edit. Asked for the whole text back,
  the model returned it unchanged even around a known slip. `info.proofed` is
  [applied, listed]. English keeps the whole-text proofreading.
- **The letter frame.** The rewrite of a letter's body may come to a quarter of it (0.3
  otherwise) when it keeps every number: an honest rewrite of a newsletter full of empty
  courtesy came to 0.28. After a German greeting ending in a comma, the body's first word
  is written small when the original's was and the word is never a noun (`greetingCase`).
- **Every prompt** starts with `NO_HIDDEN_MARKS` (`withNoHiddenMarks` in `buildChatBody`,
  `buildRewriteBody` and the in-browser path). The e2e mock (`tests/mock_openai.py`) skips
  that first line when it tells the passes apart.
- **Tests:** pure logic goes in unit tests that slice the real functions out of
  `src/script.js` (`tests/extract.mjs`, the same approach as `../tests/`). Renaming a
  function fails the suite; update the lists there. DOM behaviour goes in
  `tests/e2e_cleaner.py`.

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
