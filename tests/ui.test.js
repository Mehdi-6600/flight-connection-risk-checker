import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createDomEnvironment, projectRoot, persianToNumber } from "./helpers/dom-stub.mjs";

let moduleCase = 0;

async function loadApp() {
  const environment = await createDomEnvironment();
  await import(`../src/main.js?case=${++moduleCase}`);
  return environment;
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function textOf(document, id) {
  return document.getElementById(id)?.textContent ?? "";
}

test("شناسه‌هایی که main.js صدا می‌زند در index.html وجود دارند", async () => {
  const [html, main] = await Promise.all([
    readFile(path.join(projectRoot, "index.html"), "utf8"),
    readFile(path.join(projectRoot, "src/main.js"), "utf8"),
  ]);
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const referenced = new Set();
  for (const m of main.matchAll(/querySelector(?:All)?\(\s*"#([\w-]+)"/g)) referenced.add(m[1]);
  for (const m of main.matchAll(/getElementById\(\s*"([\w-]+)"/g)) referenced.add(m[1]);
  for (const m of main.matchAll(/valueOf\(\s*"([\w-]+)"/g)) referenced.add(m[1]);
  for (const m of main.matchAll(/\["(flight[12]-[\w-]+)",\s*"[^"]+"\]/g)) referenced.add(m[1]);
  for (const m of main.matchAll(/"(flight[12]-[\w-]+)":/g)) referenced.add(m[1]);
  assert.ok(referenced.size >= 15, "دست‌کم ۱۵ شناسه از DOM خوانده شود.");
  for (const id of referenced) {
    assert.ok(ids.has(id), `شناسهٔ #${id} در index.html تعریف نشده است.`);
  }
});

test("باکس‌های سه‌گانه در HTML وجود دارند", async () => {
  const html = await readFile(path.join(projectRoot, "index.html"), "utf8");
  for (const leg of ["origin", "connection", "destination"]) {
    assert.match(html, new RegExp(`id="${leg}-country"`));
    assert.match(html, new RegExp(`id="${leg}-city"`));
    assert.match(html, new RegExp(`id="${leg}-airport"`));
  }
  assert.match(html, /id="frequent-routes-chips"/);
  assert.match(html, /id="customer-notice-text"/);
});

test("همهٔ ماژول‌های importشده در main.js در فهرست آفلاین service worker هستند", async () => {
  const [main, sw] = await Promise.all([
    readFile(path.join(projectRoot, "src", "main.js"), "utf8"),
    readFile(path.join(projectRoot, "public", "sw.js"), "utf8"),
  ]);
  const shell = new Set([...sw.matchAll(/"(\/(?:src|data|icons)\/[^"]+|manifest\.webmanifest|robots\.txt)"/g)].map((m) => m[1]));
  const imports = [...main.matchAll(/from\s+"(\.[^"]+)"/g)].map((m) => m[1]);
  assert.ok(imports.length >= 5, "main.js باید چند ماژول داخلی import کند.");
  for (const specifier of imports) {
    const normalized = path.posix.normalize(path.posix.join("/src", specifier));
    assert.ok(shell.has(normalized), `${normalized} در APP_SHELL service worker نیست.`);
  }
});
