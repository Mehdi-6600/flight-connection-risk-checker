import { COMMON_ROUTES } from "../data/common-routes.js";
import { getAirportByIata } from "./lib/airports.js";
import { copyTextToClipboard } from "./lib/clipboard.js";
import { CONNECTION_QUESTIONS, createConnectionAnswers, sanitizeConnectionAnswers } from "./lib/connection-questions.js";
import { buildCustomerNotice } from "./lib/customer-notice.js";
import { evaluateConnection, resolveFlightTimes, simulateDelays } from "./lib/risk-engine/engine.js";
import { ROUTE_TREE, findCity, findCountry } from "./lib/route-builder.js";
import { pushRecentRoute, readRecentRoutes } from "./lib/routes.js";
import { formatDuration, formatPersianDate, toPersianDigits } from "./lib/time.js";

const HISTORY_KEY = "flight-connection-risk-checker.history.v1";
const THEME_KEY = "flight-connection-risk-checker.theme.v1";
const MAX_HISTORY_ITEMS = 12;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const form = document.querySelector("#connection-form");
const formErrorSummary = document.querySelector("#form-error-summary");
const formErrorList = document.querySelector("#form-error-list");
const resultSection = document.querySelector("#result-section");
const resultPanel = document.querySelector("#result-panel");
const analyzeButton = document.querySelector("#analyze-button");
const analyzeButtonText = document.querySelector("#analyze-button-text");
const analyzeButtonLoading = document.querySelector("#analyze-button-loading");
const themeToggle = document.querySelector("#theme-toggle");
const siteHeader = document.querySelector("#site-header");
const frequentRoutesChips = document.querySelector("#frequent-routes-chips");
const recentRoutesSection = document.querySelector("#recent-routes-section");
const recentRoutesChips = document.querySelector("#recent-routes-chips");
const conditionsContainer = document.querySelector("#connection-conditions");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const historyCount = document.querySelector("#history-count");
const clearHistoryButton = document.querySelector("#clear-history-button");
const copyFeedback = document.querySelector("#copy-feedback");
const customerNoticeContainer = document.querySelector("#customer-notice-text");
const copyNoticeButton = document.querySelector("#copy-notice-button");
const noticeFeedback = document.querySelector("#notice-feedback");
const toast = document.querySelector("#toast");

const ICON_PATHS = {
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 6v6l4 2"],
  gauge: ["m12 14 4-4", "M3.34 19a10 10 0 1 1 17.32 0"],
  shield: ["M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"],
  globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M3.6 9h16.8", "M3.6 15h16.8", "M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"],
  eye: ["M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  sun: ["M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42", "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"],
  moon: ["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"],
  calendar: ["M8 2v4M16 2v4", "M3 10h18", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"],
  warning: ["M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z", "M12 9v4", "M12 17h.01"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.35-4.35"],
  chevron: ["m9 18 6-6-6-6"],
};

let connectionAnswers = createConnectionAnswers();
let activeInput = null;
let activeAnalysis = null;
let activeCreatedAt = null;
let activeNotice = "";
let toastTimer = null;

/* ---------- Icons ---------- */

function createIcon(name) {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICON_PATHS[name] ?? []) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function appendTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
  return el;
}

function valueOf(id) {
  return document.getElementById(id)?.value?.trim() ?? "";
}

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---------- Toast / Feedback ---------- */

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function setCopyFeedback(message) {
  copyFeedback.textContent = message ?? "";
  copyFeedback.hidden = !message;
}

function setNoticeFeedback(message) {
  noticeFeedback.textContent = message ?? "";
  noticeFeedback.hidden = !message;
}

/* ---------- Theme ---------- */

function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch { return null; }
}

function storeTheme(theme) {
  try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* optional */ }
}

function applyTheme(theme) {
  document.documentElement.classList.toggle("dark-mode", theme === "dark");
  document.documentElement.classList.toggle("light-mode", theme === "light");
  const isDark = theme === "dark";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", isDark ? "تغییر به حالت روشن" : "تغییر به حالت تاریک");
  themeToggle.replaceChildren(createIcon(isDark ? "moon" : "sun"));
}

function initializeTheme() {
  const stored = readStoredTheme();
  const theme = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(theme);
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.classList.contains("dark-mode") ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
  });
}

/* ---------- Route Builder (Mobile-first Pickers) ---------- */

const LEGS = ["origin", "connection", "destination"];
const state = {
  origin: { country: null, city: null, airport: null },
  connection: { country: null, city: null, airport: null },
  destination: { country: null, city: null, airport: null },
};

const LEG_LABELS = {
  origin: "مبدأ",
  connection: "فرودگاه اتصال",
  destination: "مقصد نهایی",
};

function legTriggerId(leg) {
  return `leg-${leg}-trigger`;
}

function renderLegTrigger(leg) {
  const trigger = document.getElementById(legTriggerId(leg));
  if (!trigger) return;
  const data = state[leg];
  const countryEl = trigger.querySelector(".leg-trigger-country");
  const cityEl = trigger.querySelector(".leg-trigger-city");
  const codeEl = trigger.querySelector(".leg-trigger-code");
  const country = data.country ? findCountry(data.country) : null;
  const city = data.city && country ? findCity(data.country, data.city) : null;

  if (country) {
    countryEl.textContent = `${country.flag} ${country.nameFa}`;
  } else {
    countryEl.textContent = "انتخاب کنید";
  }
  if (city) {
    cityEl.textContent = city.cityFa;
  } else {
    cityEl.textContent = "—";
  }
  if (data.airport) {
    codeEl.textContent = data.airport;
  } else {
    codeEl.textContent = "—";
  }
  trigger.classList.toggle("has-value", Boolean(data.airport));
}

