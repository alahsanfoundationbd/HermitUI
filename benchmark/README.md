# HermitUI Model Benchmark

Races progressively larger GGUFs (Qwen3 and Gemma 4 families, plus gpt-oss-20b) through the **unmodified**
`dist/hermit-ui-wllama.html` and recommends the largest model your machine
runs at a usable speed. The harness drives the real app with Playwright
exactly like a user would — via the `#gguf=` link parameter and the app's own
buttons — so the numbers are what a real user gets. On top of raw speed, every
model answers the same 10 demo questions (`questions.json`) and all answers
are saved for you to judge quality yourself.

The app itself stays fully ephemeral: models are cached on *disk* by the
harness (in `models/`, gitignored) and served from localhost; the browser
never stores anything.

## The ladder

| Model | File | ~Size |
|---|---|---|
| Qwen3-0.6B | `Qwen3-0.6B-Q4_K_M.gguf` | 0.4 GB |
| Qwen3-1.7B | `Qwen3-1.7B-Q4_K_M.gguf` | 1.1 GB |
| Qwen3-4B | `Qwen3-4B-Q4_K_M.gguf` | 2.5 GB |
| Qwen3-8B | `Qwen3-8B-Q4_K_M.gguf` | 4.8 GB |
| Gemma-4-E2B | `gemma-4-E2B-it-Q4_K_M.gguf` | 3.0 GB |
| Gemma-4-E4B | `gemma-4-E4B-it-Q4_K_M.gguf` | 4.7 GB |
| Gemma-4-12B | `gemma-4-12b-it-Q4_K_M.gguf` | 7.1 GB |
| gpt-oss-20b | `gpt-oss-20b-MXFP4.gguf` | 12.1 GB |

The rungs above ~4 GB (Qwen3-8B, Gemma-4-E4B, Gemma-4-12B, gpt-oss-20b) exceed the classic
wasm32 address space and need a browser with WASM Memory64 (current
Chrome/Edge); where it's missing they fail to load and that failure is the
device's recorded ceiling. A too-slow or failed rung only skips the *rest of its own
family* — the other families still get their turn.

## Setup

```bash
cd benchmark
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
python3 download_models.py     # one-time ~36 GB, resumable, skips existing
```

## Run

```bash
.venv/bin/python run_benchmark.py            # CPU (headless Chromium)
.venv/bin/python run_benchmark.py --gpu      # real WebGPU via Windows Edge (WSL2)
.venv/bin/python run_benchmark.py --both     # CPU run, then GPU run
.venv/bin/python run_benchmark.py --models 0.6B,1.7B --threshold 8
```

Notes:
- **GPU mode is for WSL2 setups**: headless Chromium inside WSL only gets
  SwiftShader (software) WebGPU, so `--gpu` launches Windows Edge
  (`--headless=new --enable-unsafe-webgpu`) via interop and connects over CDP.
  Mirrored networking makes localhost work in both directions.
- **`--gpu` refuses to start on a busy GPU.** `nvidia-smi` is checked first and
  the run aborts if more than 1500 MiB of VRAM is already resident, listing the
  processes responsible. Pass `--allow-busy-gpu` to override; the run is then
  flagged as contended in `run.json` and carries a warning banner in
  `review.md`. This exists because VRAM pressure does **not** prevent a model
  from loading — Memory64 keeps the weights in the WASM heap — so a contended
  run finishes normally and quietly reports tok/s that can be off by 20× or
  more. Close games and other LLM runtimes before benchmarking.
- A model is stopped early when it averages below the threshold (default
  5 tok/s) after two questions; larger rungs are then skipped.
- Answers use the app's default sampling settings (temperature 0.7), i.e.
  exactly what a user gets — expect some run-to-run variation.
- For models with a `/no_think` soft switch (`"nothink"` in the ladder, i.e.
  Qwen3) all questions carry it except `reasoning-1`, which runs with thinking
  enabled to exercise HermitUI's `<think>` rendering. Gemma has no such
  switch, so its prompts are sent verbatim.

## Prompt-cache probe (API backend)

`prompt_cache_probe.py` is a separate, much smaller tool: it checks whether a local
OpenAI-compatible server (llama.cpp, LM Studio, Ollama) actually reuses its KV cache
across a HermitUI conversation. It replays the app's payload shape — append-only
history, a `<file>` attachment baked into one turn — and prints how many prompt
tokens the server had to evaluate per turn.

