"""
Headless drive of the USER API tab end-to-end through the actual tester UI.

  1. Load tester
  2. AUTH tab → quick OTP login → access_token in store
  3. USER API tab → POST /profile/complete → 201
  4. USER API tab → GET /me → 200, all 4 sections present
  5. USER API tab → PATCH /me/onboarding (block0_skin + complete) → no-rollback verified
  6. USER API tab → DELETE /me → 200 deleted=true
  7. USER API tab → GET /me again → 410 Gone
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
import urllib.request

from playwright.async_api import async_playwright


TESTER_URL = "http://localhost:8000/index.html"
AUTH_URL = "http://localhost:8001"


def login_for_token(phone: str) -> tuple[str, str]:
    """Use auth directly to mint an access_token (skip the dev_otp UI dance)."""
    dev_id = f"user-tab-{int(time.time())}"
    # OTP request
    body = json.dumps({"phone_number": phone, "device_id": dev_id, "platform": "web"}).encode()
    req = urllib.request.Request(
        f"{AUTH_URL}/v1/auth/otp/request",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    data = json.loads(urllib.request.urlopen(req).read())
    otp = data["dev_otp"]

    # OTP verify
    body = json.dumps({"phone_number": phone, "otp": otp, "device_id": dev_id, "platform": "web"}).encode()
    req = urllib.request.Request(
        f"{AUTH_URL}/v1/auth/otp/verify",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    verify = json.loads(urllib.request.urlopen(req).read())
    return verify["access_token"], verify["user"]["id"]


async def main() -> int:
    # Use a fresh phone so we don't collide with rate-limit / earlier users
    phone = f"+9477999{int(time.time()) % 1000000}"
    print(f"phone = {phone}")
    access_token, user_id = login_for_token(phone)
    print(f"got token for {user_id}")

    # Clear any prior profile for this user so the test is repeatable.
    # We don't have a delete-from-db endpoint; instead use a brand-new
    # phone (above) which auth's OTP verify will create a fresh user_id.

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()
        consoles = []
        page.on("console", lambda m: consoles.append((m.type, m.text)))
        page.on("pageerror", lambda e: consoles.append(("pageerror", str(e))))

        await page.goto(TESTER_URL, wait_until="networkidle")

        # Push the token into the store via JS so we don't drive the OTP UI
        await page.evaluate(
            """(args) => {
              const [tok, uid] = args;
              setToken('accessToken', tok);
              setToken('userId', uid);
            }""",
            [access_token, user_id],
        )

        # Switch to the USER API tab
        await page.locator("#tab-user").click()
        await asyncio.sleep(0.4)

        # The URL field should swap to localhost:8082
        api_url = await page.locator("#apiBaseUrl").input_value()
        print(f"api_url after switch: {api_url}")
        assert api_url == "http://localhost:8082", f"unexpected url: {api_url}"

        # 1. POST /profile/complete
        await page.locator("div.nav-item[onclick=\"showPanel('userProfileComplete')\"]").click()
        await asyncio.sleep(0.3)
        await page.locator("button[onclick=\"call('userProfileComplete')\"]").click()
        await asyncio.sleep(2)
        body = await page.locator("#res-userProfileComplete").text_content()
        print(f"profile/complete: {(body or '')[:200]}")
        assert "201" in (body or "") and "profile_complete" in (body or "")

        # 2. GET /me
        await page.locator("div.nav-item[onclick=\"showPanel('userMe')\"]").click()
        await asyncio.sleep(0.3)
        await page.locator("button[onclick=\"call('userMe')\"]").click()
        await asyncio.sleep(2)
        me = await page.locator("#res-userMe").text_content()
        print(f"GET /me first 200 chars: {(me or '')[:200]}")
        for key in ("profile", "preferences", "onboarding", "wallet"):
            assert key in (me or ""), f"missing {key} in GET /me"

        # 3. PATCH onboarding — set block0_skin true + complete
        await page.locator("div.nav-item[onclick=\"showPanel('userOnboardingPatch')\"]").click()
        await asyncio.sleep(0.3)
        await page.locator("#user-ob-block0_skin").check()
        await page.locator("#user-ob-block0_complete").check()
        await page.locator("button[onclick=\"call('userOnboardingPatch')\"]").click()
        await asyncio.sleep(2)
        ob = await page.locator("#res-userOnboardingPatch").text_content()
        print(f"PATCH onboarding: {(ob or '')[:200]}")
        assert '"block0_skin": true' in (ob or "")
        assert '"block0_complete": true' in (ob or "")

        # 4. DELETE /me
        await page.locator("div.nav-item[onclick=\"showPanel('userMeDelete')\"]").click()
        await asyncio.sleep(0.3)
        await page.locator("button[onclick=\"call('userMeDelete')\"]").click()
        await asyncio.sleep(2)
        deld = await page.locator("#res-userMeDelete").text_content()
        print(f"DELETE /me: {(deld or '')[:200]}")
        assert '"deleted": true' in (deld or "")

        # 5. GET /me again → 410
        await page.locator("div.nav-item[onclick=\"showPanel('userMe')\"]").click()
        await asyncio.sleep(0.3)
        await page.locator("button[onclick=\"call('userMe')\"]").click()
        await asyncio.sleep(2)
        me410 = await page.locator("#res-userMe").text_content()
        print(f"GET /me after delete: {(me410 or '')[:200]}")
        assert "410" in (me410 or "")

        await page.screenshot(path="/tmp/user_tab.png", full_page=False)
        print("screenshot: /tmp/user_tab.png")

        if consoles:
            errs = [c for c in consoles if c[0] in ("error", "pageerror")]
            if errs:
                print("\n--- browser errors ---")
                for t, m in errs[-5:]:
                    print(f"  [{t}] {m[:200]}")

        await b.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
