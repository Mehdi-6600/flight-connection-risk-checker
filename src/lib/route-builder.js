import { listAirports } from "./airports.js";
import { MONITORED_COUNTRIES } from "./monitoring-scope.js";

export function buildCountryCityAirportTree() {
  const airports = listAirports();
  const byCountry = new Map();

  for (const airport of airports) {
    const countryCode = airport.countryCode;
    if (!countryCode) continue;
    if (!byCountry.has(countryCode)) {
      byCountry.set(countryCode, {
        code: countryCode,
        nameFa: airport.countryFa,
        cities: new Map(),
      });
    }
    const country = byCountry.get(countryCode);
    const cityKey = airport.city;
    if (!country.cities.has(cityKey)) {
      country.cities.set(cityKey, {
        city: airport.city,
        cityFa: airport.cityFa,
        airports: [],
      });
    }
    country.cities.get(cityKey).airports.push(airport);
  }

  const order = new Map(MONITORED_COUNTRIES.map((c, i) => [c.code, i]));
  return [...byCountry.values()]
    .sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99))
    .map((country) => ({
      ...country,
      cities: [...country.cities.values()]
        .map((city) => ({
          ...city,
          airports: [...city.airports].sort((a, b) => a.iata.localeCompare(b.iata)),
        }))
        .sort((a, b) => a.cityFa.localeCompare(b.cityFa, "fa")),
    }));
}

export const ROUTE_TREE = buildCountryCityAirportTree();

export function findCountry(code) {
  return ROUTE_TREE.find((country) => country.code === code) ?? null;
}

export function findCity(countryCode, cityName) {
  const country = findCountry(countryCode);
  if (!country) return null;
  return country.cities.find((city) => city.city === cityName) ?? null;
}
