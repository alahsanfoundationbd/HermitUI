<div align="center">
  <img width="120" alt="HermitUI logo" src="site/logo.svg" />
  <h1>HermitUI Agent</h1>
  <p><i>A supervised agent that writes and runs Python in your browser tab, with your own model.</i></p>
  <p>
    <a href="../LICENSE"><img alt="License: AGPL v3" src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" /></a>
    <img alt="One HTML file" src="https://img.shields.io/badge/One_HTML_file-11_MB-6f42c1.svg" />
    <img alt="Python via Pyodide" src="https://img.shields.io/badge/Python-Pyodide_(WebAssembly)-3776ab.svg" />
  </p>
  <p>
    <a href="https://moooff.github.io/HermitUI/hermit-agent/"><b>Project page</b></a> •
    <a href="#try-it">Try it</a> •
    <a href="#how-you-supervise-it">Supervision</a> •
    <a href="#what-it-can-make">Files it makes</a> •
    <a href="#what-leaves-your-machine">What leaves your machine</a> •
    <a href="#documents">Documents</a>
  </p>
</div>

<div align="center">
  <a href="https://moooff.github.io/HermitUI/hermit-agent/"><img src="site/demo-data.webp" alt="HermitUI Agent cleans a messy sales CSV, recovers from two failed attempts, and draws a chart of monthly revenue per region" width="880" /></a>
  <p><i>A real run with Qwen3.8 27B on a local llama.cpp server, sped up by removing the wait. The agent cleans a messy CSV, recovers from its own errors, and saves a chart and an Excel workbook.</i></p>
</div>

<div align="center">
  <a href="https://moooff.github.io/HermitUI/hermit-agent/dist/hermit-agent-standalone.html">
    <img src="https://img.shields.io/badge/Open_HermitUI_Agent-1f6feb?style=for-the-badge" alt="Open HermitUI Agent" />
  </a>
  <a href="https://moooff.github.io/HermitUI/hermit-agent/">
    <img src="https://img.shields.io/badge/Project_page_with_videos-6f42c1?style=for-the-badge" alt="Project page with videos" />
  </a>
</div>

> **Status: v0.3.27** (Phase 3.7, a plan you can see). One self-contained HTML file,
> [`dist/hermit-agent-standalone.html`](dist/hermit-agent-standalone.html) (about 11 MB,
> Python included). It is developed here, separately from the main app in
> [`../src/`](../src/), so it can move fast without destabilising HermitUI.

Give it a task, like "clean up these CSVs and chart the monthly totals", "write and test a parser for this log format" or "check this calculation numerically". The agent writes Python, runs it against a virtual file system in the tab, reads the output and decides the next step, until the task is done. It can also search, read, write, edit, move and delete files directly, without Python; a CSV that Excel saved as Windows-1252 stays Windows-1252 when it edits it.

It works with any OpenAI-compatible server: llama.cpp, Ollama, LM Studio, vLLM, or a cloud API if you pick one. Nothing to install, and nothing is stored: close the tab and the workspace disappears.

## Try it

1. Start an OpenAI-compatible server that allows browser requests (CORS). For
   example, llama.cpp: `llama-server -m model.gguf --jinja --port 9931`. Any
   OpenAI-compatible cloud API works too, but then the task and what the agent
   prints go to that provider.
