# Reword benchmark

Measures how well GGUF models do the Cleaner's **Reword** step, through the
unmodified app. Use it to pick a model to recommend, and before and after every
change to the reword prompt.

```bash
../benchmark/.venv/bin/python bench/bench.py                        # default ladder, judged
../benchmark/.venv/bin/python bench/bench.py --models Qwen3-4B-Q4_K_M.gguf --runs 1
../benchmark/.venv/bin/python bench/bench.py --levels light --texts de --judge none
../benchmark/.venv/bin/python bench/bench.py --app /tmp/patched.html --label prompt-b   # a prompt A/B
../benchmark/.venv/bin/python bench/bench.py --backend wllama --models Qwen3-1.7B-Q4_K_M.gguf --runs 1
```

Run it from `hermit-cleaner/` after `python3 build.py`. Models are read from
`../benchmark/models/`, filled by `../benchmark/download_models.py`. A full run of
the default ladder (Qwen3 0.6B, 1.7B, 4B, 8B, Qwen3.5 4B, Gemma-4 E2B and E4B;
`Qwen3.5-4B-Q4_K_M.gguf` is from `unsloth/Qwen3.5-4B-GGUF`, not in the download script) takes about
20-30 minutes on an RTX 5070 Ti, most of it judging. Launch it detached and watch
the log.

## How it works

1. **The model server.** For each model, `bench.py` starts llama.cpp's `llama-server`
   on the GPU. The build is pinned (`LLAMA_TAG`, the Ubuntu CUDA 12.8 one) and is
   downloaded once into `~/.cache/hermit-cleaner-bench/` (about 770 MB). `--api URL`
   uses a server that is already running instead.
   If something else holds part of the GPU, `--gpu-layers auto` lets llama.cpp fit the
   layers around it (with `--allow-busy-gpu`; the speeds are then not comparable).
2. **The app.** Headless Chromium opens the built
   `dist/hermit-cleaner-standalone.html`, configures it for that server, and presses
   Run for every text in `corpus.json` at every level (`--levels`), by sentence, with
   every sentence picked, `--runs` times. Four pages work at once against four
   server slots (`--parallel`), after one warm-up run each.
   - `--backend wllama` loads the model into the `-wllama` build instead, as a user
     would. It runs one page on the CPU (or `--webgpu`), and is slow.
3. **The judge.** Every rewrite is then scored 1-5 for **meaning**, **grammar** and
   **natural** by a judge model on the same server. The default is the local
   gpt-oss-20b (else Qwen3-8B); `--judge-api` uses a running server, and
   `--judge none` skips this step. The judge is told what the Cleaner is for, so
   replacing hype and stock phrases doesn't cost meaning points. Before judging, it
   scores five known pairs (an inverted meaning, a changed number, a German grammar
   error, two harmless phrase drops). The report says how many it got right.
   With `--judge none`, only the counted columns are filled; read `samples.md`
   yourself, or have a stronger model read it. For the v0.3.0 stock-phrase work the
   rewrites were judged by Claude, side by side across the builds, instead.

`corpus.json` has 11 texts: English and German blog posts and e-mails, an English
product text and report, a German manual and social-media post, two posts in the newer
style ("It's not just X, it's Y", "Das Ergebnis?"), and one French article. Its `stock_phrases` are a fixed yardstick,
kept apart from the app's `STOCK_PATTERNS`, so that every build is measured the same
way: the phrases in the texts, plus common AI words a model might bring in.

## What the report says

`results/<time>-<label>/` (gitignored) holds:
- `review.md`: the summary, judge grammar per language, a recommendation per level,
  every rewrite the judge scored 3 or lower, and the refusals
- `samples.md`: every original/rewrite pair, with its scores
- `run.json`: everything, including the server logs' location and the arguments

Per model and level:

