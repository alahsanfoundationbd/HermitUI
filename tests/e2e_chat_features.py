#!/usr/bin/env python3
"""End-to-end test of the chat features borrowed from llama.cpp's web UI.

Covers what the unit tests can't reach because it lives in the DOM or the request flow:
the llama.cpp samplers reaching the payload only when set, earlier reasoning left out of
requests on demand, the 🧮 context gauge (window looked up from /props after the first
reply), and versions: edit and regenerate keep what they replace behind ‹ n/m ›, and a
regenerate stopped before its first token brings the previous reply back.

Runs against dist/hermit-ui-standalone.html in headless Chromium. `fetch` is stubbed:
each chat request answers "Reply N" (or window.__reply when set) with usage numbers, and
/props reports a 16384-token context.

Setup (reuses the benchmark harness's virtualenv):
    benchmark/.venv/bin/python -m playwright install chromium
Run:
    benchmark/.venv/bin/python tests/e2e_chat_features.py
"""
import pathlib
import sys

sys.stdout.reconfigure(line_buffering=True)
from playwright.sync_api import sync_playwright

REPO = pathlib.Path(__file__).resolve().parent.parent
APP = (REPO / "dist" / "hermit-ui-standalone.html").as_uri()

STUB = """
window.__n = 0;
window.__payloads = [];
window.__reply = null;   // fixed reply text instead of "Reply N"
window.__hang = false;   // next chat request streams nothing until aborted
window.fetch = async (url, opts) => {
  url = String(url);
  if (url.endsWith('/props')) {
    return new Response(JSON.stringify({ default_generation_settings: { n_ctx: 16384 } }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (!url.endsWith('/chat/completions')) return new Response('{}', { status: 404 });
  window.__payloads.push(JSON.parse(opts.body));
  const enc = new TextEncoder();
  if (window.__hang) {
    window.__hang = false;
    return new Response(new ReadableStream({ start(c) {
      opts.signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
    } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }
  const text = window.__reply || ('Reply ' + (++window.__n));
  const body = 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\\n\\n' +
               'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }],
                                           usage: { prompt_tokens: 3000, completion_tokens: 200 } }) + '\\n\\n' +
               'data: [DONE]\\n\\n';
  return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(body)); c.close(); } }),
                      { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};
"""

results = []


def check(name, cond, detail=""):
    results.append((bool(cond), name))
    print(("  PASS  " if cond else "  FAIL  ") + name + (("\n        " + str(detail)) if detail and not cond else ""))


def section(title):
    print(f"\n=== {title} ===")


def send(page, text):
    page.fill("#userInput", text)
    page.click("#sendBtn")
    page.wait_for_function("() => !document.getElementById('chatForm').classList.contains('is-generating')")
    page.wait_for_timeout(150)


def last_payload(page):
    return page.evaluate("window.__payloads[window.__payloads.length - 1]")


def history(page):
    """The active conversation as [role:text], system prompt left out."""
    return page.evaluate("""messages.filter(m => m.role !== 'system')
        .map(m => m.role[0] + ':' + (typeof m.content === 'string' ? m.content : '[parts]'))""")


def bubbles(page):
    return page.eval_on_selector_all(".msg-wrapper .msg-content", "e => e.map(x => x.innerText.trim())")


def navs(page):
    return page.eval_on_selector_all(".branch-nav", "e => e.map(x => x.innerText.replace(/\\s+/g, ''))")


def regenerate(page, nth):
    """Click 🔄 on the nth AI bubble (0-based)."""
    page.locator(".msg-wrapper.ai").nth(nth).hover()
    page.locator(".msg-wrapper.ai").nth(nth).locator(".action-btn", has_text="Regenerate").click()
    page.wait_for_function("() => !document.getElementById('chatForm').classList.contains('is-generating')")
    page.wait_for_timeout(150)


