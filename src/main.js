import { COMMON_ROUTES } from "../data/common-routes.js";
import { airportLabel, getAirportByIata, listAirports, resolveAirport } from "./lib/airports.js";
import { copyTextToClipboard } from "./lib/clipboard.js";
import { evaluateConnection, resolveFlightTimes, simulateDelays } from "./lib/risk-engine/engine.js";
import { formatDuration, formatPersianDate, toPersianDigits } from "./lib/time.js";

const HISTORY_KEY = "flight-connection-risk-checker.history.v1";
const MAX_HISTORY_ITEMS = 12;
const form = document.querySelector("#connection-form");
const formErrorSummary = document.querySelector("#form-error-summary");
const formErrorList = document.querySelector("#form-error-list");
const resultPanel = document.querySelector("#result-panel");
const emptyState = document.querySelector("#empty-state");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const historyCount = document.querySelector("#history-count");
const clearHistoryButton = document.querySelector("#clear-history-button");
const toast = document.querySelector("#toast");
let activeInput = null;
let activeAnalysis = null;
let activeCreatedAt = null;
let toastTimer = null;

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultDates() {
  const today = localIsoDate();
  ["#flight1-departure-date", "#flight1-arrival-date", "#flight2-departure-date"].forEach((selector) => {
    const field = document.querySelector(selector);
    if (field && !field.value) field.value = today;
  });
}

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

function initializeRoutePresets() {
  const select = document.querySelector("#route-preset");
  for (const route of COMMON_ROUTES) {
    const option = document.createElement("option");
    option.value = route.id;
    option.textContent = route.label;
    select.append(option);
  }

  select.addEventListener("change", () => {
    const preset = COMMON_ROUTES.find((route) => route.id === select.value);
    if (!preset) return;
    const selectors = ["#flight1-origin", "#flight1-destination", "#flight2-origin", "#flight2-destination"];
    preset.airports.forEach((code, index) => {
      const field = document.querySelector(selectors[index]);
      const airport = getAirportByIata(code);
      if (field && airport) field.value = airportLabel(airport);
    });
    clearFormErrors();
    showToast("فرودگاه‌های مسیر وارد شد؛ زمان و شرایط اتصال را تکمیل کنید.");
  });
}

function valueOf(id) {
  return document.getElementById(id)?.value?.trim() ?? "";
}

function collectFormInput() {
  const errors = [];
  const airportFields = [
    ["flight1-origin", "مبدأ پرواز اول"],
    ["flight1-destination", "فرودگاه ورود پرواز اول"],
    ["flight2-origin", "فرودگاه حرکت پرواز دوم"],
    ["flight2-destination", "مقصد نهایی"],
  ];
  const resolvedAirports = {};

  for (const [id, label] of airportFields) {
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

  const requiredFields = [
    ["flight1-departure-date", "تاریخ خروج پرواز اول"],
    ["flight1-departure-time", "ساعت خروج پرواز اول"],
    ["flight1-arrival-date", "تاریخ ورود پرواز اول"],
    ["flight1-arrival-time", "ساعت ورود پرواز اول"],
    ["flight2-departure-date", "تاریخ خروج پرواز دوم"],
    ["flight2-departure-time", "ساعت خروج پرواز دوم"],
  ];
  for (const [id, label] of requiredFields) {
    const field = document.getElementById(id);
    if (!field.value) errors.push({ field: id, message: `«${label}» را وارد کنید.` });
  }

  const allTimeFieldsPresent = requiredFields.every(([id]) => Boolean(document.getElementById(id).value));
  if (Object.keys(resolvedAirports).length === airportFields.length && allTimeFieldsPresent) {
    const candidate = buildInput(resolvedAirports);
    const timestamps = resolveFlightTimes(candidate);
    if (!timestamps.ok) {
      const linkedField = timestamps.error.includes("ورود")
        ? "flight1-arrival-time"
        : timestamps.error.includes("پرواز دوم")
          ? "flight2-departure-time"
          : "flight1-departure-time";
      errors.push({ field: linkedField, message: timestamps.error });
    }
  }

  return { errors, input: errors.length ? null : buildInput(resolvedAirports) };
}

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
    connection: {
      ticketType: valueOf("ticket-type"),
      baggageThrough: valueOf("baggage-through"),
      recheck: valueOf("recheck"),
      immigration: valueOf("immigration"),
      terminalChange: valueOf("terminal-change"),
      airportChange: valueOf("airport-change"),
      transferType: valueOf("transfer-type"),
      security: valueOf("security"),
    },
  };
}

