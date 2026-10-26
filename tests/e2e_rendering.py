#!/usr/bin/env python3
"""End-to-end rendering / hardening test against the real built app.

Covers the parts of the pipeline that touch the DOM and therefore cannot be reached by
the extract-and-evaluate unit tests: the Markdown → sanitize → math/diagram render path,
the DOMPurify hooks, and the confirmation and warning UI. Everything runs against
dist/hermit-ui-standalone.html in headless Chromium, driven through the app's own code.

Two assertions here are deliberately about *painted* output rather than DOM contents
(page.inner_text, not textContent): KaTeX always ships the original TeX in an
<annotation>, so its presence in the DOM proves nothing — what matters is that it never
reaches the screen.

Setup (reuses the benchmark harness's virtualenv):
    benchmark/.venv/bin/python -m playwright install chromium
Run:
    benchmark/.venv/bin/python tests/e2e_rendering.py
"""
import pathlib
import sys

sys.stdout.reconfigure(line_buffering=True)
from playwright.sync_api import sync_playwright

REPO = pathlib.Path(__file__).resolve().parent.parent
APP = (REPO / "dist" / "hermit-ui-standalone.html").as_uri()

# Smallest valid GIF, as a data: URL — stands in for a locally-attached image.
TINY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

# Render arbitrary model output through the app's real final-render path and report both
# the resulting markup and what the browser actually paints.
RENDER = """(md) => {
    const h = document.createElement('div');
    document.getElementById('chatbox').appendChild(h);
    const ctx = { fullRawText: md, aiReasoning: "", startTime: Date.now(), responseContainer: h };
    updateMessageUI(ctx, true);
    return { html: h.innerHTML, shown: h.innerText };
}"""

results = []


def check(name, cond, detail=""):
    results.append((bool(cond), name))
    print(("  PASS  " if cond else "  FAIL  ") + name + (("\n        " + str(detail)) if detail and not cond else ""))


