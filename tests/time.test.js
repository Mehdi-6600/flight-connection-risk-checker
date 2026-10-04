import test from "node:test";
import assert from "node:assert/strict";
import { airportLocalToUtc, parseClockTime, parseIsoDate, timezoneOffsetMinutes } from "../src/lib/time.js";

test("تاریخ و ساعت با قالب استاندارد بررسی می‌شوند", () => {
  assert.deepEqual(parseIsoDate("2026-10-04"), { year: 2026, month: 10, day: 4 });
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.deepEqual(parseClockTime("23:59"), { hour: 23, minute: 59 });
  assert.equal(parseClockTime("24:00"), null);
});

test("تبدیل ساعت محلی فرودگاه به UTC به ساعت دستگاه وابسته نیست", () => {
  const tehran = airportLocalToUtc("2026-10-04", "12:00", "Asia/Tehran");
  const muscat = airportLocalToUtc("2026-10-04", "12:00", "Asia/Muscat");
  assert.equal(tehran.ok, true);
  assert.equal(muscat.ok, true);
  assert.equal(tehran.timestamp - muscat.timestamp, 30 * 60 * 1000);
  assert.equal(timezoneOffsetMinutes(muscat.timestamp, "Asia/Muscat"), 240);
});

test("ساعت ناموجود در شروع ساعت تابستانی رد و ساعت تکراری علامت‌گذاری می‌شود", () => {
  const missing = airportLocalToUtc("2026-03-29", "01:30", "Europe/London");
  assert.equal(missing.ok, false);
  const repeated = airportLocalToUtc("2026-10-25", "01:30", "Europe/London");
  assert.equal(repeated.ok, true);
  assert.equal(repeated.ambiguous, true);
});
