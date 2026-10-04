import { AIRPORTS } from "../../data/airports.js";
import { getAirportByIata } from "./airports.js";
import { isMonitoredCountry } from "./monitoring-scope.js";

const RECENT_KEY = "flight-connection-risk-checker.recent-routes.v1";
const MAX_RECENT = 8;

function airportInScope(iata) {
  const airport = getAirportByIata(iata);
  if (!airport) return null;
  if (!isMonitoredCountry(airport.country)) return null;
  return airport;
}

function routeInScope(iatas) {
  if (!Array.isArray(iatas) || iatas.length < 2) return false;
  return iatas.every((code) => airportInScope(code) !== null);
}

export const FREQUENT_ROUTES = Object.freeze([
  Object.freeze({
    id: "ika-ist-mct",
    label: "تهران → استانبول → مسقط",
    iatas: ["IKA", "IST", "IST", "MCT"],
  }),
  Object.freeze({
    id: "ika-ist-saw-mct",
    label: "تهران → استانبول → مسقط (SAW)",
    iatas: ["IKA", "IST", "SAW", "MCT"],
  }),
  Object.freeze({
    id: "ika-ist-bgw",
    label: "تهران → استانبول → بغداد",
    iatas: ["IKA", "IST", "IST", "BGW"],
  }),
  Object.freeze({
    id: "ika-ist-saw-bgw",
    label: "تهران → استانبول → بغداد (SAW)",
    iatas: ["IKA", "IST", "SAW", "BGW"],
  }),
  Object.freeze({
    id: "mct-ist-ika",
    label: "مسقط → استانبول → تهران",
    iatas: ["MCT", "IST", "IST", "IKA"],
  }),
  Object.freeze({
    id: "bgw-ist-mct",
    label: "بغداد → استانبول → مسقط",
    iatas: ["BGW", "IST", "IST", "MCT"],
  }),
]).filter((route) => routeInScope(route.iatas));

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

export function buildQuickRouteChips() {
  const recent = readRecentRoutes();
  const recentIds = new Set(recent.map((route) => route.id));
  const frequent = FREQUENT_ROUTES.filter((route) => !recentIds.has(route.id));
  return [...recent, ...frequent];
}

export function groupAirportsByCountry() {
  const groups = new Map([
    ["IR", []],
    ["TR", []],
    ["IQ", []],
    ["OM", []],
  ]);
  for (const airport of AIRPORTS) {
    const code =
      airport.country === "Iran" ? "IR" :
      airport.country === "Türkiye" ? "TR" :
      airport.country === "Iraq" ? "IQ" :
      airport.country === "Oman" ? "OM" :
      null;
    if (!code) continue;
    groups.get(code).push(airport);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.iata.localeCompare(b.iata));
  }
  return groups;
}
