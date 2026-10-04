import test from "node:test";
import assert from "node:assert/strict";
import { getAirportByIata } from "../src/lib/airports.js";
import { evaluateConnection } from "../src/lib/risk-engine/engine.js";

const airport = (iata) => {
  const result = getAirportByIata(iata);
  assert.ok(result, `دیتاست باید ${iata} را داشته باشد`);
  return result;
};

function makeDateAndTimeAfter(date, time, minutes) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  return {
    date: `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`,
    time: `${String(result.getUTCHours()).padStart(2, "0")}:${String(result.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function baseInput(connectionMinutes, overrides = {}) {
  const date = "2026-11-14";
  const arrivalTime = "10:30";
  const second = makeDateAndTimeAfter(date, arrivalTime, connectionMinutes);
  return {
    flight1: {
      origin: airport("MCT"),
      destination: airport("IST"),
      departureDate: date,
      departureTime: "06:00",
      arrivalDate: date,
      arrivalTime,
      airline: "ایرلاین نمونه الف",
      flightNumber: "EX 101",
    },
    flight2: {
      origin: airport("IST"),
      destination: airport("MCT"),
      departureDate: second.date,
      departureTime: second.time,
      airline: "ایرلاین نمونه الف",
      flightNumber: "EX 202",
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
    ...overrides,
  };
}

test("سطح ریسک با کاهش زمان اتصال صعودی است", () => {
  const veryHigh = evaluateConnection(baseInput(30));
  const high = evaluateConnection(baseInput(60));
  const medium = evaluateConnection(baseInput(120));
  const low = evaluateConnection(baseInput(240));

  assert.equal(veryHigh.level.id, "very-high");
  assert.equal(high.level.id, "high");
  assert.equal(medium.level.id, "medium");
  assert.equal(low.level.id, "low");
  assert.ok(veryHigh.score > high.score);
  assert.ok(high.score > medium.score);
  assert.ok(medium.score > low.score);
});

test("Self-transfer و دو بلیت جداگانه امتیاز را افزایش می‌دهند", () => {
  const base = evaluateConnection(baseInput(180));
  const self = evaluateConnection(baseInput(180, {
    connection: { ...baseInput(180).connection, transferType: "self" },
  }));
  const separate = evaluateConnection(baseInput(180, {
    connection: { ...baseInput(180).connection, ticketType: "separate" },
  }));
  assert.ok(self.score > base.score, `Self-transfer باید امتیاز را افزایش دهد (${base.score} → ${self.score})`);
  assert.ok(separate.score > base.score, `بلیت جداگانه باید امتیاز را افزایش دهد (${base.score} → ${separate.score})`);
});

test("تغییر فرودگاه IST → SAW باعث افزایش ریسک و گزارش عامل تغییر فرودگاه می‌شود", () => {
  const input = baseInput(240, {
    flight2: {
      origin: airport("SAW"),
      destination: airport("MCT"),
      departureDate: "2026-11-14",
      departureTime: "14:30",
      airline: "ایرلاین نمونه الف",
      flightNumber: "EX 202",
    },
    connection: {
      ticketType: "one",
      baggageThrough: "yes",
      recheck: "no",
      immigration: "no",
      terminalChange: "no",
      airportChange: "yes",
      transferType: "airside",
      security: "no",
    },
  });
  const result = evaluateConnection(input);
  assert.equal(result.connection.sameCity, true);
  assert.equal(result.connection.sameAirport, false);
  assert.ok(result.factors.some((factor) => factor.key === "airport-change"));
  assert.ok(result.score >= 30, `امتیاز باید حداقل ۳۰ باشد، شد ${result.score}`);
});

test("تغییر ترمینال، Immigration، تحویل بار، پذیرش مجدد، امنیت اثر افزایشی دارند", () => {
  const clean = evaluateConnection(baseInput(300));
  const withAll = evaluateConnection(baseInput(300, {
    connection: {
      ticketType: "one",
      baggageThrough: "no",
      recheck: "yes",
      immigration: "yes",
      terminalChange: "yes",
      airportChange: "no",
      transferType: "airside",
      security: "yes",
    },
  }));
  assert.ok(withAll.score > clean.score, `امتیاز باید افزایش یابد (${clean.score} → ${withAll.score})`);
  for (const key of ["baggage", "check-in", "immigration", "terminal", "security"]) {
    assert.ok(withAll.factors.some((factor) => factor.key === key), `عامل ${key} باید در خروجی باشد`);
  }
});

test("تأخیرهای ۱۵ تا ۱۲۰ دقیقه ریسک را افزایش می‌دهند", () => {
  const base = baseInput(120);
  const results = [0, 15, 30, 45, 60, 90, 120].map((delay) =>
    evaluateConnection(base, { delayMinutes: delay }),
  );
  for (let i = 1; i < results.length; i += 1) {
    assert.ok(results[i].score >= results[i - 1].score, `امتیاز باید صعودی باشد (${results[i - 1].score} → ${results[i].score})`);
  }
  assert.equal(results.at(-1).score, 100);
});

test("سناریوی بحرانی با ۳۰ دقیقه اتصال و بلیت جداگانه امتیاز بالا می‌دهد", () => {
  const result = evaluateConnection(baseInput(30, {
    connection: {
      ticketType: "separate",
      baggageThrough: "no",
      recheck: "yes",
      immigration: "yes",
      terminalChange: "yes",
      airportChange: "no",
      transferType: "self",
      security: "yes",
    },
  }));
  assert.equal(result.score, 100);
  assert.equal(result.level.id, "very-high");
});