function renderAllLegTriggers() {
  for (const leg of LEGS) renderLegTrigger(leg);
}

/* ---------- Bottom Sheet Picker ---------- */

let activeLeg = null;
let pickerStage = "country"; // "country" | "city" | "airport"
let searchQuery = "";

function openPicker(leg, stage = "country") {
  activeLeg = leg;
  pickerStage = stage;
  searchQuery = "";
  renderPicker();
  const sheet = document.getElementById("picker-sheet");
  const backdrop = document.getElementById("picker-backdrop");
  sheet.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("open"));
  document.body.style.overflow = "hidden";
}

function closePicker() {
  const sheet = document.getElementById("picker-sheet");
  const backdrop = document.getElementById("picker-backdrop");
  sheet.classList.remove("open");
  backdrop.hidden = true;
  document.body.style.overflow = "";
  window.setTimeout(() => {
    sheet.hidden = true;
    activeLeg = null;
  }, 200);
}

function renderPicker() {
  const title = document.getElementById("picker-title");
  const subtitle = document.getElementById("picker-subtitle");
  const list = document.getElementById("picker-list");
  const search = document.getElementById("picker-search");
  const searchWrap = document.getElementById("picker-search-wrap");

  if (!activeLeg) return;

  if (pickerStage === "country") {
    title.textContent = "انتخاب کشور";
    subtitle.textContent = LEG_LABELS[activeLeg];
    searchWrap.hidden = true;
    search.value = "";
  } else if (pickerStage === "city") {
    const country = findCountry(state[activeLeg].country);
    title.textContent = "انتخاب شهر";
    subtitle.textContent = country ? `${country.flag} ${country.nameFa}` : "";
    searchWrap.hidden = false;
    search.value = searchQuery;
    search.placeholder = "جستجوی شهر...";
  } else {
    const country = findCountry(state[activeLeg].country);
    title.textContent = "انتخاب فرودگاه";
    subtitle.textContent = country ? `${country.flag} ${country.nameFa}` : "";
    searchWrap.hidden = false;
    search.value = searchQuery;
    search.placeholder = "جستجوی فرودگاه یا کد IATA...";
  }

  const fragment = document.createDocumentFragment();
  const items = getPickerItems();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "picker-empty";
    empty.textContent = "موردی یافت نشد.";
    fragment.append(empty);
  } else {
    for (const item of items) fragment.append(item);
  }
  list.replaceChildren(fragment);
}

function getPickerItems() {
  if (!activeLeg) return [];
  const legData = state[activeLeg];

  if (pickerStage === "country") {
    return ROUTE_TREE.map((country) => makePickerItem({
      flag: country.flag,
      primary: country.nameFa,
      secondary: `${country.cities.length} شهر`,
      badge: country.code,
      selected: legData.country === country.code,
      onSelect: () => {
        state[activeLeg] = { country: country.code, city: null, airport: null };
        pickerStage = "city";
        searchQuery = "";
        renderPicker();
      },
    }));
  }

  if (pickerStage === "city") {
    const country = findCountry(legData.country);
    if (!country) return [];
    const filtered = filterCities(country.cities, searchQuery);
    return filtered.map((city) => makePickerItem({
      primary: city.cityFa,
      secondary: `${city.airports.length} فرودگاه`,
      badge: city.city,
      selected: legData.city === city.city,
      onSelect: () => {
        state[activeLeg].city = city.city;
        const onlyAirport = city.airports.length === 1 ? city.airports[0].iata : null;
        if (onlyAirport) {
          state[activeLeg].airport = onlyAirport;
          closePicker();
          renderAllLegTriggers();
          updateConnectionTimeline();
        } else {
          pickerStage = "airport";
          searchQuery = "";
          renderPicker();
        }
      },
    }));
  }

  const city = legData.country && legData.city ? findCity(legData.country, legData.city) : null;
  if (!city) return [];
  const filtered = filterAirports(city.airports, searchQuery);
  return filtered.map((airport) => makePickerItem({
    primary: `${airport.iata} — ${airport.nameFa}`,
    secondary: airport.nameEn,
    badge: airport.iata,
    selected: legData.airport === airport.iata,
    onSelect: () => {
      state[activeLeg].airport = airport.iata;
      closePicker();
      renderAllLegTriggers();
      updateConnectionTimeline();
    },
  }));
}

function filterCities(cities, query) {
  if (!query) return cities;
  const q = query.trim().toLowerCase();
  return cities.filter((city) => {
    return (
      city.cityFa.toLowerCase().includes(q) ||
      city.city.toLowerCase().includes(q) ||
      city.airports.some((a) => a.iata.toLowerCase().includes(q))
    );
  });
}