2. Open [`dist/hermit-agent-standalone.html`](https://moooff.github.io/HermitUI/hermit-agent/dist/hermit-agent-standalone.html),
   or download it and double-click the file. No server is needed for the page itself,
   and Python boots offline in about a second.
3. Open Settings and set the API Base URL (default `http://localhost:9931/v1`), the
   model and, if needed, the key. **Test Connection** checks them.
4. Drop files into the workspace, describe the task, and press **Start**.

**A server on another device** (the agent on a phone, the model on a computer at home):
the server has to listen on the network (llama.cpp `--host 0.0.0.0`), and the hosted page
is https while a LAN server is usually plain http, which browsers block as mixed content.
Chrome asks to allow local network access instead (on Android, Chrome first needs Android's
"Nearby devices" or "Local network" permission under Settings → Apps → Chrome); elsewhere, open the agent over http
from the server itself (put `hermit-agent-standalone.html` into a folder as `index.html`,
start llama.cpp with `--path <that folder>`, open `http://<server-ip>:<port>/` and use
`http://<server-ip>:<port>/v1` as the API Base URL), or give the server https, e.g. with
`tailscale serve`. Settings for other servers are in
[HermitUI's README](../README.md#a-server-on-another-device-phone-tablet-second-pc).

The agent needs a model that can recover from its own errors. The reference tasks pass with Qwen3.8-27B at reasoning effort Low (see [ROADMAP.md](ROADMAP.md)). If the server drops mid-task, the agent retries for two minutes and then pauses: nothing is lost, and Retry resumes where it stopped.

## How you supervise it

<div align="center">
  <img src="site/demo-fix.webp" alt="The agent finds two bugs, its edits to the user's files are held for approval with a diff, and after approval main.py prints the expected totals" width="880" />
  <p><i>Two bugs in two files. The edits wait for approval, with the diff shown, before they touch the files you uploaded.</i></p>
</div>

- **Every step is visible:** the model's reasoning, the precise code, the result, the graphs and pictures it created, and a diff of the modified files.
- **Risky steps wait for you.** Harmless steps run on their own. A step that deletes, overwrites or moves one of your files, or tries to reach the network, stays put until you approve it.
- **You see where it is going.** On longer tasks the agent keeps a short plan, pinned above the steps, and ticks steps off as it goes. A note from you changes its course; it then updates the plan. Set supervision to **Plan first** and it shows you the plan before it changes anything.
- **It doesn't go round in circles.** If the agent sends the same code or file actions a third time in a row, that step isn't run and the agent is told why; a fourth pauses the run for you. The same goes for small variations that keep failing with the same error: on the third the agent is told to change course, on the fifth the run pauses.
- **Every step can be undone.** The workspace saves a checkpoint after each step, and you can rewind to any of them, or back to the start to rephrase the task.
- **It can't touch your machine.** Python runs as WebAssembly (Pyodide) in a Web Worker. The agent only sees the in-memory workspace where you put files.
- **Sessions go where you put them.** Export a whole session (conversation, steps, workspace, checkpoints) to one zip file and import it later to resume or review it. The app itself remembers nothing.

<div align="center">
  <img src="site/demo-app.webp" alt="The agent builds a small library-loans app from a written spec: it writes the package and the CLI with a nine-step plan pinned above the steps, ticks the plan off, fixes the CLI after three failed tries, and finishes with all eleven tests passing" width="880" />
  <p><i>A small app from a written spec. The plan remains pinned above the steps, and the agent checks it off as it goes.</i></p>
</div>

The agent acts through native tool calls (OpenAI `tools`) when the endpoint supports
them (llama.cpp with `--jinja`, Ollama models with tool support), and through
```` ```python ```` blocks and file tags in its reply with any other chat model. Settings →
**Actions** picks one explicitly; a server that refuses tool calls falls back on its own.

## What it can make

Packages like numpy, pandas and matplotlib load on demand from the pinned Pyodide CDN. The standard library works offline, except sqlite3, lzma and ssl, which Pyodide ships as separate packages from the same CDN.

Eleven pure-Python libraries that Pyodide leaves out ship inside the file:

| Format | Library |
|---|---|
| Excel | openpyxl, XlsxWriter |
| Word | python-docx |
| PowerPoint | python-pptx |
| OpenDocument | odfpy |
| Markdown and HTML | Markdown, markdownify |
| Tables, XML, QR codes | tabulate, xmltodict, qrcode |
| Charts | seaborn (with matplotlib from the CDN) |

Those that need no Pyodide package (openpyxl, XlsxWriter, odfpy, Markdown, tabulate,
xmltodict) work offline too.

## What leaves your machine

There is no telemetry: no analytics, crash reporting, or usage pings, and opening the standalone file makes no network request at all. Using it sends exactly this:

- **To the API Base URL you configured:** the conversation, including what the agent reads from your files and what its code prints, plus the API key. Before the first request, and again when the URL or model changes, the app also asks that server what it supports (`/models`, `/props`, `/api/show`), as does **Test Connection**.
- **To jsDelivr (`cdn.jsdelivr.net/pyodide/...`):** only if agent code pulls in a Pyodide package not built into the file, such as numpy or pandas. It's a simple download: jsDelivr sees your IP address and the package name, never the task or your files.

Agent code stays off the network on a best-effort basis: 17 known paths are tested and closed (DESIGN §10), yet it is a denylist, not a guarantee. Don't put secrets in the workspace that you couldn't afford to leak.

The unbuilt `src/index.html` additionally loads its libraries and the Inter font from
jsDelivr, cdnjs and Google Fonts on every page load, and fetches the Python core and
the bundled libraries from jsDelivr and PyPI; `dist/` has all of these inlined.

## Relationship to HermitUI

It keeps the same brand and philosophy: one HTML file, vanilla JS, no persistence, and any OpenAI-compatible endpoint. The code reuses a lot of HermitUI's tested parts (streaming, think-tag parsing, settings, error hints, and inline build machinery; the full list is in [DESIGN.md §9](DESIGN.md#9-reuse-map-from-hermitui)). It sits in its own folder with a separate `src/`, `build.py`, and `tests/`, and could merge back into HermitUI later as a build flavor or mode. Check [DESIGN.md §11](DESIGN.md#11-project-layout--merge-path).

## Documents

| Document | What's in it |
|---|---|
| [DESIGN.md](DESIGN.md) | The full design: supervision model, session import/export, architecture, agent loop, security, packaging |
| [ROADMAP.md](ROADMAP.md) | Phases with checklists and exit criteria, from the first spike to the merge decision |
| [PHASE0_FINDINGS.md](PHASE0_FINDINGS.md) | What the Phase 0 spike measured: offline boot, kill & re-seed, network blocking, GitHub Pages |
| [PHASE3_5_LIBRARY_STUDY.md](PHASE3_5_LIBRARY_STUDY.md) | Which pure-Python libraries to bundle: cost, whether they work in Pyodide, and what the model reaches for |
| [AGENTS.md](AGENTS.md) | Rules for anyone (human or AI) working in this folder: build & test commands, a code map |
| [REVIEW_NOTES.md](REVIEW_NOTES.md) | Open decisions (MVP, Phases 2a, 2b, 3, 3.5, 3.6 and 3.7), waiting for a review |
| [tests/README.md](tests/README.md) | What the unit, end-to-end and real-model tests cover |
| [index.html](index.html) | The [project page](https://moooff.github.io/HermitUI/hermit-agent/), with the demo videos |
