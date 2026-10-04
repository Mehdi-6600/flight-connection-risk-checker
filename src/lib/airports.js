import { AIRPORTS } from "../../data/airports.js";

const byIata = new Map(AIRPORTS.map((airport) => [airport.iata, airport]));
const byIcao = new Map(AIRPORTS.map((airport) => [airport.icao, airport]));

export function normalizeAirportText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fa-IR")
    .normalize("NFKC")
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ");
}

export function getAirportByIata(code) {
  return byIata.get(String(code ?? "").trim().toUpperCase()) ?? null;
}

export function resolveAirport(value) {
  const original = String(value ?? "").trim();
  if (!original) return { status: "empty", matches: [] };

  const upper = original.toUpperCase();
  const prefixedCode = upper.match(/^([A-Z]{3,4})(?:\b|\s|[·—-])/);
  const candidateCode = prefixedCode?.[1] ?? upper;
  if (candidateCode.length === 3 && byIata.has(candidateCode)) {
    return { status: "matched", airport: byIata.get(candidateCode), matches: [byIata.get(candidateCode)] };
  }
  if (candidateCode.length === 4 && byIcao.has(candidateCode)) {
    return { status: "matched", airport: byIcao.get(candidateCode), matches: [byIcao.get(candidateCode)] };
  }

  const query = normalizeAirportText(original);
  const exactAirports = AIRPORTS.filter((airport) =>
    [airport.nameFa, airport.nameEn, airport.cityFa, airport.city, airport.iata, airport.icao]
      .some((text) => normalizeAirportText(text) === query),
  );
  const unique = [...new Map(exactAirports.map((airport) => [airport.iata, airport])).values()];
  if (unique.length === 1) return { status: "matched", airport: unique[0], matches: unique };
  if (unique.length > 1) return { status: "ambiguous", matches: unique };

  const partialAirports = AIRPORTS.filter((airport) =>
    [airport.nameFa, airport.nameEn, airport.cityFa, airport.city]
      .some((text) => normalizeAirportText(text) === query),
  );
  if (partialAirports.length > 1) return { status: "ambiguous", matches: partialAirports };
  return { status: "invalid", matches: [] };
}

export function airportLabel(airport) {
  return `${airport.iata} — ${airport.nameFa}، ${airport.cityFa}`;
}

export function airportLocationLabel(airport) {
  return `${airport.nameFa} (${airport.iata})، ${airport.cityFa}`;
}

export function sameCity(first, second) {
  return Boolean(
    first &&
      second &&
      first.city === second.city &&
      first.country === second.country,
  );
}

export function listAirports() {
  return AIRPORTS;
}
