import { COMMON_ROUTES } from "../data/common-routes.js";
import { airportLabel, getAirportByIata, listAirports, resolveAirport } from "./lib/airports.js";
import { copyTextToClipboard } from "./lib/clipboard.js";
import { CONNECTION_QUESTIONS, createConnectionAnswers, sanitizeConnectionAnswers } from "./lib/connection-questions.js";
import { evaluateConnection, resolveFlightTimes, simulateDelays } from "./lib/risk-engine/engine.js";
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
const emptyResult = document.querySelector("#empty-result");
const analyzeButton = document.querySelector("#analyze-button");
const analyzeButtonText = document.querySelector("#analyze-button-text");
const analyzeButtonLoading = document.querySelector("#analyze-button-loading");
const themeToggle = document.querySelector("#theme-toggle");
const siteHeader = document.querySelector("#site-header");
const quickRoutesCarousel = document.querySelector("#quick-routes-carousel");
const conditionsContainer = document.querySelector("#connection-conditions");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const historyCount = document.querySelector("#history-count");
const clearHistoryButton = document.querySelector("#clear-history-button");
const copyFeedback = document.querySelector("#copy-feedback");
const toast = document.querySelector("#toast");

const ICON_PATHS = Object.freeze({
  plane: ["m21 3-7.2 18-3.4-7.4L3 10.2 21 3Z"],
  arrow: ["M5 12h14", "m12 5 7 7-7 7"],
  info: ["M12 16v-4", "M12 8h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
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
});

let connectionAnswers = createConnectionAnswers();
let activeInput = null;
let activeAnalysis = null;
let activeCreatedAt = null;
let toastTimer = null;
let secondOriginMirrored = false;

/* ---------- ابزارهای عمومی DOM ---------- */

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
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
  return element;
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

/* ---------- پیام و اعلان ---------- */

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function setCopyFeedback(message) {
  copyFeedback.textContent = message ?? "";
  copyFeedback.hidden = !message;
}

/* ---------- تم روشن/تاریک ---------- */

function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ذخیرهٔ تم اختیاری است؛ نبود دسترسی به localStorage مانع کار برنامه نمی‌شود.
  }
}

