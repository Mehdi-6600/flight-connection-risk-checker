import { formatDuration, toPersianDigits } from "./time.js";

function airportLine(airport) {
  if (!airport) return "—";
  const name = airport.nameFa || airport.nameEn || "";
  const city = airport.cityFa || airport.city || "";
  const country = airport.countryFa || airport.country || "";
  const parts = [
    airport.iata ? `${airport.iata}` : null,
    name || null,
    city || null,
    country || null,
  ].filter(Boolean);
  return parts.join(" — ");
}

function routeSummary(input) {
  const origin = input.flight1?.origin;
  const viaIn = input.flight1?.destination;
  const viaOut = input.flight2?.origin;
  const dest = input.flight2?.destination;

  const sameConnectionAirport =
    viaIn?.iata && viaOut?.iata && viaIn.iata === viaOut.iata;

  const lines = [
    `مسیر مورد بررسی:`,
    `• مبدأ: ${airportLine(origin)}`,
    sameConnectionAirport
      ? `• اتصال: ${airportLine(viaIn)}`
      : `• ورود به اتصال: ${airportLine(viaIn)}\n• خروج از اتصال: ${airportLine(viaOut)}`,
    `• مقصد نهایی: ${airportLine(dest)}`,
  ];

  return lines.join("\n");
}

function shortBaseNotice() {
  return `خریدار محترم،

این اطلاعیه مربوط به همان مسیر و فرودگاه‌هایی است که در مشخصات پرواز ثبت شده‌اند.
ارزیابی سامانه فقط کمک به تصمیم‌گیری است و جایگزین تأیید رسمی ایرلاین، فرودگاه یا مراجع مهاجرتی نیست.
پیش از خرید یا صدور بلیت، زمان اتصال، قوانین بلیت، بار، Immigration و شرایط ترانزیت را از منابع رسمی بررسی کنید.`;
}

function dynamicParagraphs(input, analysis) {
  const paragraphs = [];
  const { connection, timing } = analysis;

  if (!connection.sameAirport && connection.sameCity) {
    const a = input.flight1?.destination;
    const b = input.flight2?.origin;
    paragraphs.push(
      `توجه: در محل اتصال تغییر فرودگاه در یک شهر وجود دارد` +
        (a?.iata && b?.iata ? ` (${a.iata} → ${b.iata})` : "") +
        `. زمان و امکان جابه‌جایی بین این دو فرودگاه را شخصاً بررسی کنید.`,
    );
  }

  if (!connection.sameAirport && !connection.sameCity) {
    const a = input.flight1?.destination;
    const b = input.flight2?.origin;
    paragraphs.push(
      `توجه: فرودگاه ورود و خروج اتصال در دو شهر متفاوت هستند` +
        (a?.cityFa && b?.cityFa ? ` (${a.cityFa} / ${b.cityFa})` : "") +
        `. برای جابه‌جایی زمینی برنامه جداگانه لازم است.`,
    );
  }

  if (input.connection?.ticketType === "separate") {
    paragraphs.push(
      "این مسیر با بلیت‌های جداگانه تعریف شده است؛ در صورت از دست رفتن پرواز بعدی، حمایت‌های بلیت یکپارچه لزوماً اعمال نمی‌شود.",
    );
  }

  if (input.connection?.transferType === "self") {
    paragraphs.push(
      "اتصال از نوع Self-Transfer است؛ خروج، دریافت بار، تشریفات و Check-in مجدد بر عهده مسافر است.",
    );
  }

  if (input.connection?.baggageThrough === "no") {
    paragraphs.push(
      "بار تا مقصد نهایی Check-through نمی‌شود؛ در محل اتصال باید بار دریافت و دوباره تحویل شود.",
    );
  }

  if (input.connection?.terminalChange === "yes") {
    paragraphs.push(
      "در محل اتصال تغییر ترمینال ثبت شده است؛ زمان و روش جابه‌جایی بین ترمینال‌ها را بررسی کنید.",
    );
  }

  if (input.connection?.immigration === "yes") {
    paragraphs.push(
      "عبور از Immigration در محل اتصال لازم است؛ مدارک و زمان احتمالی را با مراجع رسمی تطبیق دهید.",
    );
  }

  if (input.connection?.recheck === "yes") {
    paragraphs.push(
      "Check-in مجدد در محل اتصال لازم است؛ مهلت بسته شدن کانتر ایرلاین بعدی را جداگانه چک کنید.",
    );
  }

  if (input.connection?.security === "yes") {
    paragraphs.push(
      "بازرسی امنیتی مجدد در محل اتصال لازم است و می‌تواند به زمان اتصال اضافه کند.",
    );
  }

  const min = timing?.estimatedMinimumMinutes;
  const actual = timing?.connectionMinutes;
  if (typeof min === "number" && typeof actual === "number") {
    if (actual < min) {
      paragraphs.push(
        `زمان اتصال (${formatDuration(actual)}) کمتر از حداقل برآوردی سامانه (${formatDuration(min)}) است؛ فقط با تأیید رسمی نهایی کنید.`,
      );
    } else if (actual < min + 30) {
      paragraphs.push(
        `زمان اتصال (${formatDuration(actual)}) تنها کمی بیشتر از حداقل برآوردی (${formatDuration(min)}) است؛ حاشیه زمانی محدود است.`,
      );
    }
  }

  if (timing?.crossesLocalDate) {
    paragraphs.push(
      "این اتصال از نیمه‌شب محلی عبور می‌کند؛ ساعات فعالیت فرودگاه و امکان ماندن در محدوده ترانزیت را بررسی کنید.",
    );
  }

  const score = toPersianDigits(analysis.score);
  const level = analysis.level?.title ?? "—";
  paragraphs.push(
    `نتیجه ارزیابی این مسیر: «${level}» با امتیاز ${score} از ۱۰۰. این نتیجه صرفاً کمکی است و تضمین اتصال نیست.`,
  );

  return paragraphs;
}

export function buildCustomerNotice(input, analysis) {
  const parts = [
    "اطلاعیه مهم برای خریدار بلیت",
    routeSummary(input),
    shortBaseNotice(),
    ...dynamicParagraphs(input, analysis),
  ];
  return parts.join("\n\n");
}

export const CUSTOMER_NOTICE_BASE = shortBaseNotice();
