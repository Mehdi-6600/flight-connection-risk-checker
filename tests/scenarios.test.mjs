import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAirportByIata } from "../src/lib/airports.js";
import { evaluateConnection } from "../src/lib/risk-engine/engine.js";

const scenariosFile = new URL("../test-data/scenarios.json", import.meta.url);

function makeDateAndTimeAfter(date, time, minutes) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  return {
    date: `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`,
    time: `${String(result.getUTCHours()).padStart(2, "0")}:${String(result.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function airport(iata) {
  const result = getAirportByIata(iata);
  assert.ok(result, `دیتاست باید ${iata} را داشته باشد`);
  return result;
}

function toEngineInput(scenario) {
  const airportChange = scenario.id === "same-city-airport-change";
  const arrivalCode = airportChange ? "IST" : "DOH";
  const departureCode = airportChange ? "SAW" : "DOH";
  const date = "2026-11-14";
  const arrivalTime = "10:30";
  const second = makeDateAndTimeAfter(date, arrivalTime, scenario.connectionMinutes);
  const airline1 = "ایرلاین نمونه الف";
  const airline2 = scenario.airlineRelation === "different" ? "ایرلاین نمونه ب" : airline1;

  return {
    flight1: {
      origin: airport("MCT"),
      destination: airport(arrivalCode),
      departureDate: date,
      departureTime: "09:00",
      arrivalDate: date,
      arrivalTime,
      airline: airline1,
      flightNumber: "EX 101",
    },
    flight2: {
      origin: airport(departureCode),
      destination: airport("MCT"),
      departureDate: second.date,
      departureTime: second.time,
      airline: airline2,
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

test("test-data شامل دست‌کم ده سناریوی فرضی با سطح موردانتظار مطابق Risk Engine است", async () => {
  const file = JSON.parse(await readFile(scenariosFile, "utf8"));
  assert.ok(file.scenarios.length >= 10);
  for (const scenario of file.scenarios) {
    const actual = evaluateConnection(toEngineInput(scenario), { delayMinutes: scenario.delayMinutes ?? 0 });
    assert.equal(actual.level.id, scenario.expectedLevel, `${scenario.id}: ${scenario.label}`);
    if (["overnight", "next-day"].includes(scenario.id)) {
      assert.equal(actual.timing.crossesLocalDate, true, `${scenario.id} باید تاریخ محلی بعدی را تشخیص دهد`);
    }
  }
});