function applyTheme(theme) {
  document.documentElement.classList.toggle("dark-mode", theme === "dark");
  document.documentElement.classList.toggle("light-mode", theme === "light");
  const isDark = theme === "dark";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", isDark ? "تغییر به حالت روشن" : "تغییر به حالت تاریک");
  themeToggle.setAttribute("title", isDark ? "حالت روشن" : "حالت تاریک");
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

/* ---------- مقداردهی اولیهٔ فرم ---------- */

function initializeAirportOptions() {
  const datalist = document.querySelector("#airport-options");
  const fragment = document.createDocumentFragment();
  for (const airport of listAirports()) {
    const option = document.createElement("option");
    option.value = airportLabel(airport);
    option.label = `${airport.iata} · ${airport.nameFa} · ${airport.cityFa}، ${airport.countryFa}`;
    fragment.append(option);
  }
  datalist.replaceChildren(fragment);
}

function initializeQuickRoutes() {
  const fragment = document.createDocumentFragment();
  for (const route of COMMON_ROUTES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "quick-route-card";
    card.dataset.routeId = route.id;

    const header = document.createElement("div");
    header.className = "quick-route-card-header";
    const icon = document.createElement("span");
    icon.className = "quick-route-icon";
    icon.append(createIcon("plane"));
    header.append(icon);
    appendTextElement(header, "span", "quick-route-name", route.label);

    const path = document.createElement("div");
    path.className = "quick-route-path";
    path.append(createIcon("arrow"));
    appendTextElement(path, "span", "", route.airports.join(" → "));

    const time = document.createElement("div");
    time.className = "quick-route-time";
    time.append(createIcon("info"));
    appendTextElement(time, "span", "", "فقط فرودگاه‌ها پر می‌شوند");

    card.append(header, path, time);
    fragment.append(card);
  }
  quickRoutesCarousel.replaceChildren(fragment);
}

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

/* ---------- جمع‌آوری و اعتبارسنجی ورودی ---------- */

const AIRPORT_FIELDS = Object.freeze([
  ["flight1-origin", "مبدأ پرواز اول"],
  ["flight1-destination", "فرودگاه ورود پرواز اول"],
  ["flight2-origin", "فرودگاه حرکت پرواز دوم"],
  ["flight2-destination", "مقصد نهایی"],
]);

const REQUIRED_FIELDS = Object.freeze([
  ["flight1-departure-date", "تاریخ خروج پرواز اول"],
  ["flight1-departure-time", "ساعت خروج پرواز اول"],
  ["flight1-arrival-date", "تاریخ ورود پرواز اول"],
  ["flight1-arrival-time", "ساعت ورود پرواز اول"],
  ["flight2-departure-date", "تاریخ خروج پرواز دوم"],
  ["flight2-departure-time", "ساعت خروج پرواز دوم"],
]);

function buildInput(airports) {
  return {
    flight1: {
      origin: airports["flight1-origin"],
      destination: airports["flight1-destination"],
      departureDate: valueOf("flight1-departure-date"),
      departureTime: valueOf("flight1-departure-time"),
      arrivalDate: valueOf("flight1-arrival-date"),
      arrivalTime: valueOf("flight1-arrival-time"),
      airline: valueOf("flight1-airline"),
      flightNumber: valueOf("flight1-number"),
    },
    flight2: {
      origin: airports["flight2-origin"],
      destination: airports["flight2-destination"],
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
  const resolvedAirports = {};

  for (const [id, label] of AIRPORT_FIELDS) {
    const field = document.getElementById(id);
    const resolution = resolveAirport(field.value);
    if (resolution.status === "empty") {
      errors.push({ field: id, message: `«${label}» را وارد کنید.` });
    } else if (resolution.status === "ambiguous") {
      errors.push({ field: id, message: `برای «${label}» چند فرودگاه پیدا شد؛ کد IATA را از پیشنهادها انتخاب کنید.` });
    } else if (resolution.status !== "matched") {
      errors.push({ field: id, message: `«${label}» در فهرست داخلی پیدا نشد؛ کد IATA/ICAO یا نام دقیق فرودگاه را وارد کنید.` });
    } else {
      resolvedAirports[id] = resolution.airport;
    }
  }

  for (const [id, label] of REQUIRED_FIELDS) {
    const field = document.getElementById(id);
    if (!field.value) errors.push({ field: id, message: `«${label}» را وارد کنید.` });
  }

  const allTimeFieldsPresent = REQUIRED_FIELDS.every(([id]) => Boolean(document.getElementById(id).value));
  if (Object.keys(resolvedAirports).length === AIRPORT_FIELDS.length && allTimeFieldsPresent) {
    const timestamps = resolveFlightTimes(buildInput(resolvedAirports));
    if (!timestamps.ok) {
      errors.push({ field: timestamps.field ?? "flight1-arrival-time", message: timestamps.error });
    }
  }

  return { errors, input: errors.length ? null : buildInput(resolvedAirports) };
}

function clearFormErrors() {
  formErrorSummary.hidden = true;
  formErrorList.replaceChildren();
  form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field-error").forEach((message) => {
    const fieldId = message.dataset.errorFor;
    const field = fieldId ? document.getElementById(fieldId) : null;
    if (field && message.id) {
      const descriptions = (field.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter((id) => id && id !== message.id);
      if (descriptions.length) field.setAttribute("aria-describedby", descriptions.join(" "));
      else field.removeAttribute("aria-describedby");
    }
    message.textContent = "";
    message.classList.remove("is-visible");
  });
}

function showFormErrors(errors) {
  clearFormErrors();
  const fragment = document.createDocumentFragment();
  let firstField = null;
  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = error.message;
    fragment.append(item);
    if (!error.field) continue;
    const field = document.getElementById(error.field);
    if (field) {
      field.setAttribute("aria-invalid", "true");
      const message = document.querySelector(`[data-error-for="${error.field}"]`);
      if (message) {
        message.id = `${error.field}-error`;
        message.textContent = error.message;
        message.classList.add("is-visible");
        const descriptions = new Set((field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
        descriptions.add(message.id);
        field.setAttribute("aria-describedby", [...descriptions].join(" "));
      }
      firstField ??= field;
    }
  }
  formErrorList.replaceChildren(fragment);
  formErrorSummary.hidden = errors.length === 0;
  if (firstField) {
    firstField.focus({ preventScroll: true });
    firstField.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  }
}

/* ---------- پیش‌نمایش زندهٔ اتصال ---------- */

function updateConnectionTimeline() {
  const arrival = resolveAirport(valueOf("flight1-destination"));
  const departure = resolveAirport(valueOf("flight2-origin"));
  const arrivalCode = arrival.status === "matched" ? arrival.airport.iata : "-";
  const departureCode = departure.status === "matched" ? departure.airport.iata : "-";
  setText("#timeline-flight1-destination", arrivalCode);
  setText("#timeline-flight2-origin", departureCode);
  const departureTime = valueOf("flight2-departure-time");
  setText("#timeline-flight2-departure", departureTime ? toPersianDigits(departureTime) : "--:--");

  let connectionLabel = "--:--";
  if (arrival.status === "matched" && departure.status === "matched") {
    const timing = resolveFlightTimes({
      flight1: {
        origin: arrival.airport,
        destination: arrival.airport,
        departureDate: valueOf("flight1-departure-date"),
        departureTime: valueOf("flight1-departure-time"),
        arrivalDate: valueOf("flight1-arrival-date"),
        arrivalTime: valueOf("flight1-arrival-time"),
      },
      flight2: {
        origin: departure.airport,
        destination: departure.airport,
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

/* ---------- رندر نتیجه ---------- */

function riskVariant(levelId) {
  return ["low", "medium", "high", "very-high"].includes(levelId) ? levelId : "medium";
}

function makeRouteText(input, analysis) {
  const start = `${input.flight1.origin.cityFa} (${input.flight1.origin.iata})`;
  const destination = `${input.flight2.destination.cityFa} (${input.flight2.destination.iata})`;
  const connection = analysis.connection.sameAirport
    ? `${input.flight1.destination.cityFa} (${input.flight1.destination.iata})`
    : `${input.flight1.destination.cityFa} (${input.flight1.destination.iata} → ${input.flight2.origin.iata})`;
  return `${start} → ${connection} → ${destination}`;
}

function renderRouteTags(input, analysis) {
  const container = document.querySelector("#route-summary-tags");
  const fragment = document.createDocumentFragment();
  const tags = [
    analysis.connection.sameAirport
      ? "ورود و خروج از یک فرودگاه"
      : analysis.connection.sameCity
        ? "دو فرودگاه متفاوت در یک شهر"
        : "تغییر شهر در محل اتصال",
  ];
  if (analysis.timing.crossesLocalDate) tags.push("عبور از تاریخ محلی");
  if (analysis.connection.timezoneOffsetDifferenceMinutes > 0) tags.push("تفاوت منطقهٔ زمانی در جابه‌جایی");
  if (input.connection.ticketType === "separate") tags.push("دو بلیت جداگانه");
  if (input.connection.transferType === "self") tags.push("Self-transfer");
  if (analysis.timing.ambiguousTimes) tags.push("ساعت تکراری در تغییر ساعت فصلی");
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
  const buffer = analysis.timing.connectionMinutes - analysis.timing.estimatedMinimumMinutes;
  const offset = analysis.connection.timezoneOffsetDifferenceMinutes;
  const fragment = document.createDocumentFragment();
  fragment.append(
    createStatCard({
      icon: "clock",
      label: "زمان اتصال واقعی",
      value: formatDuration(analysis.timing.connectionMinutes),
      note: "با محاسبهٔ منطقهٔ زمانی هر فرودگاه",
    }),
    createStatCard({
      icon: "gauge",
      tone: "muted",
      label: "حداقل برآوردی داخلی",
      value: formatDuration(analysis.timing.estimatedMinimumMinutes),
      note: "برآورد داخلی، نه MCT رسمی",
    }),
    createStatCard({
      icon: buffer >= 0 ? "shield" : "warning",
      tone: buffer >= 0 ? "primary" : "muted",
      label: "حاشیه نسبت به برآورد",
      value: buffer >= 0 ? `+${formatDuration(buffer)}` : `کمبود ${formatDuration(Math.abs(buffer))}`,
      note: buffer >= 0 ? "بیشتر از برآورد داخلی" : "کمتر از برآورد داخلی",
    }),
    createStatCard({
      icon: offset > 0 ? "globe" : "calendar",
      tone: offset > 0 ? "primary" : "muted",
      label: offset > 0 ? "اختلاف منطقهٔ زمانی" : "تاریخ محلی",
      value: offset > 0 ? formatDuration(offset) : analysis.timing.crossesLocalDate ? "عبور از نیمه‌شب" : "یک تاریخ محلی",
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
  const fragment = document.createDocumentFragment();
  const factors = [...analysis.factors].sort((a, b) => b.points - a.points || a.title.localeCompare(b.title, "fa"));
  for (const factor of factors) {
    const tone = factorTone(factor);
    const item = document.createElement("div");
    item.className = "factor-item";
    const indicator = appendTextElement(item, "span", `factor-indicator factor-indicator-${tone}`, tone === "danger" ? "!" : tone === "warning" ? "!" : tone === "success" ? "✓" : "·");
    indicator.setAttribute("aria-hidden", "true");
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
  if (evaluation.timing.remainingMinutes <= 0) return "زمان باقی‌مانده صفر یا منفی است؛ پرواز دوم ممکن است پیش از رسیدن مسافر حرکت کند.";
  if (evaluation.level.id === "low") return "برآورد ریسک پایین؛ تأیید رسمی همچنان لازم است.";
  if (evaluation.level.id === "medium") return "اتصال فشرده‌تر می‌شود؛ شرایط رزرو و MCT را بررسی کنید.";
  if (evaluation.level.id === "high") return "اتصال پرریسک است؛ تأیید ایرلاین/فرودگاه ضروری است.";
  return "ریسک بسیار بالا؛ احتمال از دست رفتن پرواز بعدی قابل توجه است.";
}

function renderDelays(input) {
  const container = document.querySelector("#delay-grid");
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
    const badge = appendTextElement(header, "span", `delay-risk-badge delay-risk-${variant}`, result.level.shortTitle);
    badge.setAttribute("aria-label", `سطح ریسک: ${result.level.title}`);
    card.append(header);

    const details = document.createElement("div");
    details.className = "delay-details";
    const remainingRow = document.createElement("div");
    remainingRow.className = "delay-detail";
    appendTextElement(remainingRow, "span", "delay-detail-label", "زمان باقی‌مانده");
    appendTextElement(
      remainingRow,
      "span",
      "delay-detail-value",
      result.timing.remainingMinutes <= 0
        ? `${formatDuration(0)}${result.timing.remainingMinutes < 0 ? " (گذشته)" : ""}`
        : formatDuration(result.timing.remainingMinutes),
    );
    const scoreRow = document.createElement("div");
    scoreRow.className = "delay-detail";
    appendTextElement(scoreRow, "span", "delay-detail-label", "امتیاز سناریو");
    appendTextElement(scoreRow, "span", "delay-detail-value", `${toPersianDigits(result.score)} از ۱۰۰`);
    details.append(remainingRow, scoreRow);
    card.append(details);
    appendTextElement(card, "p", "delay-status", delayStatus(result));
    fragment.append(card);
  }
  container.replaceChildren(fragment);
}

function renderAnalysis(input, analysis, createdAt = new Date().toISOString()) {
  activeInput = input;
  activeAnalysis = analysis;
  activeCreatedAt = createdAt;

  const level = analysis.level;
  const variant = riskVariant(level.id);

  resultSection.hidden = false;
  emptyResult.hidden = true;
  emptyResult.setAttribute("aria-hidden", "true");

  setText("#result-date", `تحلیل در ${formatPersianDate(createdAt, { includeTime: true })}`);
  document.querySelector("#risk-card").className = `risk-card risk-card-${variant}`;
  document.querySelector("#risk-badge").className = `risk-badge risk-badge-${variant}`;
  setText("#risk-level-text", level.title);
  document.querySelector("#risk-icon").className = `risk-icon risk-icon-${variant}`;
  setText("#risk-score", toPersianDigits(analysis.score));
  const meter = document.querySelector("#risk-meter-fill");
  meter.className = `risk-meter-fill risk-meter-${variant}`;
  meter.style.width = `${analysis.score}%`;
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-valuenow", String(analysis.score));
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");
  meter.setAttribute("aria-label", `امتیاز ریسک: ${analysis.score} از ۱۰۰`);
  setText("#risk-level-description", level.explanation);

  setText("#route-summary-path", makeRouteText(input, analysis));
  renderRouteTags(input, analysis);
  renderStats(input, analysis);
  setText("#analysis-summary-text", toPersianDigits(analysis.narrative));
  setText("#recommendation-text", analysis.recommendation);
  renderFactors(analysis);
  renderDelays(input);
  updateConnectionTimeline();
  paintTimeline(level.id);
  setCopyFeedback("");
}

/* ---------- تاریخچه ---------- */

function safeReadHistory() {
  try {
    const value = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.id === "string" && item.input && item.analysis).slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function safeWriteHistory(items) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
    return true;
  } catch {
    showToast("ذخیرهٔ محلی در این مرورگر در دسترس نیست؛ نتیجه فعلاً فقط روی صفحه دیده می‌شود.");
    return false;
  }
}

function saveAnalysis(input, analysis, createdAt) {
  const history = safeReadHistory();
  const record = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt,
    input,
    analysis,
  };
  safeWriteHistory([record, ...history.filter((item) => item.id !== record.id)]);
  renderHistory();
}

function historyRouteText(input) {
  if (!input?.flight1?.origin || !input?.flight2?.destination) return "مسیر ذخیره‌شده";
  const start = input.flight1.origin.iata ?? "؟";
  const connection =
    input.flight2.origin?.iata && input.flight2.origin.iata !== input.flight1.destination?.iata
      ? `${input.flight1.destination?.iata ?? "؟"} / ${input.flight2.origin.iata}`
      : `${input.flight1.destination?.iata ?? "؟"}`;
  return `${start} → ${connection} → ${input.flight2.destination.iata ?? "؟"}`;
}

function createHistoryActionButton({ icon, label, className }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.append(createIcon(icon));
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  return button;
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

    const levelId = item.analysis?.level?.id ?? "medium";
    const summary = document.createElement("div");
    summary.className = "history-risk";
    appendTextElement(
      summary,
      "span",
      `history-risk-badge history-risk-badge-${riskVariant(levelId)}`,
      item.analysis?.level?.shortTitle ?? "؟",
    );
    appendTextElement(summary, "span", "history-score", `${toPersianDigits(item.analysis?.score ?? 0)}/۱۰۰`);
    card.append(summary);

    const actions = document.createElement("div");
    actions.className = "history-actions";
    const openButton = createHistoryActionButton({
      icon: "eye",
      label: `مشاهدهٔ تحلیل ${routeText}`,
      className: "history-action-button",
    });
    openButton.dataset.historyOpen = item.id;
    const deleteButton = createHistoryActionButton({
      icon: "trash",
      label: `حذف تحلیل ${routeText}`,
      className: "history-action-button delete",
    });
    deleteButton.dataset.historyDelete = item.id;
    actions.append(openButton, deleteButton);
    card.append(actions);

    fragment.append(card);
  }
  historyList.replaceChildren(fragment);
}

function restoreInput(input) {
  const fields = {
    "flight1-origin": input.flight1.origin.iata,
    "flight1-destination": input.flight1.destination.iata,
    "flight1-departure-date": input.flight1.departureDate,
    "flight1-departure-time": input.flight1.departureTime,
    "flight1-arrival-date": input.flight1.arrivalDate,
    "flight1-arrival-time": input.flight1.arrivalTime,
    "flight1-airline": input.flight1.airline ?? "",
    "flight1-number": input.flight1.flightNumber ?? "",
    "flight2-origin": input.flight2.origin.iata,
    "flight2-destination": input.flight2.destination.iata,
    "flight2-departure-date": input.flight2.departureDate,
    "flight2-departure-time": input.flight2.departureTime,
    "flight2-airline": input.flight2.airline ?? "",
    "flight2-number": input.flight2.flightNumber ?? "",
  };
  for (const [id, value] of Object.entries(fields)) {
    const field = document.getElementById(id);
    if (field) field.value = value;
  }
  connectionAnswers = sanitizeConnectionAnswers(input.connection);
  syncConditionChips();
  secondOriginMirrored = false;
  updateConnectionTimeline();
}

/* ---------- کپی و چاپ ---------- */

function makeCopyText() {
  const analysis = activeAnalysis;
  const input = activeInput;
  if (!analysis || !input) return "";
  const reasons = analysis.factors
    .filter((factor) => factor.points > 0)
    .slice(0, 5)
    .map((factor) => `• ${factor.title}`);
  const delays = simulateDelays(input).map((scenario) => {
    const remaining = scenario.result.timing.remainingMinutes;
    const remainingLabel = remaining <= 0 ? "۰ دقیقه" : formatDuration(remaining);
    return `+${toPersianDigits(scenario.delayMinutes)} دقیقه: ${remainingLabel} باقی می‌ماند؛ ${scenario.result.level.title} (${toPersianDigits(scenario.result.score)}/۱۰۰)`;
  });
  return [
    "بررسی ریسک کانکشن پرواز",
    `تاریخ تحلیل: ${formatPersianDate(activeCreatedAt, { includeTime: true })}`,
    `مسیر: ${makeRouteText(input, analysis)}`,
    `زمان اتصال: ${formatDuration(analysis.timing.connectionMinutes)}`,
    `حداقل زمان برآوردی داخلی: ${formatDuration(analysis.timing.estimatedMinimumMinutes)}`,
    `امتیاز ریسک: ${toPersianDigits(analysis.score)} از ۱۰۰`,
    `سطح: ${analysis.level.title}`,
    "دلایل مهم:",
    ...(reasons.length ? reasons : ["• عامل افزایندهٔ مهمی ثبت نشد؛ MCT همچنان برآورد داخلی است."]),
    "سناریوی تأخیر پرواز اول:",
    ...delays.map((line) => `• ${line}`),
    `توصیه: ${analysis.recommendation}`,
    analysis.notice,
    "بررسی نهایی باید با قوانین رسمی ایرلاین و فرودگاه انجام شود.",
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
    setCopyFeedback("کپی خودکار در این مرورگر در دسترس نیست.");
    showToast("کپی خودکار در دسترس نیست؛ دسترسی مرورگر را بررسی کنید.");
  }
}

/* ---------- رویدادها ---------- */

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
    showFormErrors(errors.length ? errors : [{ message: "اطلاعات کافی برای محاسبهٔ ریسک وجود ندارد." }]);
    return;
  }
  setAnalyzing(true);
  window.setTimeout(() => {
    try {
      const analysis = evaluateConnection(input);
      const createdAt = new Date().toISOString();
      renderAnalysis(input, analysis, createdAt);
      saveAnalysis(input, analysis, createdAt);
      resultPanel.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    } catch (error) {
      showFormErrors([{ message: error instanceof Error ? error.message : "اطلاعات کافی برای محاسبهٔ ریسک وجود ندارد." }]);
    } finally {
      setAnalyzing(false);
    }
  }, prefersReducedMotion() ? 0 : 220);
});

function clearErrorsWhenEdited() {
  if (!formErrorSummary.hidden) clearFormErrors();
}
form.addEventListener("input", clearErrorsWhenEdited);
form.addEventListener("change", clearErrorsWhenEdited);
form.addEventListener("input", updateConnectionTimeline);

conditionsContainer.addEventListener("click", (event) => {
  const chip = event.target instanceof Element ? event.target.closest(".condition-chip") : null;
  if (!chip) return;
  const key = chip.dataset.condition;
  const value = chip.dataset.value;
  if (!(key in connectionAnswers)) return;
  connectionAnswers = { ...connectionAnswers, [key]: value };
  syncConditionChips();
});

document.querySelector("#flight1-destination").addEventListener("change", () => {
  const arrival = resolveAirport(valueOf("flight1-destination"));
  if (arrival.status !== "matched") return;
  const secondOrigin = document.getElementById("flight2-origin");
  if (!secondOrigin) return;
  const shouldMirror = !secondOrigin.value || secondOriginMirrored;
  if (!shouldMirror) return;
  secondOrigin.value = airportLabel(arrival.airport);
  secondOriginMirrored = true;
  updateConnectionTimeline();
});

document.querySelector("#flight2-origin").addEventListener("input", () => {
  secondOriginMirrored = false;
});

quickRoutesCarousel.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const card = target?.closest(".quick-route-card");
  if (!card) return;
  const preset = COMMON_ROUTES.find((route) => route.id === card.dataset.routeId);
  if (!preset) return;
  const selectors = ["#flight1-origin", "#flight1-destination", "#flight2-origin", "#flight2-destination"];
  preset.airports.forEach((code, index) => {
    const field = document.querySelector(selectors[index]);
    const airport = getAirportByIata(code);
    if (field && airport) field.value = airportLabel(airport);
  });
  secondOriginMirrored = true;
  clearFormErrors();
  updateConnectionTimeline();
  showToast("فرودگاه‌های مسیر وارد شد؛ زمان و شرایط اتصال را تکمیل کنید.");
});

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
      restoreInput(record.input);
      renderAnalysis(record.input, analysis, record.createdAt);
      resultPanel.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    } catch {
      showToast("این تحلیل دیگر قابل بازخوانی نیست؛ اطلاعات آن را دوباره وارد کنید.");
    }
  }

  if (deleteButton) {
    safeWriteHistory(items.filter((item) => item.id !== deleteButton.dataset.historyDelete));
    renderHistory();
    showToast("تحلیل از تاریخچهٔ همین دستگاه حذف شد.");
  }
});

