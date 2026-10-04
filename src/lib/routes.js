import { AIRPORTS } from "../../data/airports.js";
import { getAirportByIata } from "./airports.js";
import { isMonitoredCountry } from "./monitoring-scope.js";

const RECENT_KEY = "flight-connection-risk-checker.recent-routes.v1";
const MAX_RECENT = 8;

/**
 * فرودگاه‌های scope فقط شامل چهار کشور مجاز هستند.
 * از این تابع برای ساخت مسیرهای پرتکرار استفاده می‌کنیم تا هیچ مسیر
 * خارج از scope پیشنهاد نشود.
 */
function airportInScope(iata) {
  const airport = getAirportByIata(iata);
  if (!airport) return null;
  if (!isMonitoredCountry(airport.country)) return null;
  return airport;
}

function routeInScope(iatas) {
  return iatas.every((code) => airportInScope(code) !== null);
}

/**
 * مسیرهای پرتکرار عملیاتی برای فروش بلیت؛ همه در چهار کشور مجاز.
 * مسیرها با ۴ فرودگاه (مبدأ، ورود، خروج، مقصد) نگه داشته می‌شوند تا
 * حتی وقتی فرودگاه اتصال دو تایی است هم auto-populate درست کار کند.
 */
export const FREQUENT_ROUTES = Object.freeze([
  Object.freeze({
    id: "ika-ist-mct",
    label: "تهران → استانبول → مسقط",
    iatas: ["IKA", "IST", "IST", "MCT"],
    countries: ["IR", "TR", "OM"],
  }),
  Object.freeze({
    id: "ika-ist-bgw",
    label: "تهران → استانبول → بغداد",
    iatas: ["IKA", "IST", "IST", "BGW"],
    countries: ["IR", "TR", "IQ"],
  }),
  Object.freeze({
    id: "ika-ist-saw-mct",
    label: "تهران → استانبول → مسقط (SAW)",
    iatas: ["IKA", "IST", "SAW", "MCT"],
    countries: ["IR", "TR", "OM"],
  }),
  Object.freeze({
    id: "mct-ist-ika",
    label: "مسقط → استانبول → تهران",
    iatas: ["MCT", "IST", "IST", "IKA"],
    countries: ["OM", "TR", "IR"],
  }),
  Object.freeze({
    id: "ika-ist-saw-bgw",
    label: "تهران → استانبول (SAW) → بغداد",
    iatas: ["IKA", "IST", "SAW", "BGW"],
    countries: ["IR", "TR", "IQ"],
  }),
  Object.freeze({
    id: "bgw-ist-mct",
    label: "بغداد → استانبول → مسقط",
    iatas: ["BGW", "IST", "IST", "MCT"],
    countries: ["IQ", "TR", "OM"],
  }),
]).filter((route) => routeInScope(route.iatas));

/**
 * لیست مسیرهای اخیر از localStorage با اعتبارسنجی مجدد.
 * فقط مسیرهایی که همهٔ فرودگاه‌هایشان در scope هستند نگه داشته می‌شوند.
 */
export function readRecentRoutes() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && Array.isArray(item.iatas) && routeInScope(item.iatas))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function pushRecentRoute(route) {
  if (!route || !Array.isArray(route.iatas) || !routeInScope(route.iatas)) return;
  const entry = {
    id: route.id ?? `recent-${route.iatas.join("-")}`,
    label: route.label ?? route.iatas.join(" → "),
    iatas: route.iatas,
    usedAt: new Date().toISOString(),
  };
  const current = readRecentRoutes().filter((item) => item.id !== entry.id);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...current].slice(0, MAX_RECENT)));
  } catch {
    // اختیاری
  }
}

/**
 * تجمیع مسیرهای اخیر بر اساس فرودگاه‌های موجود و کشورهای مجاز.
 * هیچ‌گاه مسیر خارج از scope برنمی‌گرداند.
 */
export function buildQuickRouteChips() {
  const recent = readRecentRoutes();
  const recentIds = new Set(recent.map((route) => route.id));
  const frequent = FREQUENT_ROUTES.filter((route) => !recentIds.has(route.id));
  return [...recent, ...frequent];
}

/**
 * استخراج فرودگاه‌های scope به تفکیک کشور برای Route Builder.
 * ترتیب: IR → TR → IQ → OM
 */
export function groupAirportsByCountry() {
  const groups = new Map([
    ["IR", []],
    ["TR", []],
    ["IQ", []],
    ["OM", []],
  ]);
  for (const airport of AIRPORTS) {
    const code = airport.country === "Iran" ? "IR"
      : airport.country === "Türkiye" ? "TR"
      : airport.country === "Iraq" ? "IQ"
      : airport.country === "Oman" ? "OM"
      : null;
    if (!code) continue;
    groups.get(code).push(airport);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.iata.localeCompare(b.iata));
  }
  return groups;
}

/**
 * مسیرهای سه‌مرحله‌ای معتبر: مبدأ و مقصد متفاوت، یک نقطهٔ اتصال، همه در scope.
 * برای Route Builder استفاده می‌شود.
 */
export function buildThreeLegSuggestions() {
  const groups = groupAirportsByCountry();
  const suggestions = [];
  const push = (a, b, c) => {
    const iatas = [a, b, b, c];
    if (a === c) return;
    if (!routeInScope(iatas)) return;
    suggestions.push({
      id: `suggest-${a}-${b}-${c}`,
      label: `${a} → ${b} → ${c}`,
      iatas,
      countries: [],
    });
  };
  // فقط ترکیب‌های پرکاربرد: hub استانبول و مسقط.
  for (const origin of ["IKA", "MCT", "BGW"]) {
    for (const hub of ["IST", "SAW", "MCT"]) {
      for (const dest of ["IKA", "MCT", "BGW"]) {
        if (origin === dest) continue;
        const a = airportInScope(origin);
        const b = airportInScope(hub);
        const c = airportInScope(dest);
        if (!a || !b || !c) continue;
        push(origin, hub, dest);
      }
    }
  }
  return suggestions.slice(0, 12);
}
