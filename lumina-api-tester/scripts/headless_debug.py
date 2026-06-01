"""
Headless-browser debugger for the api-tester.

Boots playwright Chromium, opens http://localhost:8000/index.html,
switches to the OBSERVABILITY tab, clicks Quick login, and tries the
OTP request. Captures:
  - Every request URL + status
  - Every console message
  - The final state of the response box

Assumes:
  - tester served at  http://localhost:8000   (python -m http.server 8000)
  - auth   running at http://localhost:8001
  - obs    running at http://localhost:8081

Run:
    .venv/bin/python scripts/headless_debug.py
"""
from __future__ import annotations

import asyncio
import sys
from playwright.async_api import async_playwright


TESTER_URL = "http://localhost:8000/index.html"


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Match a typical laptop viewport so the scroll issue can repro.
        # MacBook 13" with Chrome chrome + bookmarks bar leaves ~720px tall.
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()

        requests: list[dict] = []
        consoles: list[dict] = []

        page.on("request", lambda r: requests.append({"method": r.method, "url": r.url}))
        page.on("response", lambda r: requests.append({"_resp": True, "status": r.status, "url": r.url}))
        page.on("console", lambda m: consoles.append({"type": m.type, "text": m.text}))
        page.on("pageerror", lambda e: consoles.append({"type": "pageerror", "text": str(e)}))

        print(f"→ goto {TESTER_URL}")
        await page.goto(TESTER_URL, wait_until="networkidle")
        await asyncio.sleep(1)

        print("→ switch to OBSERVABILITY tab")
        await page.locator("#tab-obs").click()
        await asyncio.sleep(0.5)

        print("→ open Quick Login panel")
        await page.locator("text=Quick login").first.click()
        await asyncio.sleep(0.5)

        # Take a screenshot of the current state — verifies scroll layout
        await page.screenshot(path="/tmp/quicklogin_initial.png", full_page=False)
        layout = await page.evaluate("""() => {
          const b = document.body;
          const m = document.querySelector('main');
          const p = document.querySelector('#panel-obsQuickLogin');
          const cs = (el) => el && getComputedStyle(el);
          return {
            window:  {w: innerWidth, h: innerHeight},
            body:    {scrollH: b.scrollHeight, clientH: b.clientHeight, overflowY: cs(b).overflowY},
            main:    {scrollH: m.scrollHeight, clientH: m.clientHeight, overflowY: cs(m).overflowY, scrollTop: m.scrollTop},
            panel:   p ? {scrollH: p.scrollHeight, clientH: p.clientHeight, overflowY: cs(p).overflowY, visible: p.classList.contains('visible')} : null,
            response_box_in_viewport: (() => {
              const el = document.querySelector('#res-obsQuickLogin');
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return {top: Math.round(r.top), bottom: Math.round(r.bottom), inViewport: r.bottom <= innerHeight && r.top >= 0};
            })(),
          };
        }""")
        import json
        print("   layout:", json.dumps(layout, indent=2))

        # Try to scroll main down — does anything happen?
        before_scroll = await page.evaluate("document.querySelector('main').scrollTop")
        await page.evaluate("document.querySelector('main').scrollTop = 9999")
        after_scroll = await page.evaluate("document.querySelector('main').scrollTop")
        print(f"   scroll attempt: before={before_scroll} after={after_scroll}  (if equal, can't scroll)")

        # Resolve what the panel thinks the auth URL is
        auth_url_field = await page.locator("#obs-auth-url").input_value()
        api_base = await page.locator("#apiBaseUrl").input_value()
        print(f"   #obs-auth-url field = {auth_url_field!r}")
        print(f"   #apiBaseUrl  field = {api_base!r}")

        # Make sure the obs-login-phone field reflects our default
        phone_field = await page.locator("#obs-login-phone").input_value()
        print(f"   #obs-login-phone   = {phone_field!r}")

        print("→ click TEST CONNECTION")
        before_n = len(requests)
        await page.locator("text=TEST CONNECTION").click()
        await asyncio.sleep(2)
        new_reqs = requests[before_n:]
        for r in new_reqs:
            if r.get("_resp"):
                print(f"     ← {r['status']}  {r['url']}")
            else:
                print(f"     → {r['method']} {r['url']}")
        conn_status = await page.locator("#obs-auth-conn-status").text_content()
        print(f"   status = {conn_status!r}")

        print("→ click SEND OTP")
        before_n = len(requests)
        await page.locator("text=SEND OTP").click()
        await asyncio.sleep(3)
        new_reqs = requests[before_n:]
        for r in new_reqs:
            if r.get("_resp"):
                print(f"     ← {r['status']}  {r['url']}")
            else:
                print(f"     → {r['method']} {r['url']}")
        res_text = await page.locator("#res-obsQuickLogin").text_content()
        step1 = await page.locator("#obs-login-step1-status").text_content()
        print(f"   step1 = {step1!r}")
        print(f"   response box = {(res_text or '')[:300]!r}")

        await page.screenshot(path="/tmp/quicklogin_after_send.png", full_page=False)

        # Full page screenshot — to inspect scroll layout end-to-end
        await page.screenshot(path="/tmp/quicklogin_full.png", full_page=True)

        print("\n--- CONSOLE MESSAGES ---")
        for c in consoles[-20:]:
            print(f"   [{c['type']}] {c['text']}")

        await browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
