/**
 * تعریف شرایط اتصال که در فرم به‌صورت chips نمایش داده می‌شوند.
 * مقدار هر گزینه دقیقاً همان مقداری است که Risk Engine انتظار دارد؛
 * بنابراین این فایل تنها مرجع نام کلیدها و مقدارهای مجاز است.
 */

export const CONNECTION_QUESTIONS = Object.freeze([
  Object.freeze({
    id: "ticket-type",
    key: "ticketType",
    label: "نوع بلیت",
    help: "یک رزرو پیوسته یا دو بلیت مستقل",
    options: Object.freeze([
      Object.freeze({ value: "one", label: "یک بلیت" }),
      Object.freeze({ value: "separate", label: "دو بلیت جداگانه" }),
      Object.freeze({ value: "unknown", label: "نامشخص" }),
    ]),
  }),
  Object.freeze({
    id: "transfer-type",
    key: "transferType",
    label: "نوع انتقال",
    help: "عبور داخل فرودگاه، خروج و ورود مجدد یا Self-transfer",
    options: Object.freeze([
      Object.freeze({ value: "airside", label: "داخل فرودگاه" }),
      Object.freeze({ value: "landside", label: "خروج و ورود مجدد" }),
      Object.freeze({ value: "self", label: "Self-transfer" }),
      Object.freeze({ value: "unknown", label: "نامشخص" }),
    ]),
  }),
  Object.freeze({
    id: "baggage-through",
    key: "baggageThrough",
    label: "بار تا مقصد",
    help: "آیا بار Check-through می‌شود؟",
    options: Object.freeze([
      Object.freeze({ value: "yes", label: "می‌شود" }),
      Object.freeze({ value: "no", label: "نمی‌شود" }),
      Object.freeze({ value: "unknown", label: "نامشخص" }),
    ]),
  }),
  Object.freeze({
    id: "recheck",
    key: "recheck",
    label: "پذیرش مجدد",
    help: "نیاز به Check-in دوباره",
    options: Object.freeze([
      Object.freeze({ value: "yes", label: "لازم است" }),
      Object.freeze({ value: "no", label: "لازم نیست" }),
      Object.freeze({ value: "unknown", label: "نامشخص" }),
    ]),
  }),
  Object.freeze({
    id: "immigration",
    key: "immigration",
    label: "کنترل مهاجرت",
    help: "عبور از Immigration در محل اتصال",
    options: Object.freeze([
      Object.freeze({ value: "yes", label: "لازم است" }),
      Object.freeze({ value: "no", label: "لازم نیست" }),
      Object.freeze({ value: "unknown", label: "نامشخص" }),
    ]),
  }),
  Object.freeze({
    id: "terminal-change",
    key: "terminalChange",
    label: "تغییر ترمینال",
    help: "جابه‌جایی بین ترمینال‌ها",
    options: Object.freeze([
      Object.freeze({ value: "yes", label: "دارد" }),
      Object.freeze({ value: "no", label: "ندارد" }),
      Object.freeze({ value: "unknown", label: "نامشخص" }),
    ]),
  }),
  Object.freeze({
    id: "airport-change",
    key: "airportChange",
    label: "تغییر فرودگاه",
    help: "اختلاف فرودگاه ورود و حرکت بعدی",
    options: Object.freeze([
      Object.freeze({ value: "yes", label: "دارد" }),
      Object.freeze({ value: "no", label: "ندارد" }),
      Object.freeze({ value: "unknown", label: "نامشخص" }),
    ]),
  }),
  Object.freeze({
    id: "security",
    key: "security",
    label: "بازرسی امنیتی",
    help: "بازرسی امنیتی مجدد در اتصال",
    options: Object.freeze([
      Object.freeze({ value: "yes", label: "دارد" }),
      Object.freeze({ value: "no", label: "ندارد" }),
      Object.freeze({ value: "unknown", label: "نامشخص" }),
    ]),
  }),
]);

export const CONNECTION_KEYS = Object.freeze(CONNECTION_QUESTIONS.map((question) => question.key));

const ALLOWED_VALUES = new Map(
  CONNECTION_QUESTIONS.map((question) => [question.key, new Set(question.options.map((option) => option.value))]),
);

/** پاسخ پیش‌فرض همهٔ شرایط: «نامشخص» تا مدل محافظه‌کارانه عمل کند. */
export function createConnectionAnswers(overrides = {}) {
  const answers = {};
  for (const key of CONNECTION_KEYS) answers[key] = "unknown";
  return sanitizeConnectionAnswers({ ...answers, ...overrides });
}

/**
 * مقدارهای ناشناس (مثلاً خوانده‌شده از تاریخچهٔ قدیمی) را به «unknown» تبدیل می‌کند
 * تا هیچ مقدار غیرمنتظره‌ای به موتور ریسک نرسد.
 */
export function sanitizeConnectionAnswers(value) {
  const source = value && typeof value === "object" ? value : {};
  const answers = {};
  for (const key of CONNECTION_KEYS) {
    const candidate = source[key];
    answers[key] = ALLOWED_VALUES.get(key).has(candidate) ? candidate : "unknown";
  }
  return answers;
}

export function questionLabel(key, value) {
  const question = CONNECTION_QUESTIONS.find((item) => item.key === key);
  if (!question) return "نامشخص";
  return question.options.find((option) => option.value === value)?.label ?? "نامشخص";
}