function filterAirports(airports, query) {
  if (!query) return airports;
  const q = query.trim().toLowerCase();
  return airports.filter((airport) => {
    return (
      airport.iata.toLowerCase().includes(q) ||
      airport.icao.toLowerCase().includes(q) ||
      airport.nameFa.toLowerCase().includes(q) ||
      airport.nameEn.toLowerCase().includes(q) ||
      airport.cityFa.toLowerCase().includes(q)
    );
  });
}

function makePickerItem({ flag, primary, secondary, badge, selected, onSelect }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "picker-item";
  if (selected) button.classList.add("selected");

  if (flag) {
    const flagEl = document.createElement("span");
    flagEl.className = "picker-item-flag";
    flagEl.textContent = flag;
    button.append(flagEl);
  }

  const body = document.createElement("div");
  body.className = "picker-item-body";
  appendTextElement(body, "span", "picker-item-primary", primary);
  if (secondary) appendTextElement(body, "span", "picker-item-secondary", secondary);
  button.append(body);

  if (badge) {
    const badgeEl = document.createElement("span");
    badgeEl.className = "picker-item-badge";
    badgeEl.textContent = badge;
    badgeEl.setAttribute("dir", "ltr");
    button.append(badgeEl);
  }

  button.addEventListener("click", onSelect);
  return button;
}

function initializeRouteBuilder() {
  for (const leg of LEGS) {
    const trigger = document.getElementById(legTriggerId(leg));
    if (!trigger) continue;
    trigger.addEventListener("click", () => openPicker(leg, state[leg].country ? (state[leg].city ? "airport" : "city") : "country"));
  }

  const sheet = document.getElementById("picker-sheet");
  const backdrop = document.getElementById("picker-backdrop");
  const closeBtn = document.getElementById("picker-close");
  const backBtn = document.getElementById("picker-back");
  const search = document.getElementById("picker-search");

  closeBtn.addEventListener("click", closePicker);
  backdrop.addEventListener("click", closePicker);

  backBtn.addEventListener("click", () => {
    if (pickerStage === "country") { closePicker(); return; }
    if (pickerStage === "airport") { pickerStage = "city"; searchQuery = ""; renderPicker(); return; }
    if (pickerStage === "city") { pickerStage = "country"; searchQuery = ""; renderPicker(); return; }
  });

  search.addEventListener("input", () => {
    searchQuery = search.value;
    const list = document.getElementById("picker-list");
    const items = getPickerItems();
    const fragment = document.createDocumentFragment();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "picker-empty";
      empty.textContent = "موردی یافت نشد.";
      fragment.append(empty);
    } else {
      for (const item of items) fragment.append(item);
    }
    list.replaceChildren(fragment);
  });
}

function setRouteState(iatas) {
  const [originCode, arrivalCode, departureCode, destinationCode] = iatas;
  const origin = getAirportByIata(originCode);
  const arrival = getAirportByIata(arrivalCode);
  const departure = getAirportByIata(departureCode);
  const destination = getAirportByIata(destinationCode);
  if (!origin || !arrival || !departure || !destination) return;

  state.origin = { country: origin.countryCode, city: origin.city, airport: origin.iata };
  state.connection = { country: arrival.countryCode, city: arrival.city, airport: arrival.iata };
  state.destination = { country: destination.countryCode, city: destination.city, airport: destination.iata };

  renderAllLegTriggers();
  updateConnectionTimeline();
}

/* ---------- Quick Routes ---------- */

function createRouteChip(route) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "route-chip";
  chip.dataset.routeId = route.id;
  const codes = route.iatas.filter((code, i, arr) => i === 0 || code !== arr[i - 1]);
  chip.textContent = codes.join(" → ");
  chip.setAttribute("dir", "ltr");
  return chip;
}

function renderFrequentRoutes() {
  if (!frequentRoutesChips) return;
  const fragment = document.createDocumentFragment();
  for (const route of COMMON_ROUTES) {
    fragment.append(createRouteChip({ id: route.id, iatas: route.airports }));
  }
  frequentRoutesChips.replaceChildren(fragment);
}

function renderRecentRoutes() {
  if (!recentRoutesSection || !recentRoutesChips) return;
  const recent = readRecentRoutes();
  if (!recent.length) {
    recentRoutesSection.hidden = true;
    recentRoutesChips.replaceChildren();
    return;
  }
  recentRoutesSection.hidden = false;
  const fragment = document.createDocumentFragment();
  for (const route of recent) fragment.append(createRouteChip(route));
  recentRoutesChips.replaceChildren(fragment);
}

function handleRouteChipClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const chip = target?.closest(".route-chip");
  if (!chip) return;
  const allRoutes = [
    ...COMMON_ROUTES.map((r) => ({ id: r.id, iatas: r.airports })),
    ...readRecentRoutes(),
  ];
  const preset = allRoutes.find((route) => route.id === chip.dataset.routeId);
  if (!preset) return;
  setRouteState(preset.iatas);
  clearFormErrors();
  showToast("مسیر انتخاب شد. تاریخ و ساعت را وارد کنید.");
}

/* ---------- Conditions ---------- */

