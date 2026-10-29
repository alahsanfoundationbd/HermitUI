# HermitUI Cleaner guide

The details behind the [README](../README.md): what each step does exactly, the in-browser models with their measurements, and where the stock-phrase list comes from.

- [Clean](#clean)
- [Reword](#reword)
- [Typos](#typos)
- [Rewrite whole text](#rewrite-whole-text)
- [Models in the browser](#models-in-the-browser)
- [Where the stock-phrase list comes from](#where-the-stock-phrase-list-comes-from)
- [Roadmap](#roadmap)

## Clean

Everything outside printable **Latin-1** (plus €) is removed or replaced, so German, French, Spanish and other Western European text keeps its letters (ä ö ü ß é ñ ç « » …).

- **Hidden text** in Unicode tag characters (invisible copies of ASCII, used to smuggle instructions into text) is removed, and the report shows the decoded text.
- **Invisible characters** are removed: zero-width spaces and joiners, the BOM, the word joiner, BiDi controls, the soft hyphen, variation selectors and control characters.
- **Unusual spaces** (no-break, narrow, thin, ideographic) become normal spaces.
- **Typography** becomes what a keyboard types: “ ” „ → `"`, ‘ ’ → `'`, en dash → `-`, em dash → ` - `, … → `...`, → → `->`.
- **Look-alike letters** (a Cyrillic а inside an otherwise Latin word, say) become the Latin letter. Words that really are Cyrillic or Greek are left alone and then dropped.
- **Accents stored as two characters** (a letter plus a combining mark, as macOS writes them) are joined, so "u" + "¨" becomes ü and keeps its accent.
- **"Fancy text"** becomes plain letters: 𝐛𝐨𝐥𝐝 and 𝓈𝒸𝓇𝒾𝓅𝓉 math letters, Ⓒⓘⓡⓒⓛⓔⓓ, 🅂🅀🅄🄰🅁🄴🄳 and 🆂🆀🆄🅰🆁🅴🅳 letters, ꜱᴍᴀʟʟ ᴄᴀᴘꜱ, fullwidth, s̶t̶r̶u̶c̶k̶ and Zalgo text.
- **Other letters** are simplified (ő → o, ł → l). Emoji (with skin tones, flags, keycaps and ZWJ sequences), CJK, private-use characters and the like are dropped without leaving stray spaces ("✅ Done" → "Done").
- **Whitespace**, a known hiding place for data: trailing spaces and repeated spaces inside a line are removed. Indentation and fenced code blocks stay as they are. (This also removes Markdown's two-space line breaks.)

## Reword

Your model rewrites 10 %, 30 %, 60 % or all of the **sentences** (the default) or **paragraphs** of the prose.

- **Change** sets how much. **Light** (the default) cuts stock phrases and swaps one or two words per sentence, **Medium** rephrases each sentence, **Strong** rewrites freely. A Light reply that changes more than half of the other words is refused (cut or replaced stock phrases don't count). Each level shows the model one short example exchange (English or German); small models follow an example far better than rules alone.
- **AI stock phrases** give machine-written text away most, so the app looks for them in every language it detects: filler transitions ("Moreover", "Darüber hinaus"), signposting ("It is important to note that"), hype ("game-changer", "nahtlos"), the AI vocabulary ("delve", "tapestry", "leverage"), chatbot and letter phrases ("I hope this email finds you well"), and the framing current models overuse ("It's not just X, it's Y", "This matters because"). Sentences with some are reworded first, and the prompt names each phrase found in the passage, so even a small model cuts it or says it plainly. A sentence that is nothing but stock phrases ("I hope this email finds you well.", "Let that sink in.") is removed in code, without the model, and the output marks where it was. The report counts the phrases before and after.
- **Set-up contrasts** ("training isn't just a cost - it's ...", "kein Titel, sondern ein Dienst") are the habit models keep most stubbornly. Told to drop one, they swap "just" for "only" or put a full stop between the halves. The app finds them in English and German with both halves and names them in the prompt; at Medium and Strong a reply that still has one gets a second try. If that one keeps a contrast too, the first rewrite is used anyway, since the original has the same contrast. A plain correction ("nicht am Montag, sondern am Dienstag") is not flagged. Large models drop most of them (Qwen3.8-27B: 14 → 3 in six texts); of the small ones only Qwen3.5-4B does.
- **Tone:** keep it, or make it a little more casual, more formal or simpler.
- **Also:** one instruction of your own, such as "use du" or "British spelling".
- The words the model changed are highlighted inside each reworded span, and the report gives the average share of words changed. A reply with the same words as the original counts as unchanged.
- A reply that comes back unchanged or is refused gets **one second try**, told what was wrong and sampled a little more freely. At Light this rewords most of what small models first leave alone (Qwen3-1.7B: 66 % → 83 % of the sentences). Units under 20 letters that come back unchanged get no second try: those are mostly greetings and names the model was right to leave.
- **Min. letters** (default 6): shorter sentences and paragraphs are not sent ("Tom", "OK.").
- **Greetings and sign-offs** ("Sehr geehrter Herr Becker,", "Hi Sarah,", "Mit freundlichen Grüßen" with the name under it) are never sent. Reworded, they came back as "Hallo Herr Becker," or as the name itself.

By sentence, each one goes out with its paragraph as context so the rewrite still fits, and up to three picked sentences next to each other share one request. Abbreviations like "z. B.", "Dr." or "e.g." and dates like "3. Mai" don't end a sentence. Headings, code blocks, tables and lines under Min. letters are never sent.

The language is detected (English, German, French, Spanish, Italian, Dutch, Portuguese) and named in the prompt. A reply is thrown away, and the original kept, when it comes back empty, much shorter or longer than the original, with an introduction ("Here is…"), in the wrong language, or with more stock phrases than before ("Moreover, …"). The prompt asks the model to keep the form of address (formal or informal). In German a reply that switches between "Sie", "du" and "ihr" is refused, and the second try is told which one to keep. The model's answers go through the cleanup again.

## Typos

A low rate of realistic mistakes:

- **In every language:** a neighbouring key, two letters swapped, a letter dropped or doubled, a missing capital at a sentence start, Shift held too long ("DIese"), a repeated word ("the the"), a missing space ("inthe").
- **In German text, also:**
  - an "n" too many or missing ("habe" → "haben", "keinen" → "keine")
  - -em/-en mixed up ("mit einen Freund", "dem" → "den")
  - das/dass
  - a missing comma before dass/weil/wenn/obwohl and similar conjunctions
  - a noun in lower case
  - ß typed as ss

The report lists how many of each kind were added. The keyboard follows the language (QWERTZ for German, AZERTY for French, QWERTY otherwise), or you pick it. Typos never touch code, URLs, e-mail addresses, numbers, ALL-CAPS words or capitalised words mid-sentence (likely names). Words under four letters never get a letter typo, only whole-word slips like a repeat or "dem"/"den"; German is the exception, since short capitalised words there are mostly nouns. **Reroll typos** makes new ones without calling the model again.

## Rewrite whole text

**✍️ Rewrite whole text** sits beside **Run** and rewrites the text in one piece, in several passes: a critique, the rewrite, a sentence review, a fact check against the original with a fix, a pass over the contrasts and stock phrases found in code, and proofreading. For German text the model lists the mistakes it finds, and only small corrections that change no fact or number are made. A letter's greeting and sign-off stay as they were. Clean, Tone, Also and Typos work as for Run. **About you** takes a few facts about yourself that the rewrite may use as your own experience; it invents none. The report says what each pass did and what the fact checks found.

It takes about ten model calls, so it is slow on a small model, and a small model follows the instructions less well. In the browser build each call carries the whole text plus the instructions: past about 2,000 characters, raise **Context window** in the settings above 4096.

**🔀 Rewrite freely** adds a plan at the start and lets the rewrite change the content. It may drop a generic or repeated point, merge points, change the order and structure, and add typical everyday examples. The main claim stays, the facts it keeps stay right, and it adds no figures, names or dates. A number lost from a point that was kept goes back in with the fact check; one that went with a dropped point is listed in the report. Read the result: it is no longer the same text.

**Plainer** (German and English, off by default) adds passes before the proofreading and runs the fact check once more.

- **German:** everyday words in place of noun chains; then each long sentence split into two or three whole sentences on its own. A split is undone when it fails a check, or when one more short call finds that it changed a claim, broke a sentence or said something twice. Then, only where needed, a pass for a row of sentences that start alike.
- **English:** five passes, each changing one kind of sentence and leaving the rest: verdicts and sentences that only set up the next one; an objection raised and answered; formal and product-copy phrases; general claims without a speaker (at most one per paragraph, on a judgement only, in a few plain forms chosen by the kind of text, which one more short call reads first); and the alternatives and explanations set against a piece of advice. On a server the rewrite and these five passes think a little, so it takes several minutes on a large model.

## Models in the browser

The `-wllama` build runs the model in the tab with [wllama](https://github.com/ngxson/wllama) 3.6.1, which is inside the file. Open ⚙️ Settings, choose **In this tab**, and pick a `.gguf` file or paste a link (`hf:user/repo/file.gguf` works). The model is held in memory only and is gone with the tab.

A link can name the model: `hermit-cleaner-wllama.html#gguf=hf:user/repo/file.gguf` (or a direct `.gguf` or Hugging Face URL). Opening it shows a banner with the model and the host it would come from; the download starts only when you press **Load model**.

Opened as a plain file, the model runs on one CPU thread. Served with cross-origin isolation (COOP/COEP headers, for example `../../benchmark/serve.py`) it uses every core. WebGPU helps on a real graphics card, but not in Firefox yet ([bug 1870699](https://bugzilla.mozilla.org/show_bug.cgi?id=1870699)), where it is off by default and slower than the CPU.

### Speed

CPU, 16 threads, a 3-sentence request, warm; 2026-10-09, before the prompt fixes that the judged table below includes:

| Model (Q4_K_M) | Size | s / request | English | German |
|---|---|---|---|---|
| Qwen3 0.6B | 0.4 GB | ≈ 4–6 | tiny edits whatever the level; often returns the text unchanged | the same |
| **Qwen3 1.7B** | 1.1 GB | ≈ 8 | **good at every level**, Light trims stock phrases | Light is fine; Medium/Strong make grammar mistakes |
| **Qwen3 4B** | 2.5 GB | ≈ 18–22 | the clearest Light/Medium/Strong steps (median 18 / 37 / 50 % of words changed) | Light is fine; once turned "unterschätzen" into "überschätzen" at Medium |
| Gemma-4 E2B | 3.1 GB | ≈ 19 | changes a lot even at Light (median 23 %) | the most natural German at Medium/Strong |

Small models can flip a word's meaning, so read the highlighted changes.

### Quality, judged

From [`bench/`](../bench/README.md), 2026-10-09: 9 English, German and French texts, every level, 3 runs, scored 1-5 by gpt-oss-20b (meaning / grammar, averaged over the levels):

| Model (Q4_K_M) | English | German | Notes |
|---|---|---|---|
| Qwen3 0.6B | 4.65 / 4.99 | 3.00 / 3.05 | not usable for German |
| Qwen3 1.7B | 4.65 / 4.96 | 4.28 / 4.66 | Light leaves a third of the sentences unchanged |
| Qwen3 4B | 4.79 / 4.93 | 4.21 / 4.82 | turned "unterschätzen" into "überschätzen" in all 3 Medium runs |
| Qwen3.5 4B | 4.73 / 4.96 | 4.54 / 4.68 | the best Light edits (no problems found), but German grammar slips at Medium/Strong |
| **Gemma-4 E2B** | 4.81 / 4.97 | **4.67 / 4.85** | the best overall: no meaning or grammar problem at Light or Medium |
| Gemma-4 E4B | 4.72 / 4.80 | 4.70 / 4.83 | no better than E2B, and slower |

Every model kept 88-100 % of the numbers and 95-100 % of the names.

### Stock phrases, measured

From [`bench/`](../bench/README.md), 2026-10-09: 11 English, German and French texts full of AI phrases, by sentence, every sentence picked, 2 runs. The share of the corpus's stock phrases gone after rewording, with v0.2.2's fixed list of examples and with v0.3.0 (Light / Medium / Strong):

| Model (Q4_K_M) | v0.2.2 | v0.3.0 | Reworded at Light (v0.2.2 → v0.3.0) |
|---|---|---|---|
| Qwen3 1.7B | 41 / 84 / 75 % | 71 / 82 / 76 % | 75 → 86 % |
| Qwen3 4B | 46 / 86 / 89 % | 78 / 87 / 89 % | 87 → 93 % |
| Qwen3.5 4B | 35 / 90 / 79 % | 70 / 93 / 90 % | 77 → 90 % |
| **Gemma-4 E2B** | 68 / 96 / 92 % | **89 / 99 / 95 %** | 92 → 94 % |

Claude judged the rewrites by reading the old and new prompt's version of each sentence side by side. On Gemma-4 E2B the new prompt makes no more meaning or grammar mistakes than the old one. The small Qwen models change more now and break a little more with it, mostly in German and at Medium or Strong, where they were already weak. Models still swap one stock phrase for another now and then ("nahtlos" → "reibungslos"), so a few remain.

## Where the stock-phrase list comes from

`STOCK_PATTERNS` in `src/script.js` was put together in October 2026 from these sources. A phrase made the list only if cutting it, or saying it plainly, loses nothing.

- Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): the words to watch per model generation (2023–2026), undue emphasis ("plays a pivotal role", "a testament to"), promotional language, negative parallelisms ("not just X, but Y"), and chatbot phrases ("I hope this helps").
- Kobak et al., *Delving into LLM-assisted writing in biomedical publications through excess vocabulary* (Science Advances, 2025): the style words ("delves", "showcasing", "underscores", "pivotal") that rose suddenly in PubMed abstracts after ChatGPT ([data](https://github.com/berenslab/llm-excess-vocab)).
- Graphite's [AI Tells](https://graphite.io/five-percent/research/ai-tells) (2026): 10,000 human and 90,000 AI articles from nine current models. Frames such as "the X is not simply" (576 × the human rate), "matters because" (up to 357 ×) and "rather than merely" (160 ×) are the new tells; em dashes and "delve" have faded.
- GPTZero's [AI vocabulary](https://gptzero.me/news/most-common-ai-vocabulary/) ("play a significant role in shaping" 182 ×, "today's fast-paced world" 107 ×).
- German: Shaitarova et al. (SwissText 2024) on formal connectives such as "darüber hinaus", and the guides at [ki-praxisbeispiele.de](https://ki-praxisbeispiele.de/typische-ki-formulierungen-2/), [charismarcom.de](https://www.charismarcom.de/post/typische-ki-formulierungen-vermeiden/), [korrektur.de](https://korrektur.de/ki-texte-erkennen-merkmale-checkliste) and [urbanstudio.de](https://urbanstudio.de/blog/ki/die-sprache-der-ki/).
- Our own reading of texts a local model wrote, before and after rewording: the set-up contrasts in both languages, business and letter phrases ("culture of vigilance", "strategischer Hebel", "Ihr Vertrauen ist uns sehr wichtig") and essay formulas ("This experience taught me that").
- French, Spanish, Italian, Dutch and Portuguese: style guides and blog lists only (for example [gpt-watermark-remover.com/fr](https://gpt-watermark-remover.com/fr/blog/mots-typiques-ia-eviter) and [howmanywords.app](https://howmanywords.app/it/blog/chatgpt-stile-scrittura-indizi)). No study measures these languages yet, so their lists are short.

## Roadmap

- A per-language example for French, Spanish and the others (today only English and German get one).
