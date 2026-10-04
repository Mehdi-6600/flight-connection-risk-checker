import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveAirport } from "../src/lib/airports.js";
import { evaluateConnection, simulateDelays } from "../src/lib/risk-engine/engine.js";

const read = (code) => {
  const result = resolveAirport(code);
  assert.equal(result.status, "matched");
  return result.airport;
};

test("جریان اصلی فرم تا تحلیل، شبیه‌سازی و متن نتیجه برای مسیر دوحه کامل است", async () => {
  const formInput = {
    flight1: {
      origin: read("IKA"),
      destination: read("DOH"),
      departureDate: "2026-10-04",
      departureTime: "09:00",
      arrivalDate: "2026-10-04",
      arrivalTime: "11:30",
      airline: "ایرلاین نمونه الف",
      flightNumber: "AB 101",
    },
    flight2: {
      origin: read("DOH"),
      destination: read("MCT"),
      departureDate: "2026-10-04",
      departureTime: "13:30",
      airline: "ایرلاین نمونه الف",
      flightNumber: "AB 202",
    },
    connection: {
      ticketType: "one",
      baggageThrough: "yes",
      recheck: "no",
      immigration: "no",
      terminalChange: "no",
      airportChange: "no",
      transferType: "airside",
      security: "no",
    },
  };

  const analysis = evaluateConnection(formInput);
  assert.equal(analysis.timing.connectionMinutes, 120);
  assert.equal(analysis.connection.sameAirport, true);
  assert.equal(analysis.level.id, "medium");
  assert.match(analysis.narrative, /دقیقه/);
  assert.equal(simulateDelays(formInput).length, 6);

  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="connection-form"/);
  assert.match(html, /id="result-panel"/);
  assert.match(html, /id="delay-grid"/);
  assert.match(html, /lang="fa" dir="rtl"/);
});
