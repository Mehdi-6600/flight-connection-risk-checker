import test from "node:test";
import assert from "node:assert/strict";
import { getAirportByIata, resolveAirport } from "../src/lib/airports.js";
import { evaluateConnection, resolveFlightTimes, simulateDelays } from "../src/lib/risk-engine/engine.js";
import { formatDuration } from "../src/lib/time.js";

const airport = (iata) => {
  const found = getAirportByIata(iata);
  assert.ok(found, `فرودگاه نمونه ${iata} باید در دیتاست باشد`);
  return found;
};

function addLocalMinutes(dateValue, timeValue, minutes) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  return {
    date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
    time: `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function makeInput(connectionMinutes = 240, overrides = {}) {
  const date = "2026-11-14";
  const arrivalTime = "10:30";
  const secondDeparture = addLocalMinutes(date, arrivalTime, connectionMinutes);
  return {
    flight1: {
      origin: airport("MCT"),
      destination: airport("DOH"),
      departureDate: date,
      departureTime: "09:00",
      arrivalDate: date,
      arrivalTime,
      airline: "Oman Air",
      flightNumber: "WY 100",
    },
    flight2: {
      origin: airport("DOH"),
      destination: airport("MCT"),
      departureDate: secondDeparture.date,
      departureTime: secondDeparture.time,
      airline: "Oman Air",
      flightNumber: "WY 200",
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

test("فرودگاه با کد IATA و نام شهر resolve می‌شود و شهر چندفرودگاهی مبهم می‌ماند", () => {
  assert.equal(resolveAirport("IKA").airport.iata, "IKA");
  assert.equal(resolveAirport("فرودگاه استانبول").airport.iata, "IST");
  assert.equal(resolveAirport("استانبول").status, "ambiguous");
  assert.equal(resolveAirport("XYZ").status, "invalid");
});

test("چهار سطح ریسک برای اتصال ۳۰ دقیقه، یک ساعت، دو ساعت و چهار ساعت قابل بازتولید است", () => {
  assert.equal(evaluateConnection(makeInput(30)).level.id, "very-high");
  assert.equal(evaluateConnection(makeInput(60)).level.id, "high");
  assert.equal(evaluateConnection(makeInput(120)).level.id, "medium");
  assert.equal(evaluateConnection(makeInput(240)).level.id, "low");
});

test("زمان واقعی اتصال با مناطق زمانی فرودگاه‌ها محاسبه می‌شود", () => {
  const result = evaluateConnection(makeInput(120));
  assert.equal(result.timing.connectionMinutes, 120);
  assert.equal(result.connection.sameAirport, true);
  assert.equal(result.timing.estimatedMinimumMinutes, 90);
  assert.ok(!result.factors.some((factor) => factor.key === "baggage"), "بار Check-through نباید جریمهٔ تحویل مجدد بگیرد");
  assert.match(result.notice, /MCT رسمی/);
});

test("IST به SAW به‌عنوان دو فرودگاه متفاوت در یک شهر تشخیص داده می‌شود", () => {
  const input = makeInput(180);
  input.flight1.destination = airport("IST");
  input.flight2.origin = airport("SAW");
  input.connection.airportChange = "no";
  const result = evaluateConnection(input);
  assert.equal(result.connection.sameAirport, false);
  assert.equal(result.connection.sameCity, true);
  assert.equal(result.connection.locationSummary, "دو فرودگاه متفاوت در یک شهر");
  assert.equal(result.level.id, "high");
  assert.ok(result.factors.some((factor) => factor.key === "airport-change"));
  assert.ok(result.factors.some((factor) => factor.key === "airport-answer-conflict"));
});

test("فرودگاه‌های متفاوت در شهرهای مختلف جدا از تغییر فرودگاه هم‌شهر شناسایی می‌شوند", () => {
  const input = makeInput(180);
  input.flight1.destination = airport("IST");
  input.flight2.origin = airport("DXB");
  const departure = addLocalMinutes("2026-11-14", "10:30", 180);
  input.flight2.departureDate = departure.date;
  input.flight2.departureTime = "14:30";
  const result = evaluateConnection(input);
  assert.equal(result.connection.sameAirport, false);
  assert.equal(result.connection.sameCity, false);
  assert.equal(result.connection.locationSummary, "دو فرودگاه در دو شهر متفاوت");
  assert.ok(result.factors.some((factor) => factor.key === "airport-change" && factor.points === 40));
  assert.equal(result.connection.timezoneOffsetDifferenceMinutes, 60);
});

test("Self-transfer و دو بلیت جداگانه امتیاز مستقل و قابل مشاهده دارند", () => {
  const self = makeInput(180);
  self.connection.transferType = "self";
  self.connection.ticketType = "separate";
  const result = evaluateConnection(self);
  assert.ok(result.factors.some((factor) => factor.key === "self-transfer"));
  assert.ok(result.factors.some((factor) => factor.key === "separate-ticket"));
  assert.ok(result.score > evaluateConnection(makeInput(180)).score);
});

test("تحویل مجدد بار، پذیرش مجدد، Immigration، امنیت و تغییر ترمینال در امتیاز لحاظ می‌شوند", () => {
  const base = evaluateConnection(makeInput(240));
  const detailed = makeInput(240);
  detailed.connection.baggageThrough = "no";
  detailed.connection.recheck = "yes";
  detailed.connection.immigration = "yes";
  detailed.connection.terminalChange = "yes";
  detailed.connection.security = "yes";
  const result = evaluateConnection(detailed);
  assert.ok(result.score > base.score);
  for (const key of ["baggage", "check-in", "immigration", "terminal", "security"]) {
    assert.ok(result.factors.some((factor) => factor.key === key), `عامل ${key} باید در خروجی باشد`);
  }
  assert.equal(result.timing.estimatedMinimumMinutes, 300);
});

test("پرواز دوم پیش از ورود یا زمان منفی برای اتصال پذیرفته نمی‌شود", () => {
  const beforeArrival = makeInput(0);
  beforeArrival.flight2.departureTime = "10:00";
  const times = resolveFlightTimes(beforeArrival);
  assert.equal(times.ok, false);
  assert.match(times.error, /بعد از زمان ورود/);
  assert.throws(() => evaluateConnection(beforeArrival), /بعد از زمان ورود/);
});

test("تأخیرهای ۱۵ تا ۱۲۰ دقیقه از همان موتور استفاده می‌کنند و ریسک با کاهش زمان بالا می‌رود", () => {
  const scenarios = simulateDelays(makeInput(120));
  assert.deepEqual(scenarios.map((scenario) => scenario.delayMinutes), [15, 30, 45, 60, 90, 120]);
  assert.deepEqual(scenarios.map((scenario) => scenario.result.timing.remainingMinutes), [105, 90, 75, 60, 30, 0]);
  for (let index = 1; index < scenarios.length; index += 1) {
    assert.ok(scenarios[index].result.score >= scenarios[index - 1].result.score);
  }
  assert.equal(scenarios.at(-1).result.score, 100);
});

test("توقف شبانه و پرواز روز بعد در تاریخ محلی گزارش می‌شود", () => {
  const input = makeInput(15 * 60);
  const result = evaluateConnection(input);
  assert.equal(result.timing.crossesLocalDate, true);
  assert.ok(result.factors.some((factor) => factor.key === "overnight"));
});

test("اتصال یک‌ساعته‌ای که از نیمه‌شب محلی عبور می‌کند درست تشخیص داده می‌شود", () => {
  const input = makeInput(60);
  input.flight1.departureTime = "20:00";
  input.flight1.arrivalTime = "23:30";
  input.flight2.departureDate = "2026-11-15";
  input.flight2.departureTime = "00:30";
  const result = evaluateConnection(input);
  assert.equal(result.timing.connectionMinutes, 60);
  assert.equal(result.timing.crossesLocalDate, true);
  assert.ok(result.factors.some((factor) => factor.key === "overnight"));
});

test("شماره ایرلاین متفاوت و پاسخ‌های نامشخص در عوامل توضیح داده می‌شوند", () => {
  const input = makeInput(240);
  input.flight2.airline = "Air Example B";
  input.connection.immigration = "unknown";
  const result = evaluateConnection(input);
  assert.ok(result.factors.some((factor) => factor.key === "airline-difference"));
  assert.ok(result.factors.some((factor) => factor.key === "immigration-unknown"));
});

test("فرمت زمان برای رابط فارسی پایدار است", () => {
  assert.equal(formatDuration(130), "۲ ساعت و ۱۰ دقیقه");
  assert.equal(formatDuration(0), "۰ دقیقه");
});