clearHistoryButton.addEventListener("click", () => {
  if (!window.confirm("همهٔ تحلیل‌های ذخیره‌شده روی این دستگاه حذف شوند؟")) return;
  safeWriteHistory([]);
  renderHistory();
  showToast("تاریخچه پاک شد.");
});

document.querySelector("#copy-result-button").addEventListener("click", copyResult);
document.querySelector("#print-result-button").addEventListener("click", () => {
  if (!activeAnalysis) {
    showToast("ابتدا یک تحلیل انجام دهید تا نتیجه قابل چاپ باشد.");
    return;
  }
  window.print();
});

window.addEventListener("scroll", () => {
  siteHeader.classList.toggle("scrolled", window.scrollY > 8);
}, { passive: true });

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelector("#install-button").hidden = false;
});
document.querySelector("#install-button").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  document.querySelector("#install-button").hidden = true;
});

if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      showToast("حالت آفلاین در این مرورگر فعال نشد؛ محاسبهٔ آنلاین همچنان در دسترس است.");
    });
  });
}

/* ---------- راه‌اندازی ---------- */

initializeTheme();
emptyResult.setAttribute("aria-hidden", "false");
initializeAirportOptions();
initializeQuickRoutes();
initializeConditions();
setDefaultDates();
renderHistory();
updateConnectionTimeline();
