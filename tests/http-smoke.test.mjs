import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`سرور آزمایشی بالا نیامد: ${output}`)), 8000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/0\.0\.0\.0:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      if (code !== null) {
        clearTimeout(timer);
        reject(new Error(`سرور آزمایشی با کد ${code} خارج شد: ${output}`));
      }
    });
  });
}

test("سرور برنامهٔ ثابت، پوسته و فایل‌های runtime را با هدر noindex ارائه و فایل‌های خصوصی را مسدود می‌کند", async () => {
  const child = spawn(process.execPath, ["scripts/dev-server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let port;
  try {
    port = await waitForServer(child);
    const origin = `http://127.0.0.1:${port}`;
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("x-robots-tag"), /noindex/);
    assert.match(page.headers.get("content-security-policy"), /object-src 'none'/);
    const html = await page.text();
    assert.match(html, /lang="fa" dir="rtl"/);
    assert.match(html, /id="connection-form"/);

    for (const asset of ["/src/main.js", "/src/styles.css", "/data/airports.js", "/manifest.webmanifest", "/sw.js", "/icons/icon-192.png"]) {
      const response = await fetch(`${origin}${asset}`);
      assert.equal(response.status, 200, `${asset} باید در دسترس باشد`);
      assert.ok(Number(response.headers.get("content-length")) > 0);
    }
    for (const blocked of ["/package.json", "/.git/config", "/README.md"]) {
      const response = await fetch(`${origin}${blocked}`);
      assert.equal(response.status, 404, `${blocked} نباید از سرور نمونه منتشر شود`);
    }
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      wait(2000),
    ]);
  }
});
