"""
Headless test for the Google exchange path.

Stubs firebase.auth().signInWithPopup() to return a fake user (so we
don't need real Google credentials), then clicks SIGN IN WITH GOOGLE
on the OBS Quick Login panel and captures what happens with the
subsequent /v1/auth/firebase/exchange call.

We don't expect the exchange to succeed (the fake Firebase token is
gibberish — Firebase Admin will reject it server-side), but we DO
expect the call to actually reach the auth service. If it returns
HTTP 0, that's the bug we're hunting.
"""
from __future__ import annotations

import asyncio
import json
import sys
from playwright.async_api import async_playwright


TESTER_URL = "http://localhost:8000/index.html"


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()

        requests, consoles = [], []
        page.on("request", lambda r: requests.append({"method": r.method, "url": r.url}))
        page.on(
            "response",
            lambda r: requests.append({"_resp": True, "status": r.status, "url": r.url}),
        )
        page.on("requestfailed", lambda r: requests.append({"_fail": True, "url": r.url, "reason": r.failure}))
        page.on("console", lambda m: consoles.append({"type": m.type, "text": m.text}))
        page.on("pageerror", lambda e: consoles.append({"type": "pageerror", "text": str(e)}))

        print(f"→ goto {TESTER_URL}")
        await page.goto(TESTER_URL, wait_until="networkidle")
        await asyncio.sleep(1)

        # Stub Firebase signInWithPopup to return a fake user.
        print("→ stubbing firebase.auth().signInWithPopup → fake user")
        await page.evaluate(
            """() => {
              if (typeof firebase === 'undefined' || !firebase.auth) {
                console.error('Firebase SDK not loaded');
                return;
              }
              const original = firebase.auth().signInWithPopup;
              firebase.auth().signInWithPopup = async function(provider) {
                console.log('STUB: signInWithPopup called');
                return {
                  user: {
                    email: 'tester@example.com',
                    displayName: 'Headless Tester',
                    getIdToken: async () => 'fake-firebase-id-token-' + Date.now(),
                  },
                };
              };
              window.__firebase_stubbed = true;
            }"""
        )
        stubbed = await page.evaluate("window.__firebase_stubbed")
        print(f"   stubbed = {stubbed}")

        print("→ switch to OBSERVABILITY tab")
        await page.locator("#tab-obs").click()
        await asyncio.sleep(0.5)

        print("→ open Quick Login panel")
        await page.locator("text=Quick login").first.click()
        await asyncio.sleep(0.5)

        # Confirm we know the auth URL the panel will use
        auth_url_field = await page.locator("#obs-auth-url").input_value()
        print(f"   #obs-auth-url field = {auth_url_field!r}")

        print("→ click SIGN IN WITH GOOGLE (obs Quick Login button)")
        before_n = len(requests)
        # Disambiguate from the AUTH-tab Google button.
        await page.locator("button[onclick='obsQuickGoogle()']").click()
        await asyncio.sleep(3)

        print("\n--- network activity after click ---")
        for r in requests[before_n:]:
            if r.get("_resp"):
                print(f"  ← {r['status']:>3}  {r['url']}")
            elif r.get("_fail"):
                print(f"  ✗ FAIL  {r['url']}  reason={r['reason']}")
            else:
                print(f"  → {r['method']:>6} {r['url']}")

        res_text = await page.locator("#res-obsQuickLogin").text_content()
        step1 = await page.locator("#obs-login-step1-status").text_content()
        print(f"\nstep1  = {step1!r}")
        print(f"result = {(res_text or '')[:400]!r}")

        # Compare with the AUTH tab — switch over and do the same flow
        print("\n--- comparison: AUTH tab Google flow ---")
        await page.locator("#tab-auth").click()
        await asyncio.sleep(0.5)
        await page.locator("text=Google Login").first.click()
        await asyncio.sleep(0.5)

        before_n = len(requests)
        # The AUTH tab Google panel has a "Sign in with Google" button —
        # if its onclick stubbed similarly, it'd just put the fake fb
        # token in the exchange field. We need to invoke the exchange.
        # Easier: directly trigger the exchange via the SETS TOKENS button
        # after putting the fake token in the field.
        await page.evaluate(
            """() => {
              // Stuff the fake firebase token where the exchange panel reads it
              document.getElementById('exchange-token').value = 'fake-firebase-id-token-direct-test';
            }"""
        )
        await page.locator("text=Firebase Exchange").first.click()
        await asyncio.sleep(0.3)
        # Find and click the exchange button
        try:
            await page.evaluate("call('fbExchange')")
        except Exception as e:
            print(f"   (couldn't trigger fbExchange directly: {e})")
        await asyncio.sleep(3)

        print("\n--- network activity after AUTH-tab exchange ---")
        for r in requests[before_n:]:
            if r.get("_resp"):
                print(f"  ← {r['status']:>3}  {r['url']}")
            elif r.get("_fail"):
                print(f"  ✗ FAIL  {r['url']}  reason={r['reason']}")
            else:
                print(f"  → {r['method']:>6} {r['url']}")

        auth_res = await page.locator("#res-fbExchange").text_content()
        print(f"\nauth-tab exchange result = {(auth_res or '')[:300]!r}")

        print("\n--- CONSOLE ---")
        for c in consoles[-15:]:
            print(f"  [{c['type']}] {c['text']}")

        await browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