def open_settings(page):
    page.click("#settingsBtn")
    # <details> keeps its open state between visits, so a click could close it again.
    page.evaluate("document.querySelector('#settingTopK').closest('details').open = true")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.add_init_script(STUB)
        page.on("dialog", lambda d: d.accept())
        page.goto(APP)

        section("llama.cpp samplers are sent only when set")
        send(page, "hello")
        pl = last_payload(page)
        check("defaults: no top_k / min_p / repeat_penalty",
              not any(k in pl for k in ("top_k", "min_p", "repeat_penalty")), pl)
        open_settings(page)
        page.fill("#settingTopK", "40")
        page.fill("#settingMinP", "0.05")
        page.fill("#settingRepeatPenalty", "1.1")
        page.click("#settingsSave")
        send(page, "again")
        pl = last_payload(page)
        check("set values reach the payload",
              pl.get("top_k") == 40 and pl.get("min_p") == 0.05 and pl.get("repeat_penalty") == 1.1, pl)
        open_settings(page)
        check("the modal shows what is saved", page.input_value("#settingTopK") == "40")
        page.fill("#settingTopK", "")
        page.fill("#settingMinP", "")
        page.fill("#settingRepeatPenalty", "")
        page.click("#settingsSave")
        send(page, "cleared")
        pl = last_payload(page)
        check("cleared again: nothing sent", not any(k in pl for k in ("top_k", "min_p", "repeat_penalty")), pl)

        section("context gauge")
        check("visible once /props answered", page.is_visible("#ctxGauge"))
        check("last request against the window", page.inner_text("#ctxGaugeText") == "3.2k / 16k",
              page.inner_text("#ctxGaugeText"))
        page.click("#clearBtn")
        page.click("#newChatConfirmBtn")
        check("a new chat starts at zero", page.inner_text("#ctxGaugeText") == "0 / 16k", page.inner_text("#ctxGaugeText"))

        section("earlier reasoning left out on request")
        page.evaluate("window.__reply = '<think>secret plan</think>Visible answer.'")
        send(page, "one")
        send(page, "two")
        sent = [m["content"] for m in last_payload(page)["messages"] if m["role"] == "assistant"]
        check("by default the model gets its reasoning back", sent and "secret plan" in sent[0], sent)
        page.click("#settingsBtn")
        page.check("#settingDropReasoning")
        page.click("#settingsSave")
        send(page, "three")
        sent = [m["content"] for m in last_payload(page)["messages"] if m["role"] == "assistant"]
        check("with the option on it doesn't", sent and all("secret plan" not in s for s in sent), sent)
        check("…and the answer text still goes", all(s == "Visible answer." for s in sent), sent)
        check("history keeps the reasoning (bubbles, export)",
              page.evaluate("messages.some(m => m.role === 'assistant' && m.content.includes('secret plan'))"))
        page.evaluate("window.__reply = null")
        page.click("#clearBtn")
        page.click("#newChatConfirmBtn")

        section("regenerate keeps the previous reply")
        send(page, "Q1")
        first = history(page)
        regenerate(page, 0)
        check("new reply shown with 2/2", navs(page) == ["‹2/2›"], navs(page))
        page.click(".branch-nav button[aria-label='Previous version']")
        check("‹ brings the first reply back", history(page) == first, history(page))
        check("…shown as 1/2", navs(page) == ["‹1/2›"], navs(page))
        page.click(".branch-nav button[aria-label='Next version']")
        check("› goes forward again", history(page)[-1] != first[-1] and len(history(page)) == 2, history(page))

        section("edit keeps the original until sent, then keeps it as a version")
        before = history(page)
        page.locator(".msg-wrapper.user").first.hover()
        page.locator(".msg-wrapper.user .action-btn", has_text="Edit").first.click()
        check("edit notice shown", page.is_visible("#editNotice"))
        check("nothing removed yet", history(page) == before, history(page))
        page.click("#editCancelBtn")
        check("cancel hides the notice and clears the composer",
              not page.is_visible("#editNotice") and page.input_value("#userInput") == "")
        check("cancel leaves the chat alone", history(page) == before)
        page.locator(".msg-wrapper.user").first.hover()
        page.locator(".msg-wrapper.user .action-btn", has_text="Edit").first.click()
        page.fill("#userInput", "Q1 edited")
        page.click("#sendBtn")
        page.wait_for_function("() => !document.getElementById('chatForm').classList.contains('is-generating')")
        page.wait_for_timeout(150)
        edited = history(page)
        check("the edit replaced the tail", len(edited) == 2 and edited[0] == "u:Q1 edited", edited)
        check("the edited message shows 2/2", navs(page) == ["‹2/2›"], navs(page))
        page.click(".branch-nav button[aria-label='Previous version']")
        check("‹ restores the original message and its replies", history(page) == before, history(page))
        check("…including the reply's own versions", navs(page) == ["‹1/2›", "‹2/2›"], navs(page))
        page.click(".msg-wrapper.user .branch-nav button[aria-label='Next version']")
        check("› back to the edit", history(page) == edited, history(page))

        section("an older reply can be regenerated too")
        send(page, "Q2")
        check("four messages", len(history(page)) == 4, history(page))
        regenerate(page, 0)
        h = history(page)
        check("the later turn moved into the previous version", len(h) == 2 and h[0] == "u:Q1 edited", h)
        page.locator(".msg-wrapper.ai").first.locator(".branch-nav button[aria-label='Previous version']").click()
        check("…and comes back with it", len(history(page)) == 4 and history(page)[2] == "u:Q2", history(page))
        page.locator(".msg-wrapper.ai").first.locator(".branch-nav button[aria-label='Next version']").click()

        section("a regenerate stopped before its first token restores the previous reply")
        shown = history(page)
        n_before = page.evaluate("forks.get(messages[1].uid).versions.length")
        page.evaluate("window.__hang = true")
        page.locator(".msg-wrapper.ai").first.hover()
        page.locator(".msg-wrapper.ai").first.locator(".action-btn", has_text="Regenerate").click()
        page.wait_for_timeout(200)
        page.click("#stopBtn")
        page.wait_for_function("() => !document.getElementById('chatForm').classList.contains('is-generating')")
        page.wait_for_timeout(150)
        check("the reply on screen before is back", history(page) == shown, history(page))
        check("no empty version left behind",
              page.evaluate("forks.get(messages[1].uid).versions.length") == n_before)
        check("bubbles match the history", len(bubbles(page)) == len(history(page)), bubbles(page))

        browser.close()

    failed = [n for ok, n in results if not ok]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
