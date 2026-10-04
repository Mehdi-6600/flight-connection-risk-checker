import test from "node:test";
import assert from "node:assert/strict";
import { getAirportByIata, listAirports, resolveAirport } from "../src/lib/airports.js";
import { isMonitoredCountry } from "../src/lib/monitoring-scope.js";

test("listAirports فقط فرودگاه‌های چهار کشور مجاز را برمی‌گرداند", () => {
  const list = listAirports();
  assert.ok(list.length > 0);
  for (const airport of list) {
    assert.ok(
      isMonitoredCountry(airport.country),
      `${airport.iata} (${airport.country}) نباید در listAirports باشد`,
    );
  }
});

test("resolveAirport روی فرودگاه‌های داخل scope موفق و خارج از scope نامعتبر می‌شود", () => {
  assert.equal(resolveAirport("IKA").status, "matched");
  assert.equal(resolveAirport("IST").status, "matched");
  assert.equal(resolveAirport("BGW").status, "matched");
  assert.equal(resolveAirport("MCT").status, "matched");
  assert.equal(resolveAirport("فرودگاه استانبول").airport.iata, "IST");
  assert.equal(resolveAirport("استانبول").status, "ambiguous");

  assert.equal(resolveAirport("DOH").status, "invalid", "دوحه خارج از scope است");
  assert.equal(resolveAirport("DXB").status, "invalid", "دبی خارج از scope است");
  assert.equal(resolveAirport("LHR").status, "invalid", "لندن خارج از scope است");
  assert.equal(resolveAirport("JFK").status, "invalid", "نیویورک خارج از scope است");
  assert.equal(resolveAirport("XYZ").status, "invalid");
});

test("getAirportByIata برای فرودگاه خارج از scope مقدار null می‌دهد", () => {
  assert.ok(getAirportByIata("IKA"));
  assert.ok(getAirportByIata("MCT"));
  assert.equal(getAirportByIata("DOH"), null);
  assert.equal(getAirportByIata("DXB"), null);
  assert.equal(getAirportByIata("CDG"), null);
});