```bash
llama-server -m models/Qwen3-8B-Q4_K_M.gguf -c 8192 -np 1 -ngl 99 --slots
python3 prompt_cache_probe.py --url http://127.0.0.1:8081/v1
```

Stdlib only, no venv. It needs `timings.prompt_n` in the response to be precise
(llama.cpp reports it); otherwise fall back to reading `prompt_ms`/wall time, which
stays flat on a hit and grows with the prompt on a miss.

Measured on the dev machine (Qwen3-8B-Q4_K_M, llama-server b10068, GPU, 2026-07-23):
a 3k-token attachment costs 2914 evaluated tokens on its own turn and **13–16** on
every following turn (795 ms → 33 ms prompt time). Switching persona mid-chat rewrites
`messages[0]` and re-evaluates 3021 of 3027 — the one thing that reliably throws the
cache away. A one-off summarize request does *not*: llama.cpp restores the
conversation's prefix from its host-RAM prompt cache afterwards.

## Results

Each run writes `results/<timestamp>-<backend>/`:
- `review.md` — speed summary table, the recommendation (with a ready-to-share
  `#gguf=` link), then every question with each model's answer side by side
  (+ TTFT and tok/s per answer) for human judging.
- `run.json` — the full raw data.

`models/`, `results/` and `.venv/` are gitignored.

## Reference results

Dev machine (16 threads, RTX 5070 Ti), July 2026, wllama 3.5.1; not yet re-measured
on the current pin (`WLLAMA_CDN_BASE` in `src/script.js`). "App" tok/s is what HermitUI
displays, prompt processing included; "decode" is the harness's rate after the first
token. Figures are per-model averages; the harness has no warm-up step, so each model's
first question runs cold.

- **Qwen3:** CPU → 0.6B ≈ 15 t/s, 1.7B ≈ 10, 4B ≈ 3 (recommendation 1.7B). GPU →
  0.6B ≈ 68, 1.7B ≈ 63, 4B ≈ 47 (recommendation 4B).
- **Gemma 4:** wllama's prompt processing is much slower than for Qwen3, so TTFT
  dominates and app tok/s craters even though decode is fast. E2B: ~40 s TTFT on CPU,
  ~10 s on GPU; GPU ≈ 39 t/s decode but ≈ 6 app. E4B on GPU: ≈ 30 t/s decode at ~11 s
  average TTFT, so app tok/s hovers around the 5 t/s threshold (an early-stopped
  standard run scored it too slow at 4.6; a full 10-question run averaged 6.3, all
  answers correct). 12B (7.1 GB, via Memory64) decodes at ≈ 33 t/s on GPU, slightly
  *faster* than E4B, because the E-series per-layer embeddings cost wllama more than
  dense size does; ~14 s average TTFT puts it at ≈ 4.2 app, all answers correct.
  CPU → no Gemma rung usable. GPU → recommendation E2B, with E4B borderline for those
  who tolerate the initial wait. Gemma is a worse fit for wllama than Qwen3 until prompt
  processing gets faster.
- **gpt-oss-20b** (MXFP4, `ggml-org/gpt-oss-20b-GGUF`, 4 clean GPU runs): 12.1 GB loads
  reliably in ≈ 78–84 s and decodes at ≈ 43 t/s, faster than dense Gemma-4-12B since
  only ~3.6B parameters are active per token. App ≈ 15 t/s at ≈ 3.4 s average TTFT. The
  gap is wider than for other models because its hidden reasoning trace adds time to
  the app's denominator but no tokens (a correct 31-character logic answer read 2.9 t/s
  app vs 40.5 decode). The average hides uneven TTFT: 1.4–3.9 s on the knowledge,
  reasoning, code and German questions, several seconds more on the two writing
  prompts, while decode stays flat at 41–43 t/s. Prompt length moves TTFT far more than
  throughput. Answers were correct throughout.
- **Why `--gpu` refuses a busy GPU:** the first gpt-oss-20b pass ran while a game held
  ~11 GB of the 16 GB card. It read 1.9 t/s decode and 39 s TTFT, 23× below the same
  build on a free GPU, and looked like an MXFP4 kernel problem.
