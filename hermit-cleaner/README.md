# HermitUI Cleaner

*Cleans up text another model wrote: hidden characters out, plain typography, some sentences reworded by your own model, and a few natural typos.*

> **Status: v0.4.10.** One self-contained HTML file in two versions:
> [`dist/hermit-cleaner-standalone.html`](dist/hermit-cleaner-standalone.html) (≈ 380 KB)
> rewords through a model server, and
> [`dist/hermit-cleaner-wllama.html`](dist/hermit-cleaner-wllama.html) (≈ 3.6 MB) can also
> run a small GGUF model in the tab, with no server at all.
> It is a sibling of [HermitUI](../) and [HermitUI Agent](../hermit-agent/).
> Nothing is stored: the text and the settings live in the tab's memory and are gone when you close it.

## Try it

1. Open [the hosted page](https://moooff.github.io/HermitUI/hermit-cleaner/dist/hermit-cleaner-standalone.html) or `dist/hermit-cleaner-standalone.html` (double-clicking the file is fine).
2. Paste text (or drop a `.txt`/`.md` file), choose the steps, and press **Run** (Ctrl+Enter). Cleanup and typos need nothing else.
3. For rewording, start an OpenAI-compatible server that allows browser requests (CORS), e.g. `llama-server -m model.gguf --jinja --port 9931`; Ollama works too. In ⚙️ Settings, check the API Base URL (default `http://localhost:9931/v1`) and press **Test Connection**. With the model left empty, the server's first model is used.

If the Base URL points at a server outside your machine or network, a warning says that the text will be sent there.

No server? The `-wllama` file runs the model in the tab. Each link opens it with a model filled in; the model downloads from Hugging Face into memory when you press **Load model**:

| Open with | Download | What the benchmark found |
|---|---|---|
| [**Gemma-4 E2B**](https://moooff.github.io/HermitUI/hermit-cleaner/dist/hermit-cleaner-wllama.html#gguf=hf:unsloth/gemma-4-E2B-it-GGUF/gemma-4-E2B-it-Q4_K_M.gguf) | 3.1 GB | the best overall, English and German: start here |
| [Qwen3 1.7B](https://moooff.github.io/HermitUI/hermit-cleaner/dist/hermit-cleaner-wllama.html#gguf=hf:unsloth/Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf) | 1.1 GB | fast; good English, German only at Light |
| [Qwen3 4B](https://moooff.github.io/HermitUI/hermit-cleaner/dist/hermit-cleaner-wllama.html#gguf=hf:unsloth/Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf) | 2.5 GB | solid; once flipped a meaning at Medium |
| [Qwen3.5 4B](https://moooff.github.io/HermitUI/hermit-cleaner/dist/hermit-cleaner-wllama.html#gguf=hf:unsloth/Qwen3.5-4B-GGUF/Qwen3.5-4B-Q4_K_M.gguf) | 2.7 GB | the best Light edits; weaker German above Light |
| [Gemma-4 E4B](https://moooff.github.io/HermitUI/hermit-cleaner/dist/hermit-cleaner-wllama.html#gguf=hf:unsloth/gemma-4-E4B-it-GGUF/gemma-4-E4B-it-Q4_K_M.gguf) | 5.0 GB | no better than E2B, slower |
| [Qwen3 8B](https://moooff.github.io/HermitUI/hermit-cleaner/dist/hermit-cleaner-wllama.html#gguf=hf:unsloth/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf) | 5.0 GB | no better than the 4B models; very slow in the browser, and on a CPU it may not load at all |
| [Qwen3 0.6B](https://moooff.github.io/HermitUI/hermit-cleaner/dist/hermit-cleaner-wllama.html#gguf=hf:unsloth/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q4_K_M.gguf) | 0.4 GB | tiny and quick to try; English only |

Use Chrome or Edge with WebGPU. In Firefox, WebGPU is currently slower than the CPU. Speed and quality per model are in the [guide](docs/guide.md#models-in-the-browser).

## What it does

Each step is optional.

1. **Clean.** Everything outside printable Latin-1 (plus €) is removed or replaced, so Western European text keeps its letters (ä ö ü ß é ñ ç). That covers hidden text in Unicode tag characters (shown decoded in the report), zero-width and other invisible characters, odd spaces, curly quotes and dashes, look-alike letters, "fancy text" such as 𝐛𝐨𝐥𝐝 or ꜱᴍᴀʟʟ ᴄᴀᴘꜱ, emoji, and trailing spaces. Code blocks and indentation stay as they are.
2. **Reword.** Your model rewrites 10 % to all of the sentences (or paragraphs). **Light** cuts stock phrases and swaps a word or two, **Medium** rephrases, **Strong** rewrites freely. Sentences with AI stock phrases ("It is important to note that", "game-changer") or set-up contrasts ("not just X, it's Y") go first, and the prompt names what it found. You can also set the tone or add one instruction of your own ("use du"). Changed words are highlighted. A bad reply (empty, wrong language, a "Here is…" intro, new stock phrases) is thrown away and the original kept. Greetings and sign-offs are never sent.
3. **Typos.** A few realistic mistakes: a neighbouring key, swapped letters, a repeated word, and in German also das/dass, -em/-en and missing commas. The keyboard follows the language. Typos never touch code, URLs, numbers or names, and **Reroll typos** makes new ones without calling the model.

**✍️ Rewrite whole text** rewrites the text in one piece, in about ten passes, with fact checks against the original. **🔀 Rewrite freely** may also drop, merge or reorder points. **Plainer** (German and English) adds passes for everyday words and shorter sentences. Hover a highlight to see what was there before; **Copy** copies the plain text.

Every rule, pass and check is in the [guide](docs/guide.md).

## Limits

- Cleaning characters doesn't remove real AI watermarks. Schemes like SynthID-Text hide the watermark in which words the model picks. Rewording changes the words, so it is the step that matters for those.
- No tool can promise what an AI detector will say. Detectors are unreliable in both directions, and a small model's rewrite is still machine-written text.
- Typos make text look hand-typed only up to about 1 %. More than that looks sloppy.
- Text in other scripts (Cyrillic, Greek, CJK, Arabic …) is removed, not translated. Upside-down text and flag letters go too.
- The stock-phrase list catches the common cases. Each model generation has its own habits, and a list can't tell an AI habit from a person who likes the word "crucial", so it only names phrases that carry no information or are plain hype. Headings are never sent, so a stock phrase in a heading stays.
- Markdown formatting (`**bold**`, `## headings`) stays in the text.
- Small in-browser models write weaker German than English: past Light, a 1.7B model makes grammar mistakes. Even a 27B model, rewording German at Medium, now and then turns a meaning around ("wir bedauern" → "wir sind froh"). Check the highlighted changes.
- **Reword** removes phrases and framing. It doesn't change what a text says or how it is built, and it adds nothing.
- **Rewrite whole text** changes much more, so it can drop or merge a point or shift a meaning despite its fact checks. Read the result before you use it.

## Build & test

```bash
python3 build.py                                     # → dist/hermit-cleaner-standalone.html and -wllama.html
node tests/run.mjs                                   # unit tests (pure logic)
../benchmark/.venv/bin/python tests/e2e_cleaner.py   # e2e vs. a mock endpoint, Chromium + Firefox
../benchmark/.venv/bin/python bench/bench.py        # reword benchmark: real GGUF models on llama-server, judged
```

See [tests/README.md](tests/README.md), [bench/README.md](bench/README.md) and [AGENTS.md](AGENTS.md).