function clearFormErrors() {
  formErrorSummary.hidden = true;
  formErrorList.replaceChildren();
  form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field-error").forEach((message) => {
    const fieldId = message.dataset.errorFor;
    const field = fieldId ? document.getElementById(fieldId) : null;
    if (field && message.id) {
      const descriptions = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id && id !== message.id);
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
    firstField.scrollIntoView({ behavior: "smooth", block: "center" });
  }
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
  const container = document.querySelector("#route-tags");
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
  for (const tag of tags) appendTextElement(fragment, "span", "route-tag", tag);
  container.replaceChildren(fragment);
}

function renderFactors(analysis) {
  const container = document.querySelector("#factor-list");
  const fragment = document.createDocumentFragment();
  const factors = [...analysis.factors].sort((a, b) => b.points - a.points || a.title.localeCompare(b.title, "fa"));
  for (const factor of factors) {
    const item = document.createElement("li");
    item.className = `factor-item tone-${factor.tone}`;
    const indicator = appendTextElement(item, "span", "factor-indicator", factor.points >= 15 ? "!" : factor.points > 0 ? "·" : "✓");
    indicator.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div");
    copy.className = "factor-copy";
    appendTextElement(copy, "strong", "", factor.title);
    appendTextElement(copy, "span", "factor-description", factor.description);
    item.append(copy);
    if (factor.points > 0) {
      appendTextElement(item, "span", "factor-points", `+${toPersianDigits(factor.points)}`);
    }
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
    const card = document.createElement("article");
    card.className = `delay-card delay-risk-${result.level.id}`;
    const top = document.createElement("div");
    top.className = "delay-card-top";
    appendTextElement(top, "span", "delay-value", `+${toPersianDigits(scenario.delayMinutes)} دقیقه`);
    const badge = appendTextElement(top, "span", `delay-risk-label delay-label-${result.level.id}`, result.level.title);
    badge.setAttribute("aria-label", `سطح ریسک: ${result.level.title}`);
    card.append(top);
    const remaining = document.createElement("div");
    remaining.className = "delay-remaining";
    appendTextElement(remaining, "span", "", "زمان باقی‌مانده");
    const remainingLabel = result.timing.remainingMinutes <= 0
      ? `${formatDuration(0)}${result.timing.remainingMinutes < 0 ? " (پرواز دوم گذشته است)" : ""}`
      : formatDuration(result.timing.remainingMinutes);
    appendTextElement(remaining, "strong", "", remainingLabel);
    card.append(remaining);
    const score = document.createElement("div");
    score.className = "delay-score-row";
    appendTextElement(score, "span", "", "امتیاز سناریو");
    appendTextElement(score, "strong", "", `${toPersianDigits(result.score)} از ۱۰۰`);
    card.append(score);
    appendTextElement(card, "p", "delay-status", delayStatus(result));
    fragment.append(card);
  }
  container.replaceChildren(fragment);
}