def section(title):
    print(f"\n=== {title} ===")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("dialog", lambda d: d.accept())  # beforeunload guard
        page.goto(APP)
        render = lambda md: page.evaluate(RENDER, md)

        section("math renders without leaking its LaTeX source")
        r = render("Einstein: $E=mc^2$ done.")
        check("<math> survives sanitizing", "<math" in r["html"], r["html"][:160])
        # <semantics>/<annotation> are not in DOMPurify's default allowlist and not in
        # FORBID_CONTENTS either, so without AI_SANITIZE they are unwrapped and the TeX
        # ends up as a bare text node directly inside <math> — out of spec, and rendered
        # or not at each browser's discretion.
        check("annotation kept inside <semantics>",
              "<semantics>" in r["html"] and 'encoding="application/x-tex"' in r["html"], r["html"][:200])
        check("TeX source is never painted", "E=mc^2" not in r["shown"], repr(r["shown"]))
        r = render("$$\\int_0^1 x^2\\,dx$$")
        check("display math renders", "<math" in r["html"])
        check("display math paints no TeX", "\\int" not in r["shown"], repr(r["shown"]))

        section("remote images are held back, local data: URLs are not")
        r = render("![beacon](https://tracker.example.com/p.png?d=secret)")
        check("no src attribute on the remote image",
              'data-blocked-src="https://tracker' in r["html"] and ' src="https://' not in r["html"],
              r["html"][:200])
        check("click-to-load button rendered", "blocked-image-btn" in r["html"])
        r = render(f"![ok]({TINY_GIF})")
        check("locally-attached data: image passes through",
              "data-blocked-src" not in r["html"] and 'src="data:image' in r["html"], r["html"][:200])
        check("a held-back image loads when the user asks", page.evaluate("""() => {
            document.querySelector('.blocked-image-btn').click();
            const i = document.querySelector('img[data-blocked-src]');
            return !!(i && i.getAttribute('src'));
        }"""))

        section("links, trailing '<', truncation notice")
        r = render("[docs](https://example.com)")
        check("links open in a new tab, hardened",
              'target="_blank"' in r["html"] and "noopener" in r["html"] and "noreferrer" in r["html"],
              r["html"][:200])
        # The streaming parser holds back a trailing tag prefix so a half-arrived <think>
        # never flashes as literal text; on the final render there is nothing left to
        # arrive and a real "<" has to survive.
        r = render("compare a < b and then <")
        check("trailing '<' survives the final render", r["shown"].rstrip().endswith("<"), repr(r["shown"]))
        shown = page.evaluate("""() => {
            const h = document.createElement('div');
            document.getElementById('chatbox').appendChild(h);
            const ctx = { fullRawText: "partial", aiReasoning: "", startTime: Date.now(),
                          responseContainer: h, finishReason: "length" };
            updateMessageUI(ctx, true);
            return h.innerText;
        }""")
        check("a max-tokens cutoff is announced", "Cut off at the max-tokens limit" in shown, repr(shown))

        section("text direction follows the script, code stays LTR")
        # Asserted on the computed direction, not the attribute: dir="auto" only proves
        # anything once the browser has resolved it.
        dirs = page.evaluate("""(md) => {
            const h = document.createElement('div');
            document.getElementById('chatbox').appendChild(h);
            updateMessageUI({ fullRawText: md, aiReasoning: "", startTime: Date.now(), responseContainer: h }, true);
            const d = (sel) => getComputedStyle(h.querySelector(sel)).direction;
            return { p: d('p'), ol: d('ol'), li2: d('ol li:nth-child(2)'), en: d('ul'),
                     lead: d('p:nth-of-type(2)'), pre: d('pre'), code: d('p code') };
        }""", "سلام دنیا، این یک **پاسخ** است.\n\n`npm` را نصب کنید.\n\n"
              "1. مورد اول\n2. second item in English\n\n- plain English list\n\n```js\nlet x = 1;\n```")
        check("Persian paragraph is RTL", dirs["p"] == "rtl", dirs)
        check("Persian list is RTL, markers on the right", dirs["ol"] == "rtl", dirs)
        check("a Latin item inherits its list's direction", dirs["li2"] == "rtl", dirs)
        check("English list stays LTR", dirs["en"] == "ltr", dirs)
        check("leading inline code doesn't flip a Persian paragraph", dirs["lead"] == "rtl", dirs)
        check("code block stays LTR", dirs["pre"] == "ltr", dirs)
        check("inline code stays LTR", dirs["code"] == "ltr", dirs)
        page.fill("#userInput", "سلام")
        check("composer follows the typed script",
              page.evaluate("getComputedStyle(document.getElementById('userInput')).direction") == "rtl")
        page.fill("#userInput", "")

        section("an invalid diagram degrades to a code block")
        r = render("```mermaid\nnot a real diagram {{{\n```")
        page.wait_for_timeout(500)
        check("invalid mermaid stays a code block", "<pre" in r["html"], r["html"][:160])

        section("```svg blocks render as an image, sanitized, with the source one click away")
        r = render("```svg\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"20\" onload=\"alert(1)\">"
                   "<rect width=\"40\" height=\"20\" fill=\"red\"/><script>alert(2)</script></svg>\n```")
        page.wait_for_timeout(300)
        img = page.evaluate("""() => { const i = [...document.querySelectorAll('img.svg-image')].pop();
            return i && { src: decodeURIComponent(i.src), w: i.naturalWidth }; }""")
        check("rendered as an <img>", img is not None, r["html"][:200])
        check("…that actually draws", img and img["w"] == 40, img)
        check("script and event handler sanitized away",
              img and "<script" not in img["src"] and "onload" not in img["src"], img)
        check("source kept, hidden", page.evaluate("""() => { const b = [...document.querySelectorAll('.diagram-block')].pop();
            return !!b.querySelector('pre') && getComputedStyle(b.querySelector('pre')).display === 'none'; }"""))
        shown = page.evaluate("""() => { const b = [...document.querySelectorAll('.diagram-block')].pop();
            b.querySelector('.diagram-toggle').click();
            return { pre: getComputedStyle(b.querySelector('pre')).display, img: getComputedStyle(b.querySelector('.svg-diagram')).display }; }""")
        check("the toggle swaps image and source", shown == {"pre": "block", "img": "none"}, shown)
        r = render("```svg\nnot an svg at all\n```")
        check("non-SVG content stays a code block", "<pre" in r["html"] and "svg-image" not in r["html"], r["html"][:160])
        r = render("```mermaid\ngraph TD; A-->B\n```")
        page.wait_for_timeout(1500)
        check("a mermaid diagram gets the same source toggle",
              page.evaluate("!![...document.querySelectorAll('.diagram-block')].pop().querySelector('.mermaid-diagram')"))

        section("New Chat asks before discarding, and clears the composer")
        page.fill("#userInput", "draft")
        page.evaluate("messages.push({role:'user', content:'hi', uid:999})")
        page.click("#clearBtn")
        check("confirmation shown for a non-empty chat", page.is_visible("#newChatConfirmModal"))
        page.click("#newChatCancelBtn")
        check("cancel keeps the draft", page.input_value("#userInput") == "draft")
        page.click("#clearBtn")
        page.click("#newChatConfirmBtn")
        check("confirm clears the composer", page.input_value("#userInput") == "")
        check("confirm resets the history",
              page.evaluate("messages.filter(m => m.role !== 'system').length") == 0)

        section("the privacy banner triggers on any non-local endpoint")
        page.click("#settingsBtn")
        for url, warn, label in [
            ("https://api.some-unlisted-provider.io/v1", True, "api.some-unlisted-provider.io"),
            ("https://api.openai.com/v1", True, "openai.com"),
            ("http://192.168.1.50:8080/v1", False, None),
            ("http://localhost:1234/v1", False, None),
        ]:
            page.fill("#settingUrl", url)
            page.dispatch_event("#settingUrl", "input")
            check(f"{'warns' if warn else 'silent'}: {url}", page.is_visible("#cloudWarning") == warn)
            if label:
                check(f"labelled {label}", page.inner_text("#cloudWarningTarget") == label)

        browser.close()

    failed = [n for ok, n in results if not ok]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