| Column | Meaning |
|---|---|
| Accepted / Unchanged | share of sentences reworded and kept, or returned as they were |
| Refused | requests the app threw away (wrong language, an introduction, too long, a Light edit that changed too much) |
| 2nd try (reworded) | sentences that got the app's one retry after an unchanged or refused reply, and how many it then reworded |
| Words changed | median share of words changed per request (the app's `wordDiff`) |
| Stock phrases removed | how many of the corpus's `stock_phrases` disappeared |
| Stock added | how many of them the rewrites have that their originals didn't: AI phrases the model brought in itself |
| Numbers / Names kept | rewrites with the same numbers, and with every listed name of the text |
| Meaning, Grammar, Natural | the judge's averages; Bad counts rewrites at 3 or lower on meaning or grammar |
| s/run, decode tok/s | one text through the app; the server's decode speed (from `/metrics`) |

Sentences the app removes outright (nothing but stock phrases) have no rewrite; their
stock phrases count as removed, and they count as accepted.

Speeds are those of llama-server on the GPU, not of the browser. For in-browser
speed, use `--backend wllama` or see the table in `../docs/guide.md`.

## Things learned building it

- **Mentioning another language in the prompt pulls small models into it.** The
  prompt used to say "German stays German" and list German stock phrases for every
  passage. Qwen3-1.7B then answered one English sentence in German 22 times in 120.
  With the phrases listed only in the passage's language, it was 0 in 120. The app
  refused those replies anyway, but each was a lost rewrite.
- **Parallel slots change the samples a little.** At temperature 0, 9 of 20 replies
  sent four at a time matched those sent one at a time, with or without a shared KV
  cache: llama.cpp's results depend on the batch. With the old prompt, the shared cache
  (`kv_unified`, llama-server's default for parallel slots) made the German drift far
  worse (92 of 120 with German requests in flight, against 27 with separate caches),
  so the server runs with `--no-kv-unified`.
- The number check and the judge catch different things: a dropped "in just 45
  seconds" got meaning 4 from the judge but fails Numbers kept.
- Headless Chromium in WSL only has a software WebGPU, so `--backend wllama` stays on
  the CPU unless `--webgpu` is given.
- `llama-server` started from a shell with `cd dir && ./llama-server &` survives a
  `kill $!` (that kills the subshell), and its VRAM then fails the next run's
  idle-GPU check. `bench.py` keeps the process handle and stops it itself.

## What the Reword rules are based on

The findings behind the Reword rules in [`../AGENTS.md`](../AGENTS.md), from runs of this
benchmark read side by side. The language finding is the first item above.

- **Levels (2026-10-09).** An example exchange per level moved small models far more
  than rule wording did (Qwen3-1.7B Medium vs Strong: 24 % vs 40 % median words changed,
  unchanged replies 13 → 7 of 48). Every model kept numbers and names; 1.7B German turns
  ungrammatical past Light edits; Qwen3-4B separates the levels best (18 / 37 / 50 %) but
  once flipped a meaning ("unterschätzen" → "überschätzen"); Gemma-4-E2B writes the best
  German but changes ~23 % even at Light.
- **Stock phrases (2026-10-09, 4 models x 11 texts x 3 levels x 2 runs):**
  - Naming the phrases found beats a fixed example list: at Light the share removed rose
    from 35-68 % to 70-89 % (the table in `../docs/guide.md`), at no extra meaning or grammar
    cost on Gemma-4 E2B. The best-guess list alone (before the research) got 56-82 %.
  - Told to cut a sentence that is only a stock phrase but "keep every sentence",
    Qwen3-4B answered "This email finds you well." and Qwen3-1.7B "This email hopes
    you're doing well." With the removed "Let that sink in." still in the context,
    Qwen3-4B wrote it back three times.
  - With "Nur so kann gewährleistet werden" on the list, Gemma cut "Nur so" as well and
    lost the "only".
  - Cutting an adjective or a participle broke the grammar around it ("a comprehensive
    overview" -> "a overview").
  - "Here is the revised passage: ..." got accepted while `PREAMBLE_RE` let a reply
    through because the original started with "Here's".
  - Models bring in stock phrases of their own even when told not to: Qwen3.5-4B put
    "Moreover," before an otherwise untouched sentence and called it a Light edit,
    Qwen3-4B swapped "Par ailleurs" for "En outre".
  - Small models change more and break more when a passage is dense with phrases:
    Qwen3-1.7B at Strong once dropped a "40 %" and turned "Frau Weber" into "Herr
    Müller". Every build also switched a formal German e-mail to "du" now and then
    (mostly Gemma at Medium/Strong).
- **Contrasts, greetings, form of address (2026-10-10, v0.3.1 against v0.3.2 on the small
  ladder):**
  - Told to drop set-up contrasts, models dodge: "just" -> "only"/"simply", a full stop
    between the halves ("isn't just a cost. It's ..."), no adverb at all ("isn't code;
    it's people"). A rule naming the shapes beat an extra few-shot example (27B at
    Strong: 4/15 -> 1/15 kept vs 2/15).
  - The second try runs hotter under the retry note and garbled German ("Man baut
    Vertrauen nicht einfach so auf, sondern man legt es in den Alltag").
  - Only Qwen3.5-4B of the small models drops contrasts; Qwen3 1.7B/4B and Gemma-4 E2B
    keep "It's not just about X, it's about Y" through the retry. No time cost measured
    (within +-15 %).
  - "Sehr geehrte Frau Weber," came back "Hallo"/"Liebe", and "Mit freundlichen Grüßen"
    on the line above the name came back as the name (Qwen3-4B, in v0.3.1 too).
  - Gemma-4 E2B switched the Sie e-mail to "du" in every Medium/Strong run. A generic
    retry note didn't help (0/4); naming the form to keep did (8/8).
  - Qwen3.8-27B at Medium, German, by sentence turned "wir bedauern zutiefst" into "wir
    sind froh" with no retry involved: German meaning errors are a model limit, not a
    prompt one.
- **Models that fit the `-wllama` build (2026-10-26, one run):** Qwen3-4B, Qwen3.5-4B,
  Qwen3-8B, Gemma-4-E4B and Gemma-4-12B were all usable; only Gemma-4-12B had no real
  defect, and both Qwen3 models flipped "unterschätzen" again.
