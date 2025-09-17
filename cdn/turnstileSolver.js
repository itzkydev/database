const { chromium, firefox } = require('playwright');

class TurnstileResult {
  constructor(turnstile_value, elapsed_time_seconds, status, reason = null) {
    this.turnstile_value = turnstile_value;
    this.elapsed_time_seconds = elapsed_time_seconds;
    this.status = status;
    this.reason = reason;
  }
}

class AsyncTurnstileSolver {
  constructor({ debug = false, headless = true, userAgent = null, browserType = "chromium" } = {}) {
    this.debug = debug;
    this.headless = headless;
    this.userAgent = userAgent;
    this.browserType = browserType;
    this.HTML_TEMPLATE = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Turnstile Solver</title>
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>
      </head>
      <body>
          <!-- cf turnstile -->
      </body>
      </html>
    `;
  }

  async _setupPage(browser, url, sitekey, action = null, cdata = null) {
    const context = await browser.newContext(
      this.userAgent ? { userAgent: this.userAgent } : {}
    );
    const page = await context.newPage();

    const urlWithSlash = url.endsWith("/") ? url : url + "/";
    const turnstileDiv = `<div class="cf-turnstile" data-sitekey="${sitekey}"` +
      (action ? ` data-action="${action}"` : "") +
      (cdata ? ` data-cdata="${cdata}"` : "") +
      `></div>`;

    const pageData = this.HTML_TEMPLATE.replace("<!-- cf turnstile -->", turnstileDiv);

    await page.route(urlWithSlash, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: pageData,
      });
    });

    await page.goto(urlWithSlash);
    return page;
  }

  async _getTurnstileResponse(page, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const value = await page.$eval("[name=cf-turnstile-response]", el => el.value).catch(() => "");
        if (value) {
          return value;
        } else {
          await page.click(".cf-turnstile").catch(() => {});
          await page.waitForTimeout(500);
        }
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  async solve(url, sitekey, action = null, cdata = null) {
    const start = Date.now();
    let browser;

    if (this.browserType === "chromium" || this.browserType === "chrome") {
      browser = await chromium.launch({ headless: this.headless });
    } else if (this.browserType === "firefox") {
      browser = await firefox.launch({ headless: this.headless });
    } else {
      throw new Error(`Unsupported browser type: ${this.browserType}`);
    }

    let result;
    try {
      const page = await this._setupPage(browser, url, sitekey, action, cdata);
      const token = await this._getTurnstileResponse(page);

      const elapsed = (Date.now() - start) / 1000;
      if (!token) {
        result = new TurnstileResult(null, elapsed, "failure", "Max attempts reached without token retrieval");
      } else {
        result = new TurnstileResult(token, elapsed, "success");
      }
    } finally {
      if (browser) await browser.close();
    }

    return result;
  }
}

async function getTurnstileToken({ url, sitekey, action = null, cdata = null, debug = false, headless = true, userAgent = null, browserType = "chromium" }) {
  const solver = new AsyncTurnstileSolver({ debug, headless, userAgent, browserType });
  return await solver.solve(url, sitekey, action, cdata);
}

module.exports = { getTurnstileToken }