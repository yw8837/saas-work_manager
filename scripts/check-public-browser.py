"""Read-only browser smoke. Does not sign in, submit forms, or change user data."""
import argparse
import json
from playwright.sync_api import sync_playwright, expect


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("origin")
    args = parser.parse_args()
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width, height in [(1440, 900), (390, 844)]:
                context = browser.new_context(viewport={"width": width, "height": height})
                try:
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    for path in ["/", "/today", "/privacy", "/terms"]:
                        response = page.goto(args.origin.rstrip("/") + path, wait_until="networkidle")
                        assert response.status == 200, (path, response.status)
                        expect(page.get_by_role("heading").first).to_be_visible()
                        if path == "/today":
                            expect(page.get_by_role("button", name="Google로 계속하기")).to_be_visible()
                            assert page.locator('input[type="password"]').count() == 0
                        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), path
                        assert not errors, errors
                        results.append({"path": path, "width": width, "status": "PASS"})
                finally:
                    context.close()
        finally:
            browser.close()
    print(json.dumps({"checks": results, "total": len(results), "real_google_login_tested": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