function initializeConditions() {
  const fragment = document.createDocumentFragment();
  for (const question of CONNECTION_QUESTIONS) {
    const group = document.createElement("div");
    group.className = "condition-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", question.label);
    appendTextElement(group, "span", "condition-group-label", question.label);

    const chipSet = document.createElement("div");
    chipSet.className = "condition-chip-set";
    for (const option of question.options) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "condition-chip";
      chip.dataset.condition = question.key;
      chip.dataset.value = option.value;
      chip.textContent = option.label;
      chip.setAttribute("aria-pressed", String(connectionAnswers[question.key] === option.value));
      chipSet.append(chip);
    }
    group.append(chipSet);
    appendTextElement(group, "span", "condition-group-help", question.help);
    fragment.append(group);
  }
  conditionsContainer.replaceChildren(fragment);
}

function syncConditionChips() {
  for (const chip of conditionsContainer.querySelectorAll(".condition-chip")) {
    const isSelected = connectionAnswers[chip.dataset.condition] === chip.dataset.value;
    chip.classList.toggle("selected", isSelected);
    chip.setAttribute("aria-pressed", String(isSelected));
  }
}

function setDefaultDates() {
  const today = localIsoDate();
  for (const selector of ["#flight1-departure-date", "#flight1-arrival-date", "#flight2-departure-date"]) {
    const field = document.querySelector(selector);
    if (field && !field.value) field.value = today;
  }
}

/* ---------- Form input ---------- */

const TIME_FIELDS = [
  ["flight1-departure-date", "تاریخ خروج پرواز اول"],
  ["flight1-departure-time", "ساعت خروج پرواز اول"],
  ["flight1-arrival-date", "تاریخ ورود پرواز اول"],
  ["flight1-arrival-time", "ساعت ورود پرواز اول"],
  ["flight2-departure-date", "تاریخ خروج پرواز دوم"],
  ["flight2-departure-time", "ساعت خروج پرواز دوم"],
];

function getLegAirport(leg) {
  const iata = state[leg].airport;
  return iata ? getAirportByIata(iata) : null;
}

function buildInput(origin, connection, destination) {
  return {
    flight1: {
      origin,
      destination: connection,
      departureDate: valueOf("flight1-departure-date"),
      departureTime: valueOf("flight1-departure-time"),
      arrivalDate: valueOf("flight1-arrival-date"),
      arrivalTime: valueOf("flight1-arrival-time"),
      airline: valueOf("flight1-airline"),
      flightNumber: valueOf("flight1-number"),
    },
    flight2: {
      origin: connection,
      destination,
      departureDate: valueOf("flight2-departure-date"),
      departureTime: valueOf("flight2-departure-time"),
      airline: valueOf("flight2-airline"),
      flightNumber: valueOf("flight2-number"),
    },
    connection: { ...connectionAnswers },
  };
}

function collectFormInput() {
  const errors = [];
  const airports = {};

  for (const leg of LEGS) {
    if (!state[leg].country) {
      errors.push({ type: "leg", leg, message: `کشور برای «${LEG_LABELS[leg]}» انتخاب نشده است.` });
      continue;
    }
    if (!state[leg].airport) {
      errors.push({ type: "leg", leg, message: `فرودگاه برای «${LEG_LABELS[leg]}» انتخاب نشده است.` });
      continue;
    }
    airports[leg] = getAirportByIata(state[leg].airport);
  }

  for (const [id, label] of TIME_FIELDS) {
    const field = document.getElementById(id);
    if (!field.value) errors.push({ type: "field", field: id, message: `«${label}» را وارد کنید.` });
  }

  if (Object.keys(airports).length === LEGS.length && !errors.some((e) => e.type === "field")) {
    const input = buildInput(airports.origin, airports.connection, airports.destination);
    const timing = resolveFlightTimes(input);
    if (!timing.ok) errors.push({ type: "field", field: timing.field ?? "flight1-arrival-time", message: timing.error });
  }

  return {
    errors,
    input: errors.length ? null : buildInput(airports.origin, airports.connection, airports.destination),
  };
}

/* ---------- Errors ---------- */

function clearLegError(leg) {
  const errorEl = document.querySelector(`[data-error-for="${leg}"]`);
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }
  const trigger = document.getElementById(legTriggerId(leg));
  if (trigger) trigger.removeAttribute("aria-invalid");
}

function showLegError(leg, message) {
  const errorEl = document.querySelector(`[data-error-for="${leg}"]`);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
  const trigger = document.getElementById(legTriggerId(leg));
  if (trigger) trigger.setAttribute("aria-invalid", "true");
}

function clearFormErrors() {
  formErrorSummary.hidden = true;
  formErrorList.replaceChildren();
  form.querySelectorAll("[aria-invalid='true']").forEach((f) => f.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field-error").forEach((m) => { m.textContent = ""; m.classList.remove("is-visible"); });
  for (const leg of LEGS) clearLegError(leg);
}

function showFormErrors(errors) {
  clearFormErrors();
  const fragment = document.createDocumentFragment();
  let firstField = null;

  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = error.message;
    fragment.append(item);

    if (error.type === "leg") {
      showLegError(error.leg, error.message);
      if (!firstField) firstField = document.getElementById(legTriggerId(error.leg));
    } else if (error.field) {
      const field = document.getElementById(error.field);
      if (field) {
        field.setAttribute("aria-invalid", "true");
        const message = document.querySelector(`[data-error-for="${error.field}"]`);
        if (message) { message.textContent = error.message; message.classList.add("is-visible"); }
        if (!firstField) firstField = field;
      }
    }
  }
  formErrorList.replaceChildren(fragment);
  formErrorSummary.hidden = errors.length === 0;
  if (firstField) firstField.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
}

