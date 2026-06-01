"""
Headless drive of the OBS /logs/query panel — FRONTEND verification.

Drives the tester UI through:
  1. AUTH tab → OTP login → access_token in store
  2. OBS tab → POST a marked event
  3. OBS → Internal JWT panel → paste a hand-minted internal token
  4. OBS → /logs/query → FETCH LOGS
  5. Verify the panel rendered a 200 with a filter string + entries box

Works against obs in local mode too — the endpoint returns 200 with
an empty entries array and a "(local mode — no GCP client)" filter
hint. That still proves the tester wiring is correct.

For end-to-end against real GCP Cloud Logging, use
scripts/smoke_test_logs_query.py instead (needs fresh ADC).
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from playwright.async_api import async_playwright


TESTER_URL = "http://localhost:8000/index.html"


def gen_keypair() -> tuple[str, str]:
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    pub = k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return priv, pub


async def main() -> int:
    # We need to pass the INTERNAL keypair into the tester via the panel.
    # The matching public key must already be set in obs's INTERNAL_JWT_PUBLIC_KEY
    # env var when obs was booted (see the bash wrapper).
    int_priv = os.environ["INTERNAL_JWT_PRIV"]
    now = int(time.time())
    internal_token = jwt.encode(
        {"iss": "test", "sub": "svc-headless", "svc": "headless-tester", "aud": "lumina-internal", "exp": now + 600, "iat": now},
        int_priv, algorithm="RS256",
    )

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()

        consoles: list[dict] = []
        page.on("console", lambda m: consoles.append({"type": m.type, "text": m.text}))
        page.on("pageerror", lambda e: consoles.append({"type": "pageerror", "text": str(e)}))

        print(f"→ goto {TESTER_URL}")
        await page.goto(TESTER_URL, wait_until="networkidle")
        await asyncio.sleep(1)

        # ─── Auth tab: OTP login (dev_otp) ──────────────────────────
        phone = f"+9477999{int(time.time()) % 1000000}"
        print(f"→ AUTH tab: OTP login for {phone}")
        await page.locator("div.nav-item[onclick=\"showPanel('otpRequest')\"]").click()
        await page.locator("#otp-phone").fill(phone)
        await page.locator("button[onclick=\"call('otpRequest')\"]").click()
        await asyncio.sleep(2)
        # dev_otp auto-fills the verify panel
        await page.locator("div.nav-item[onclick=\"showPanel('otpVerify')\"]").click()
        await asyncio.sleep(0.3)
        await page.locator("button[onclick=\"call('otpVerify')\"]").click()
        await asyncio.sleep(2)
        access = await page.evaluate("store.accessToken")
        print(f"   access_token: {access[:40]}...")
        assert access, "no access token after OTP verify"

        # ─── OBS tab: POST a marked event ───────────────────────────
        marker = f"hlq-{int(time.time())}"
        print(f"→ OBS tab: POST event with marker={marker}")
        await page.locator("#tab-obs").click()
        await asyncio.sleep(0.3)
        await page.locator("div.nav-item[onclick=\"showPanel('obsEvents')\"]").click()
        await asyncio.sleep(0.3)
        # Build body in JS — easier than typing into textarea
        await page.evaluate(
            """(marker) => {
              const ulid = () => {
                const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
                let n = Date.now(), ts = '';
                for (let i = 0; i < 10; i++) { ts = A[n & 0x1f] + ts; n = Math.floor(n / 32); }
                let r = '';
                for (let i = 0; i < 16; i++) r += A[Math.floor(Math.random() * 32)];
                return ts + r;
              };
              const body = {events: [{
                event_id: ulid(),
                user_id: store.userId || 'usr_' + ulid(),
                session_id: 'ses_' + ulid(),
                timestamp: new Date().toISOString(),
                schema_version: '1.0',
                event_type: 'session.question_viewed',
                properties: {question_id: 'Q_LOG_READER_HLQ', marker: marker},
                context: {platform: 'web', app_version: '1.0.0'},
              }]};
              document.getElementById('obs-events-body').value = JSON.stringify(body, null, 2);
            }""",
            marker,
        )
        await page.locator("button[onclick=\"call('obsEvents')\"]").click()
        await asyncio.sleep(2)
        evt_status = await page.locator("#res-obsEvents").text_content()
        print(f"   POST /events response: {(evt_status or '')[:120]}")

        # ─── In local mode there's no GCP fanout — skip the wait.
        # In cloud mode the smoke_test_logs_query.py covers it properly.
        await asyncio.sleep(1)

        # ─── Internal JWT panel: paste the token ────────────────────
        print("→ OBS: paste internal JWT")
        await page.locator("div.nav-item[onclick=\"showPanel('obsInternalConfig')\"]").click()
        await asyncio.sleep(0.3)
        await page.locator("#obs-internal-jwt").fill(internal_token)
        await page.locator("button[onclick='saveInternalJwt()']").click()
        await asyncio.sleep(0.3)

        # ─── /logs/query panel ──────────────────────────────────────
        print("→ OBS: /logs/query")
        await page.locator("div.nav-item[onclick=\"showPanel('obsLogsQuery')\"]").click()
        await asyncio.sleep(0.3)
        # Defaults are events, 1h — fine
        await page.locator("#obs-lq-eventType").fill("session.question_viewed")
        await page.locator("button[onclick=\"call('obsLogsQuery')\"]").click()
        await asyncio.sleep(3)

        # Capture rendered output
        filter_str = await page.locator("#res-obsLogsQuery-filter").text_content()
        entries_html = await page.locator("#res-obsLogsQuery").inner_html()
        summary = await page.locator("#obs-lq-summary").text_content()

        print(f"\n   filter:  {filter_str[:200]}")
        print(f"   summary: {summary}")

        await page.screenshot(path="/tmp/logs_query_panel.png", full_page=False)
        print("   screenshot: /tmp/logs_query_panel.png")

        # FRONTEND assertions:
        #   - The 2xx badge is rendered in the entries box (the renderer
        #     stamps it there on every successful response)
        #   - A filter string was rendered (either real GCP filter or
        #     the local-mode hint)
        #   - The summary line was populated
        if "http-2xx" not in entries_html:
            print(f"\n✗ Non-2xx response — entries html: {entries_html[:300]}")
            for c in consoles[-10:]:
                print(f"   [{c['type']}] {c['text']}")
            await browser.close()
            return 2

        if "lumina-events" not in filter_str and "local mode" not in filter_str:
            print(f"\n✗ Filter string looks wrong: {filter_str}")
            await browser.close()
            return 3

        if "entries" not in (summary or ""):
            print(f"\n✗ Summary line not populated: {summary!r}")
            await browser.close()
            return 4

        await browser.close()

        # If we're against real GCP, additionally check for the marker
        if "local mode" in filter_str:
            print("\n✓ Frontend works (obs is in local mode — no GCP read; that's expected).")
            print("  For real-GCP verification, use scripts/smoke_test_logs_query.py.")
        else:
            marker_found = marker in entries_html
            print(f"\n   marker '{marker}' found in entries: {marker_found}")
            if marker_found:
                print("✓ Frontend + real GCP read end-to-end.")
            else:
                print("✓ Frontend works (filter/format correct). Marker not found — "
                      "may need longer ingestion wait or no events ingested yet.")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
