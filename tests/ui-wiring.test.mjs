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

function fillForm(document, overrides = {}) {
  const values = {
    "flight1-origin": "IKA",
    "flight1-destination": "IST",
    "flight1-departure-date": "2026-03-10",
    "flight1-departure-time": "08:00",
    "flight1-arrival-date": "2026-03-10",
    "flight1-arrival-time": "11:30",
    "flight2-origin": "IST",
    "flight2-destination": "LHR",
    "flight2-departure-date": "2026-03-10",
    "flight2-departure-time": "14:00",
    "flight1-airline": "ایران‌ایر",
    "flight1-number": "IR123",
    "flight2-airline": "ترکیش ایرلاینز",
    "flight2-number": "TK1",
    ...overrides,
  };
  for (const [id, value] of Object.entries(values)) {
    const field = document.getElementById(id);
    assert.ok(field, `فیلد ${id} در صفحه وجود دارد.`);
    field.value = value;
  }
}

function submitForm(document) {
  document.getElementById("connection-form").dispatch("submit", { preventDefault() {} });
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
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  const referenced = new Set();

  for (const match of main.matchAll(/querySelector(?:All)?\(\s*"#([\w-]+)"/g)) referenced.add(match[1]);
  for (const match of main.matchAll(/getElementById\(\s*"([\w-]+)"/g)) referenced.add(match[1]);
  for (const match of main.matchAll(/valueOf\(\s*"([\w-]+)"/g)) referenced.add(match[1]);
  for (const match of main.matchAll(/\["(flight[12]-[\w-]+)",\s*"[^"]+"\]/g)) referenced.add(match[1]);
  for (const match of main.matchAll(/"(flight[12]-[\w-]+)":/g)) referenced.add(match[1]);

  assert.ok(referenced.size >= 20, "دست‌کم ۲۰ شناسه باید از DOM خوانده شود.");
  for (const id of referenced) {
    assert.ok(ids.has(id), `شناسهٔ #${id} در index.html تعریف نشده است.`);
  }

  const errorTargets = [...html.matchAll(/data-error-for="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(errorTargets.length >= 10, "پیام‌های خطا باید به فیلدها متصل باشند.");
  for (const target of errorTargets) {
    assert.ok(ids.has(target), `data-error-for="${target}" به فیلدی اشاره می‌کند که وجود ندارد.`);
    assert.ok(new RegExp(`id="${target}-error"`).test(html), `برای ${target} المان خطا تعریف نشده است.`);
  }
});

test("فرم تا نتیجه در DOM اجرا می‌شود و همهٔ بخش‌های نتیجه پر می‌شوند", async () => {
  const { document } = await loadApp();
  assert.equal(textOf(document, "timeline-connection-time"), "--:--", "پیش از ورود داده، زمان اتصال خالی است.");

  fillForm(document);
  submitForm(document);
  await settle();

  assert.equal(document.getElementById("result-section").hidden, false, "بخش نتیجه نمایش داده می‌شود.");
  assert.equal(document.getElementById("empty-result").hidden, true, "حالت خالی پنهان می‌شود.");
  assert.match(document.getElementById("risk-card").className, /^risk-card risk-card-(low|medium|high|very-high)$/);
  assert.match(document.getElementById("risk-badge").className, /risk-badge-(low|medium|high|very-high)/);
  assert.match(document.getElementById("risk-meter-fill").className, /risk-meter-(low|medium|high|very-high)/);

  const score = persianToNumber(textOf(document, "risk-score"));
  assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `امتیاز معتبر نیست: ${score}`);
  assert.equal(document.getElementById("risk-meter-fill").getAttribute("aria-valuenow"), String(score));

  assert.ok(textOf(document, "result-date").includes("تحلیل در"));
  assert.ok(textOf(document, "route-summary-path").includes("→"));
  assert.ok(document.getElementById("route-summary-tags").children.length > 0, "برچسب‌های مسیر ساخته می‌شوند.");
  assert.equal(document.getElementById("connection-stats").children.length, 4, "چهار کارت آمار ساخته می‌شود.");
  assert.ok(document.getElementById("factor-list").children.length >= 3, "عوامل ریسک نمایش داده می‌شوند.");
  assert.equal(document.getElementById("delay-grid").children.length, 6, "شش سناریوی تأخیر ساخته می‌شود.");
  assert.notEqual(textOf(document, "analysis-summary-text"), "-");
  assert.notEqual(textOf(document, "recommendation-text"), "-");
  assert.notEqual(textOf(document, "timeline-connection-time"), "--:--", "پیش‌نمایش زمان اتصال به‌روز می‌شود.");

  assert.equal(document.getElementById("history-list").children.length, 1, "تحلیل در تاریخچه ذخیره می‌شود.");
  assert.equal(textOf(document, "history-count"), "۱");
  assert.equal(document.getElementById("history-empty").hidden, true);
  assert.equal(document.getElementById("clear-history-button").hidden, false);
});

test("انتخاب chips شرایط اتصال روی امتیاز اثر می‌گذارد", async () => {
  const { document } = await loadApp();
  fillForm(document);
  submitForm(document);
  await settle();
  const baseline = persianToNumber(textOf(document, "risk-score"));

  const conditions = document.getElementById("connection-conditions");
  const chips = conditions.descendants().filter((element) => element.dataset.condition === "ticketType");
  assert.equal(chips.length, 3, "سه گزینه برای نوع بلیت ساخته می‌شود.");
  const separateChip = chips.find((chip) => chip.dataset.value === "separate");
  conditions.dispatch("click", { target: separateChip });
  assert.equal(separateChip.getAttribute("aria-pressed"), "true");

  submitForm(document);
  await settle();
  const afterSeparateTicket = persianToNumber(textOf(document, "risk-score"));
  assert.ok(afterSeparateTicket > baseline, `بلیت جداگانه باید امتیاز را افزایش دهد (${baseline} → ${afterSeparateTicket}).`);
});

test("حذف یک رکورد تاریخچه، فهرست و شمارنده را به‌روز می‌کند", async () => {
  const { document } = await loadApp();
  fillForm(document);
  submitForm(document);
  await settle();

  const historyList = document.getElementById("history-list");
  const deleteButton = historyList.descendants().find((element) => element.attributes.has("data-history-delete"));
  assert.ok(deleteButton, "دکمهٔ حذف در کارت تاریخچه ساخته می‌شود.");
  historyList.dispatch("click", { target: deleteButton });

  assert.equal(historyList.children.length, 0, "رکورد حذف می‌شود.");
  assert.equal(textOf(document, "history-count"), "۰");
  assert.equal(document.getElementById("history-empty").hidden, false, "حالت خالی تاریخچه نمایش داده می‌شود.");
  assert.equal(document.getElementById("clear-history-button").hidden, true);
});

test("خطای اعتبارسنجی به فیلد مربوط متصل می‌شود", async () => {
  const { document } = await loadApp();
  fillForm(document, { "flight2-departure-time": "09:00" });
  submitForm(document);
  await settle();

  const summary = document.getElementById("form-error-summary");
  assert.equal(summary.hidden, false, "خلاصهٔ خطا نمایش داده می‌شود.");
  assert.ok(document.getElementById("form-error-list").children.length > 0);
  const invalidField = document.getElementById("flight2-departure-time");
  assert.equal(invalidField.getAttribute("aria-invalid"), "true");
  const message = document.querySelector('[data-error-for="flight2-departure-time"]');
  assert.ok(message.classList.contains("is-visible"), "پیام خطا کنار فیلد نمایش داده می‌شود.");
  assert.match(invalidField.getAttribute("aria-describedby"), /flight2-departure-time-error/);
});

test("همهٔ ماژول‌های importشده در main.js در فهرست آفلاین service worker هستند", async () => {
  const [main, serviceWorker] = await Promise.all([
    readFile(path.join(projectRoot, "src", "main.js"), "utf8"),
    readFile(path.join(projectRoot, "public", "sw.js"), "utf8"),
  ]);
  const shell = new Set([...serviceWorker.matchAll(/"(\/(?:src|data|icons)\/[^"]+|manifest.webmanifest|robots.txt)"/g)].map((match) => match[1]));

  const imports = [...main.matchAll(/from\s+"(\.[^"]+)"/g)].map((match) => match[1]);
  assert.ok(imports.length >= 5, "main.js باید چند ماژول داخلی import کند.");
  for (const specifier of imports) {
    const normalized = path.posix.normalize(path.posix.join("/src", specifier));
    assert.ok(shell.has(normalized), `${normalized} در APP_SHELL service worker نیست؛ حالت آفلاین کامل نخواهد بود.`);
  }
});