/* ---------- Timeline preview ---------- */

function updateConnectionTimeline() {
  const arrival = getLegAirport("connection");
  const destination = getLegAirport("destination");
  const origin = getLegAirport("origin");

  setText("#timeline-flight1-destination", arrival ? arrival.iata : "-");
  setText("#timeline-flight2-origin", destination ? destination.iata : "-");
  const depTime = valueOf("flight2-departure-time");
  setText("#timeline-flight2-departure", depTime ? toPersianDigits(depTime) : "--:--");

  let connectionLabel = "--:--";
  if (origin && arrival && destination) {
    const timing = resolveFlightTimes({
      flight1: {
        origin, destination: arrival,
        departureDate: valueOf("flight1-departure-date"),
        departureTime: valueOf("flight1-departure-time"),
        arrivalDate: valueOf("flight1-arrival-date"),
        arrivalTime: valueOf("flight1-arrival-time"),
      },
      flight2: {
        origin: arrival, destination,
        departureDate: valueOf("flight2-departure-date"),
        departureTime: valueOf("flight2-departure-time"),
      },
      connection: connectionAnswers,
    });
    if (timing.ok) connectionLabel = formatDuration(timing.connectionMinutes, { compact: true });
  }
  setText("#timeline-connection-time", connectionLabel);
}

function paintTimeline(levelId) {
  for (const selector of ["#timeline-connector", "#timeline-connector-2"]) {
    const connector = document.querySelector(selector);
    if (!connector) continue;
    connector.classList.remove("risk-low", "risk-medium", "risk-high", "risk-very-high");
    if (levelId) connector.classList.add(`risk-${levelId}`);
  }
}

/* ---------- Result rendering ---------- */

function riskVariant(levelId) {
  return ["low", "medium", "high", "very-high"].includes(levelId) ? levelId : "medium";
}

function makeRouteText(input) {
  const start = `${input.flight1.origin.cityFa} (${input.flight1.origin.iata})`;
  const destination = `${input.flight2.destination.cityFa} (${input.flight2.destination.iata})`;
  const sameAirport = input.flight1.destination.iata === input.flight2.origin.iata;
  const connection = sameAirport
    ? `${input.flight1.destination.cityFa} (${input.flight1.destination.iata})`
    : `${input.flight1.destination.cityFa} (${input.flight1.destination.iata} → ${input.flight2.origin.iata})`;
  return `${start} → ${connection} → ${destination}`;
}

function renderRouteTags(input, analysis) {
  const container = document.querySelector("#route-summary-tags");
  if (!container) return;
  const fragment = document.createDocumentFragment();
  const tags = [
    analysis.connection.sameAirport ? "ورود و خروج از یک فرودگاه"
      : analysis.connection.sameCity ? "دو فرودگاه متفاوت در یک شهر"
      : "تغییر شهر در محل اتصال",
  ];
  if (analysis.timing.crossesLocalDate) tags.push("عبور از تاریخ محلی");
  if (analysis.connection.timezoneOffsetDifferenceMinutes > 0) tags.push("تفاوت منطقهٔ زمانی");
  if (input.connection.ticketType === "separate") tags.push("دو بلیت جداگانه");
  if (input.connection.transferType === "self") tags.push("Self-transfer");
  for (const tag of tags) appendTextElement(fragment, "span", "route-tag", tag);
  container.replaceChildren(fragment);
}

function createStatCard({ icon, tone = "primary", label, value, note }) {
  const card = document.createElement("div");
  card.className = "stat-card";
  const iconWrap = document.createElement("span");
  iconWrap.className = `stat-icon stat-icon-${tone}`;
  iconWrap.append(createIcon(icon));
  const info = document.createElement("div");
  info.className = "stat-info";
  appendTextElement(info, "span", "stat-label", label);
  appendTextElement(info, "span", "stat-value", value);
  if (note) appendTextElement(info, "span", "stat-note", note);
  card.append(iconWrap, info);
  return card;
}

function renderStats(input, analysis) {
  const container = document.querySelector("#connection-stats");
  if (!container) return;
  const buffer = analysis.timing.connectionMinutes - analysis.timing.estimatedMinimumMinutes;
  const offset = analysis.connection.timezoneOffsetDifferenceMinutes;
  const fragment = document.createDocumentFragment();
  fragment.append(
    createStatCard({ icon: "clock", label: "زمان اتصال واقعی", value: formatDuration(analysis.timing.connectionMinutes), note: "با محاسبهٔ منطقهٔ زمانی" }),
    createStatCard({ icon: "gauge", tone: "muted", label: "حداقل برآوردی داخلی", value: formatDuration(analysis.timing.estimatedMinimumMinutes), note: "برآورد داخلی، نه MCT رسمی" }),
    createStatCard({
      icon: buffer >= 0 ? "shield" : "warning",
      tone: buffer >= 0 ? "primary" : "muted",
      label: "حاشیه نسبت به برآورد",
      value: buffer >= 0 ? `+${formatDuration(buffer)}` : `کمبود ${formatDuration(Math.abs(buffer))}`,
      note: buffer >= 0 ? "بیشتر از برآورد" : "کمتر از برآورد",
    }),
    createStatCard({
      icon: offset > 0 ? "globe" : "calendar",
      tone: offset > 0 ? "primary" : "muted",
      label: offset > 0 ? "اختلاف منطقهٔ زمانی" : "تاریخ محلی",
      value: offset > 0 ? formatDuration(offset) : analysis.timing.crossesLocalDate ? "عبور از نیمه‌شب" : "یک تاریخ",
      note: offset > 0 ? "اختلاف ساعت دو فرودگاه" : "ورود و حرکت بعدی",
    }),
  );
  container.replaceChildren(fragment);
}

