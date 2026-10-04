import test from "node:test";
import assert from "node:assert/strict";
import { AIRPORTS } from "../data/airports.js";
import { MONITORED_COUNTRY_CODES, isMonitoredCountry } from "../src/lib/monitoring-scope.js";

test("رکوردهای فرودگاه دارای IATA/ICAO یکتا، منطقهٔ زمانی معتبر و ارجاع هم‌شهری معتبرند", () => {
  const iataCodes = new Set();
  const icaoCodes = new Set();
  const byIata = new Map(AIRPORTS.map((airport) => [airport.iata, airport]));
  assert.ok(AIRPORTS.length >= 50);

  for (const airport of AIRPORTS) {
    assert.match(airport.iata, /^[A-Z]{3}$/);
    assert.match(airport.icao, /^[A-Z]{4}$/);
    assert.ok(!iataCodes.has(airport.iata), `کد تکراری IATA: ${airport.iata}`);
    assert.ok(!icaoCodes.has(airport.icao), `کد تکراری ICAO: ${airport.icao}`);
    iataCodes.add(airport.iata);
    icaoCodes.add(airport.icao);
    for (const key of ["nameFa", "nameEn", "city", "cityFa", "country", "countryFa", "timezone"]) {
      assert.equal(typeof airport[key], "string");
      assert.ok(airport[key].length > 0, `${airport.iata}: ${key} خالی نباشد`);
    }
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en", { timeZone: airport.timezone }));
    assert.ok(airport.cityAirports.includes(airport.iata));
    for (const otherCode of airport.cityAirports) {
      const other = byIata.get(otherCode);
      assert.ok(other, `${airport.iata}: کد هم‌شهر ${otherCode} موجود باشد`);
      assert.equal(other.city, airport.city);
      assert.equal(other.country, airport.country);
    }
  }
});

test("فقط چهار کشور IR، TR، IQ، OM به‌عنوان دامنهٔ مجاز شناخته می‌شوند", () => {
  assert.deepEqual([...MONITORED_COUNTRY_CODES].sort(), ["IQ", "IR", "OM", "TR"]);
  assert.equal(isMonitoredCountry("Iran"), true);
  assert.equal(isMonitoredCountry("Türkiye"), true);
  assert.equal(isMonitoredCountry("Iraq"), true);
  assert.equal(isMonitoredCountry("Oman"), true);
  assert.equal(isMonitoredCountry("Qatar"), false);
  assert.equal(isMonitoredCountry("United Arab Emirates"), false);
  assert.equal(isMonitoredCountry("United Kingdom"), false);
  assert.equal(isMonitoredCountry("United States"), false);
});
