/**
 * منبع واحد حقیقت برای دامنهٔ Monitoring.
 * از این پس فقط این چهار کشور در تمام لایه‌ها (UI، جست‌وجو، آمار،
 * Monitoring، Alert، History، Cache، Route Library) مجاز هستند.
 *
 * کشورها بر اساس کد ISO 3166-1 alpha-2 نگهداری می‌شوند تا وابستگی به
 * نام‌های محلی/انگلیسی نداشته باشیم؛ اما برای نمایش از countryFa استفاده می‌شود.
 */

export const MONITORED_COUNTRY_CODES = Object.freeze(["IR", "TR", "IQ", "OM"]);

export const MONITORED_COUNTRIES = Object.freeze([
  Object.freeze({ code: "IR", nameFa: "ایران", flag: "🇮🇷" }),
  Object.freeze({ code: "TR", nameFa: "ترکیه", flag: "🇹🇷" }),
  Object.freeze({ code: "IQ", nameFa: "عراق", flag: "🇮🇶" }),
  Object.freeze({ code: "OM", nameFa: "عمان", flag: "🇴🇲" }),
]);

const ALLOWED = new Set(MONITORED_COUNTRY_CODES);

/** نگاشت نام کشور (انگلیسی یا فارسی) به کد ISO. */
const COUNTRY_NAME_TO_CODE = Object.freeze({
  Iran: "IR",
  "ایران": "IR",
  Türkiye: "TR",
  Turkey: "TR",
  "ترکیه": "TR",
  Iraq: "IQ",
  "عراق": "IQ",
  Oman: "OM",
  "عمان": "OM",
});

export function countryCodeOf(countryOrCode) {
  if (!countryOrCode) return null;
  const value = String(countryOrCode).trim();
  if (ALLOWED.has(value.toUpperCase())) return value.toUpperCase();
  const mapped = COUNTRY_NAME_TO_CODE[value];
  return mapped && ALLOWED.has(mapped) ? mapped : null;
}

export function isMonitoredCountry(countryOrCode) {
  return countryCodeOf(countryOrCode) !== null;
}

export function isMonitoredAirport(airport) {
  if (!airport) return false;
  return isMonitoredCountry(airport.country) || isMonitoredCountry(airport.countryCode);
}

export function monitoredCountryLabel(code) {
  const found = MONITORED_COUNTRIES.find((item) => item.code === code);
  return found ? `${found.flag} ${found.nameFa}` : "نامشخص";
}