function factorTone(factor) {
  if (factor.points <= 0) return "success";
  if (factor.tone === "danger" || factor.points >= 15) return "danger";
  if (factor.tone === "caution") return "warning";
  return "neutral";
}

function renderFactors(analysis) {
  const container = document.querySelector("#factor-list");
  if (!container) return;
  const fragment = document.createDocumentFragment();
  const factors = [...analysis.factors].sort((a, b) => b.points - a.points);
  for (const factor of factors) {
    const tone = factorTone(factor);
    const item = document.createElement("div");
    item.className = "factor-item";
    const indicator = appendTextElement(item, "span", `factor-indicator factor-indicator-${tone}`, tone === "danger" || tone === "warning" ? "!" : tone === "success" ? "✓" : "·");
    const content = document.createElement("div");
    content.className = "factor-content";
    appendTextElement(content, "span", "factor-title", factor.title);
    appendTextElement(content, "span", "factor-description", factor.description);
    item.append(content);
    if (factor.points > 0) appendTextElement(item, "span", "factor-points", `+${toPersianDigits(factor.points)}`);
    fragment.append(item);
  }
  container.replaceChildren(fragment);
}

function delayStatus(evaluation) {
  if (evaluation.timing.remainingMinutes <= 0) return "پرواز دوم ممکن است پیش از رسیدن مسافر حرکت کند.";
  if (evaluation.level.id === "low") return "برآورد ریسک پایین؛ تأیید رسمی همچنان لازم است.";
  if (evaluation.level.id === "medium") return "اتصال فشرده‌تر می‌شود؛ شرایط رزرو را بررسی کنید.";
  if (evaluation.level.id === "high") return "اتصال پرریسک است؛ تأیید ایرلاین ضروری است.";
  return "ریسک بسیار بالا؛ احتمال از دست رفتن پرواز بعدی قابل توجه است.";
}

function renderDelays(input) {
  const container = document.querySelector("#delay-grid");
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (const scenario of simulateDelays(input)) {
    const { result } = scenario;
    const variant = riskVariant(result.level.id);
    const card = document.createElement("article");
    card.className = "delay-card";
    const header = document.createElement("div");
    header.className = "delay-card-header";
    appendTextElement(header, "span", "delay-value", `+${toPersianDigits(scenario.delayMinutes)}`);
    appendTextElement(header, "span", "delay-unit", "دقیقه");
    appendTextElement(header, "span", `delay-risk-badge delay-risk-${variant}`, result.level.shortTitle);
    card.append(header);
    const details = document.createElement("div");
    details.className = "delay-details";
    const remainingRow = document.createElement("div");
    remainingRow.className = "delay-detail";
    appendTextElement(remainingRow, "span", "delay-detail-label", "باقی‌مانده");
    appendTextElement(remainingRow, "span", "delay-detail-value",
      result.timing.remainingMinutes <= 0 ? formatDuration(0) : formatDuration(result.timing.remainingMinutes));
    const scoreRow = document.createElement("div");
    scoreRow.className = "delay-detail";
    appendTextElement(scoreRow, "span", "delay-detail-label", "امتیاز");
    appendTextElement(scoreRow, "span", "delay-detail-value", `${toPersianDigits(result.score)}/۱۰۰`);
    details.append(remainingRow, scoreRow);
    card.append(details);
    appendTextElement(card, "p", "delay-status", delayStatus(result));
    fragment.append(card);
  }
  container.replaceChildren(fragment);
}

function renderCustomerNotice(input, analysis) {
  if (!customerNoticeContainer) return;
  const notice = buildCustomerNotice(input, analysis);
  activeNotice = notice;
  const fragment = document.createDocumentFragment();
  for (const paragraph of notice.split("\n\n")) {
    appendTextElement(fragment, "p", "notice-paragraph", paragraph);
  }
  customerNoticeContainer.replaceChildren(fragment);
}

function renderAnalysis(input, analysis, createdAt = new Date().toISOString()) {
  activeInput = input;
  activeAnalysis = analysis;
  activeCreatedAt = createdAt;
  const level = analysis.level;
  const variant = riskVariant(level.id);

  resultSection.hidden = false;
  setText("#result-date", `تحلیل در ${formatPersianDate(createdAt, { includeTime: true })}`);
  document.querySelector("#risk-card").className = `risk-card risk-card-${variant}`;
  document.querySelector("#risk-badge").className = `risk-badge risk-badge-${variant}`;
  setText("#risk-level-text", level.title);
  setText("#risk-score", toPersianDigits(analysis.score));
  const meter = document.querySelector("#risk-meter-fill");
  meter.className = `risk-meter-fill risk-meter-${variant}`;
  meter.style.width = `${analysis.score}%`;
  meter.setAttribute("aria-valuenow", String(analysis.score));
  setText("#risk-level-description", level.explanation);
  setText("#route-summary-path", makeRouteText(input));
  renderRouteTags(input, analysis);
  renderStats(input, analysis);
  setText("#analysis-summary-text", toPersianDigits(analysis.narrative));
  setText("#recommendation-text", analysis.recommendation);
  renderFactors(analysis);
  renderDelays(input);
  renderCustomerNotice(input, analysis);
  updateConnectionTimeline();
  paintTimeline(level.id);
  setCopyFeedback("");
  setNoticeFeedback("");
}

