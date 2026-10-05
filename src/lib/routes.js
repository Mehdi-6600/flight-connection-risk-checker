import { getAirportByIata } from "./airports.js";
import { isMonitoredCountry } from "./monitoring-scope.js";

const RECENT_KEY = "flight-connection-risk-checker.recent-routes.v1";
const MAX_RECENT = 8;

function routeInScope(iatas) {
  if (!Array.isArray(iatas) || iatas.length < 2) return false;
  return iatas.every((code) => {
    const airport = getAirportByIata(code);
    return airport && isMonitoredCountry(airport.country);
  });
}

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
    /* اختیاری */
  }
}
