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

const SCENARIOS = [
  {
    id: "critical-30min",
    label: "اتصال ۳۰ دقیقه‌ای، یک بلیت، Airside",
    connectionMinutes: 30,
    expectedLevel: "very-high",
  },
  {
    id: "high-60min",
    label: "اتصال ۱ ساعته، یک بلیت، Airside",
    connectionMinutes: 60,
    expectedLevel: "high",
  },
  {
    id: "medium-120min",
    label: "اتصال ۲ ساعته، یک بلیت، Airside",
    connectionMinutes: 120,
    expectedLevel: "medium",
  },
  {
    id: "low-240min",
    label: "اتصال ۴ ساعته، یک بلیت، Airside",
    connectionMinutes: 240,
    expectedLevel: "low",
  },
  {
    id: "self-transfer-180",
    label: "Self-transfer با ۳ ساعت اتصال",
    connectionMinutes: 180,
    transferType: "self",
    expectedLevel: "high",
  },
  {
    id: "separate-ticket-240",
    label: "دو بلیت جداگانه با ۴ ساعت اتصال",
    connectionMinutes: 240,
    ticketType: "separate",
    expectedLevel: "high",
  },
  {
    id: "baggage-recheck-300",
    label: "تحویل مجدد بار با ۵ ساعت اتصال",
    connectionMinutes: 300,
    baggageThrough: "no",
    expectedLevel: "medium",
  },
  {
    id: "same-city-airport-change",
    label: "تغییر فرودگاه IST → SAW",
    connectionMinutes: 240,
    expectedLevel: "high",
  },
  {
    id: "terminal-change-240",
    label: "تغییر ترمینال با ۴ ساعت اتصال",
    connectionMinutes: 240,
    terminalChange: "yes",
    expectedLevel: "medium",
  },
  {
    id: "immigration-240",
    label: "کنترل مهاجرت با ۴ ساعت اتصال",
    connectionMinutes: 240,
    immigration: "yes",
    expectedLevel: "low",
  },
];

function toEngineInput(scenario) {
  const airportChange = scenario.id === "same-city-airport-change";
  const arrivalCode = airportChange ? "IST" : "IST";
  const departureCode = airportChange ? "SAW" : "IST";
  const date = "2026-11-14";
  const arrivalTime = "10:30";
  const second = makeDateAndTimeAfter(date, arrivalTime, scenario.connectionMinutes);

  return {
    flight1: {
      origin: airport("MCT"),
      destination: airport(arrivalCode),
      departureDate: date,
      departureTime: "06:00",
      arrivalDate: date,
      arrivalTime,
      airline: "ایرلاین نمونه الف",
      flightNumber: "EX 101",
    },
    flight2: {
      origin: airport(departureCode),
      destination: airport("MCT"),
      departureDate: second.date,
      departureTime: second.time,
      airline: "ایرلاین نمونه الف",
      flightNumber: "EX 202",
    },
    connection: {
      ticketType: scenario.ticketType ?? "one",
      baggageThrough: scenario.baggageThrough ?? "yes",
      recheck: scenario.recheck ?? "no",
      immigration: scenario.immigration ?? "no",
      terminalChange: scenario.terminalChange ?? "no",
      airportChange: airportChange ? "yes" : "no",
      transferType: scenario.transferType ?? "airside",
      security: scenario.security ?? "no",
    },
  };
}

test("همه سناریوهای شاخص به سطح ریسک مورد انتظار می‌رسند", () => {
  for (const scenario of SCENARIOS) {
    const actual = evaluateConnection(toEngineInput(scenario), { delayMinutes: scenario.delayMinutes ?? 0 });
    assert.equal(
      actual.level.id,
      scenario.expectedLevel,
      `${scenario.id}: ${scenario.label} → انتظار ${scenario.expectedLevel}، دریافت ${actual.level.id} (امتیاز ${actual.score})`,
    );
  }
});