/* ---------- History ---------- */

function safeReadHistory() {
  try {
    const value = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((i) => i && typeof i.id === "string" && i.input && i.analysis).slice(0, MAX_HISTORY_ITEMS);
  } catch { return []; }
}

function safeWriteHistory(items) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
    return true;
  } catch { showToast("ذخیرهٔ محلی در دسترس نیست."); return false; }
}

function saveAnalysis(input, analysis, createdAt) {
  const history = safeReadHistory();
  const record = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt, input, analysis,
  };
  safeWriteHistory([record, ...history.filter((i) => i.id !== record.id)]);
  renderHistory();
}

function historyRouteText(input) {
  if (!input?.flight1?.origin || !input?.flight2?.destination) return "مسیر ذخیره‌شده";
  const start = input.flight1.origin.iata ?? "؟";
  const connection = input.flight2.origin?.iata && input.flight2.origin.iata !== input.flight1.destination?.iata
    ? `${input.flight1.destination?.iata ?? "؟"} / ${input.flight2.origin.iata}`
    : `${input.flight1.destination?.iata ?? "؟"}`;
  return `${start} → ${connection} → ${input.flight2.destination.iata ?? "؟"}`;
}

function renderHistory() {
  const items = safeReadHistory();
  historyCount.textContent = toPersianDigits(items.length);
  clearHistoryButton.hidden = items.length === 0;
  historyEmpty.hidden = items.length > 0;
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "history-card";
    const route = document.createElement("div");
    route.className = "history-route";
    const routeText = historyRouteText(item.input);
    appendTextElement(route, "span", "history-route-path", routeText);
    appendTextElement(route, "span", "history-route-date", formatPersianDate(item.createdAt, { includeTime: true }));
    card.append(route);
    const summary = document.createElement("div");
    summary.className = "history-risk";
    const levelId = item.analysis?.level?.id ?? "medium";
    appendTextElement(summary, "span", `history-risk-badge history-risk-badge-${riskVariant(levelId)}`, item.analysis?.level?.shortTitle ?? "؟");
    appendTextElement(summary, "span", "history-score", `${toPersianDigits(item.analysis?.score ?? 0)}/۱۰۰`);
    card.append(summary);
    const actions = document.createElement("div");
    actions.className = "history-actions";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "history-action-button";
    openBtn.append(createIcon("eye"));
    openBtn.dataset.historyOpen = item.id;
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "history-action-button delete";
    delBtn.append(createIcon("trash"));
    delBtn.dataset.historyDelete = item.id;
    actions.append(openBtn, delBtn);
    card.append(actions);
    fragment.append(card);
  }
  historyList.replaceChildren(fragment);
}

/* ---------- Copy / Print ---------- */

function makeCopyText() {
  if (!activeAnalysis || !activeInput) return "";
  const reasons = activeAnalysis.factors.filter((f) => f.points > 0).slice(0, 5).map((f) => `• ${f.title}`);
  const delays = simulateDelays(activeInput).map((s) => {
    const remaining = s.result.timing.remainingMinutes;
    const label = remaining <= 0 ? "۰ دقیقه" : formatDuration(remaining);
    return `+${toPersianDigits(s.delayMinutes)} دقیقه: ${label} باقی می‌ماند؛ ${s.result.level.title} (${toPersianDigits(s.result.score)}/۱۰۰)`;
  });
  return [
    "بررسی ریسک کانکشن پرواز",
    `تاریخ تحلیل: ${formatPersianDate(activeCreatedAt, { includeTime: true })}`,
    `مسیر: ${makeRouteText(activeInput)}`,
    `زمان اتصال: ${formatDuration(activeAnalysis.timing.connectionMinutes)}`,
    `حداقل زمان برآوردی: ${formatDuration(activeAnalysis.timing.estimatedMinimumMinutes)}`,
    `امتیاز ریسک: ${toPersianDigits(activeAnalysis.score)} از ۱۰۰`,
    `سطح: ${activeAnalysis.level.title}`,
    "دلایل مهم:",
    ...(reasons.length ? reasons : ["• عامل افزایندهٔ مهمی ثبت نشد."]),
    "سناریوی تأخیر:",
    ...delays.map((l) => `• ${l}`),
    `توصیه: ${activeAnalysis.recommendation}`,
    "---- اطلاعیه رسمی مشتری ----",
    activeNotice,
  ].join("\n");
}

async function copyResult() {
  const text = makeCopyText();
  if (!text) return;
  try {
    await copyTextToClipboard(text);
    setCopyFeedback("نتیجه کپی شد.");
    showToast("متن نتیجه کپی شد.");
  } catch {
    setCopyFeedback("کپی خودکار در دسترس نیست.");
    showToast("کپی خودکار در دسترس نیست.");
  }
}