function renderAnalysis(input, analysis, createdAt = new Date().toISOString()) {
  activeInput = input;
  activeAnalysis = analysis;
  activeCreatedAt = createdAt;
  resultPanel.hidden = false;
  emptyState.hidden = true;
  const level = analysis.level;
  const score = analysis.score;
  const nowText = formatPersianDate(createdAt, { includeTime: true });
  document.querySelector("#analysis-date").textContent = nowText;
  document.querySelector("#result-date-label").textContent = `تحلیل در ${nowText}`;
  const badge = document.querySelector("#risk-badge");
  badge.className = `risk-badge risk-${level.id}`;
  setText("#risk-level-title", level.title);
  document.querySelector("#risk-summary-card").className = `risk-summary-card risk-card-${level.id}`;
  setText("#score-value", toPersianDigits(score));
  document.querySelector("#score-meter-fill").style.width = `${score}%`;
  document.querySelector("#score-meter").setAttribute("aria-valuenow", String(score));
  setText("#level-explanation", level.explanation);
  setText("#route-summary", makeRouteText(input, analysis));
  renderRouteTags(input, analysis);

  setText("#actual-connection-time", formatDuration(analysis.timing.connectionMinutes));
  setText("#connection-date-context", analysis.timing.crossesLocalDate ? "ورود و حرکت بعدی در تاریخ محلی متفاوت" : "ورود و حرکت بعدی در یک تاریخ محلی");
  setText("#estimated-mct", formatDuration(analysis.timing.estimatedMinimumMinutes));
  const buffer = analysis.timing.connectionMinutes - analysis.timing.estimatedMinimumMinutes;
  setText("#connection-buffer", buffer >= 0 ? `+${formatDuration(buffer)}` : `کمبود ${formatDuration(Math.abs(buffer))}`);
  setText("#connection-buffer-help", buffer >= 0 ? "بیشتر از برآورد داخلی" : "کمتر از برآورد داخلی");
  setText("#analysis-narrative", analysis.narrative.replace(/[0-9]+/g, (match) => toPersianDigits(match)));
  setText("#recommendation-text", analysis.recommendation);
  setText("#model-notice", analysis.notice);
  renderFactors(analysis);
  renderDelays(input);
}

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
    const routeText = item.input?.flight1?.origin && item.input?.flight2?.destination
      ? `${item.input.flight1.origin.cityFa} → ${item.input.flight1.destination.iata}${item.input.flight2.origin.iata !== item.input.flight1.destination.iata ? ` / ${item.input.flight2.origin.iata}` : ""} → ${item.input.flight2.destination.cityFa}`
      : "مسیر ذخیره‌شده";
    appendTextElement(route, "strong", "", routeText);
    appendTextElement(route, "span", "history-date", formatPersianDate(item.createdAt, { includeTime: true }));
    card.append(route);

    const levelId = item.analysis?.level?.id ?? "medium";
    const summary = document.createElement("div");
    summary.className = "history-risk-summary";
    appendTextElement(summary, "span", `history-level history-level-${levelId}`, item.analysis?.level?.title ?? "تحلیل ذخیره‌شده");
    const scoreValue = appendTextElement(summary, "strong", "history-score", toPersianDigits(item.analysis?.score ?? 0));
    appendTextElement(scoreValue, "small", "", " / ۱۰۰");
    card.append(summary);

    const actions = document.createElement("div");
    actions.className = "history-actions";
    const openButton = appendTextElement(actions, "button", "history-open-button", "مشاهده");
    openButton.type = "button";
    openButton.dataset.historyOpen = item.id;
    openButton.setAttribute("aria-label", `مشاهدهٔ تحلیل ${routeText}`);
    const deleteButton = appendTextElement(actions, "button", "history-delete-button", "حذف");
    deleteButton.type = "button";
    deleteButton.dataset.historyDelete = item.id;
    deleteButton.setAttribute("aria-label", `حذف تحلیل ${routeText}`);
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
    "ticket-type": input.connection.ticketType,
    "baggage-through": input.connection.baggageThrough,
    recheck: input.connection.recheck,
    immigration: input.connection.immigration,
    "terminal-change": input.connection.terminalChange,
    "airport-change": input.connection.airportChange,
    "transfer-type": input.connection.transferType,
    security: input.connection.security,
  };
  for (const [id, value] of Object.entries(fields)) {
    const field = document.getElementById(id);
    if (field) field.value = value;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

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
    setText("#copy-feedback", "نتیجه کپی شد.");
    showToast("متن نتیجه کپی شد.");
  } catch {
    setText("#copy-feedback", "کپی خودکار در این مرورگر در دسترس نیست.");
    showToast("کپی خودکار در دسترس نیست؛ دسترسی مرورگر را بررسی کنید.");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFormErrors();
  const { errors, input } = collectFormInput();
  if (errors.length || !input) {
    showFormErrors(errors.length ? errors : [{ message: "اطلاعات کافی برای محاسبهٔ ریسک وجود ندارد." }]);
    return;
  }
  try {
    const analysis = evaluateConnection(input);
    const createdAt = new Date().toISOString();
    renderAnalysis(input, analysis, createdAt);
    saveAnalysis(input, analysis, createdAt);
    setText("#copy-feedback", "");
    resultPanel.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  } catch (error) {
    showFormErrors([{ message: error instanceof Error ? error.message : "اطلاعات کافی برای محاسبهٔ ریسک وجود ندارد." }]);
  }
});

function clearErrorsWhenEdited() {
  if (!formErrorSummary.hidden) clearFormErrors();
}
form.addEventListener("input", clearErrorsWhenEdited);
form.addEventListener("change", clearErrorsWhenEdited);

historyList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
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
      resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
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
document.querySelector("#print-result-button").addEventListener("click", () => window.print());

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const installButton = document.querySelector("#install-button");
  installButton.hidden = false;
});
document.querySelector("#install-button").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  document.querySelector("#install-button").hidden = true;
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      showToast("حالت آفلاین در این مرورگر فعال نشد؛ محاسبهٔ آنلاین همچنان در دسترس است.");
    });
  });
}

initializeAirportOptions();
initializeRoutePresets();
setDefaultDates();
renderHistory();