async function copyNotice() {
  if (!activeNotice) { showToast("ابتدا یک تحلیل انجام دهید."); return; }
  try {
    await copyTextToClipboard(activeNotice);
    setNoticeFeedback("اطلاعیه کپی شد.");
    showToast("اطلاعیه رسمی کپی شد.");
  } catch {
    setNoticeFeedback("کپی خودکار در دسترس نیست.");
    showToast("کپی خودکار در دسترس نیست.");
  }
}

/* ---------- Events ---------- */

function setAnalyzing(state) {
  analyzeButton.classList.toggle("loading", state);
  analyzeButton.disabled = state;
  analyzeButtonText.hidden = state;
  analyzeButtonLoading.hidden = !state;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFormErrors();
  const { errors, input } = collectFormInput();
  if (errors.length || !input) {
    showFormErrors(errors.length ? errors : [{ message: "اطلاعات کافی وجود ندارد." }]);
    return;
  }
  setAnalyzing(true);
  window.setTimeout(() => {
    try {
      const analysis = evaluateConnection(input);
      const createdAt = new Date().toISOString();
      renderAnalysis(input, analysis, createdAt);
      saveAnalysis(input, analysis, createdAt);
      const routeIatas = [
        input.flight1.origin.iata,
        input.flight1.destination.iata,
        input.flight2.origin.iata,
        input.flight2.destination.iata,
      ];
      pushRecentRoute({
        id: `recent-${routeIatas.join("-")}`,
        label: `${input.flight1.origin.iata} → ${input.flight1.destination.iata} → ${input.flight2.destination.iata}`,
        iatas: routeIatas,
      });
      renderRecentRoutes();
      resultPanel.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    } catch (error) {
      showFormErrors([{ message: error instanceof Error ? error.message : "خطا در تحلیل." }]);
    } finally {
      setAnalyzing(false);
    }
  }, prefersReducedMotion() ? 0 : 220);
});

form.addEventListener("input", () => { if (!formErrorSummary.hidden) clearFormErrors(); });
form.addEventListener("input", updateConnectionTimeline);

conditionsContainer.addEventListener("click", (event) => {
  const chip = event.target instanceof Element ? event.target.closest(".condition-chip") : null;
  if (!chip) return;
  const key = chip.dataset.condition;
  const value = chip.dataset.value;
  if (!(key in connectionAnswers)) return;
  connectionAnswers = { ...connectionAnswers, [key]: value };
  syncConditionChips();
  updateConnectionTimeline();
});

if (frequentRoutesChips) frequentRoutesChips.addEventListener("click", handleRouteChipClick);
if (recentRoutesChips) recentRoutesChips.addEventListener("click", handleRouteChipClick);

historyList.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const openButton = target.closest("[data-history-open]");
  const deleteButton = target.closest("[data-history-delete]");
  const items = safeReadHistory();
  if (openButton) {
    const record = items.find((item) => item.id === openButton.dataset.historyOpen);
    if (!record) return;
    try {
      const latest = evaluateConnection(record.input);
      const analysis = record.analysis?.modelVersion === latest.modelVersion ? record.analysis : latest;
      setRouteState([
        record.input.flight1.origin.iata,
        record.input.flight1.destination.iata,
        record.input.flight2.origin.iata,
        record.input.flight2.destination.iata,
      ]);
      document.getElementById("flight1-departure-date").value = record.input.flight1.departureDate;
      document.getElementById("flight1-departure-time").value = record.input.flight1.departureTime;
      document.getElementById("flight1-arrival-date").value = record.input.flight1.arrivalDate;
      document.getElementById("flight1-arrival-time").value = record.input.flight1.arrivalTime;
      document.getElementById("flight2-departure-date").value = record.input.flight2.departureDate;
      document.getElementById("flight2-departure-time").value = record.input.flight2.departureTime;
      connectionAnswers = sanitizeConnectionAnswers(record.input.connection);
      syncConditionChips();
      renderAnalysis(record.input, analysis, record.createdAt);
      resultPanel.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    } catch { showToast("این تحلیل دیگر قابل بازخوانی نیست."); }
  }
  if (deleteButton) {
    safeWriteHistory(items.filter((item) => item.id !== deleteButton.dataset.historyDelete));
    renderHistory();
    showToast("تحلیل حذف شد.");
  }
});

clearHistoryButton.addEventListener("click", () => {
  if (!window.confirm("همهٔ تحلیل‌ها حذف شوند؟")) return;
  safeWriteHistory([]);
  renderHistory();
  showToast("تاریخچه پاک شد.");
});

document.querySelector("#copy-result-button").addEventListener("click", copyResult);
document.querySelector("#print-result-button").addEventListener("click", () => {
  if (!activeAnalysis) { showToast("ابتدا یک تحلیل انجام دهید."); return; }
  window.print();
});
if (copyNoticeButton) copyNoticeButton.addEventListener("click", copyNotice);

window.addEventListener("scroll", () => {
  siteHeader.classList.toggle("scrolled", window.scrollY > 8);
}, { passive: true });

/* ---------- Init ---------- */

initializeTheme();
initializeRouteBuilder();
initializeConditions();
setDefaultDates();
renderFrequentRoutes();
renderRecentRoutes();
renderHistory();
renderAllLegTriggers();
updateConnectionTimeline();
