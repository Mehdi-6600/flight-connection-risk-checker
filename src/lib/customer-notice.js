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

این اطلاعیه صرفاً برای اطلاع‌رسانی و کمک به سفر بدون مشکل تهیه شده است و جایگزین تأیید رسمی ایرلاین، فرودگاه یا مراجع مهاجرتی نیست.
توصیه می‌شود پیش از سفر، جزئیات زمان اتصال، شرایط بلیت، بار، Immigration و ترانزیت را با منابع رسمی تطبیق دهید.`;
}

function dynamicParagraphs(input, analysis) {
  const paragraphs = [];
  const { connection, timing } = analysis;

  if (!connection.sameAirport && connection.sameCity) {
    const a = input.flight1?.destination;
    const b = input.flight2?.origin;
    paragraphs.push(
      `توجه: پرواز دوم از فرودگاه دیگری در همان شهر انجام می‌شود` +
        (a?.iata && b?.iata ? ` (${a.iata} → ${b.iata})` : "") +
        `. مسافر باید زمان و مسیر جابه‌جایی بین دو فرودگاه را از قبل برنامه‌ریزی کند.`,
    );
  }

  if (!connection.sameAirport && !connection.sameCity) {
    const a = input.flight1?.destination;
    const b = input.flight2?.origin;
    paragraphs.push(
      `توجه: فرودگاه ورود و فرودگاه خروج اتصال در دو شهر متفاوت هستند` +
        (a?.cityFa && b?.cityFa ? ` (${a.cityFa} / ${b.cityFa})` : "") +
        `. مسافر باید برای جابه‌جایی زمینی و زمان احتمالی مسیر، برنامه جداگانه داشته باشد.`,
    );
  }

  if (connection.sameAirport) {
    paragraphs.push(
      "نکته: ورود و حرکت پروازها در یک فرودگاه انجام می‌شود؛ مسافر می‌تواند پس از ورود، به ترمینال یا گیت پرواز بعدی مراجعه کند و مراحل امنیتی معمول را انجام دهد.",
    );
  }

  if (input.connection?.ticketType === "separate") {
    paragraphs.push(
      "توجه: این مسیر با بلیت‌های جداگانه تعریف شده است؛ در صورت تأخیر در پرواز اول، پوشش بلیت یکپارچه برای پرواز دوم لزوماً وجود ندارد و مسافر باید شرایط هر بلیت را جداگانه بررسی کند.",
    );
  }

  if (input.connection?.transferType === "self") {
    paragraphs.push(
      "توجه: اتصال از نوع Self-Transfer است؛ دریافت بار، خروج از محدوده ترانزیت، انجام تشریفات و Check-in مجدد بر عهده مسافر است.",
    );
  }

  if (input.connection?.baggageThrough === "no") {
    paragraphs.push(
      "توجه: بار تا مقصد نهایی Check-through نمی‌شود؛ مسافر باید در محل اتصال بار خود را دریافت کند و مجدداً تحویل دهد.",
    );
  }

  if (input.connection?.terminalChange === "yes") {
    paragraphs.push(
      "توجه: در محل اتصال تغییر ترمینال وجود دارد؛ مسافر باید مسیر و زمان جابه‌جایی بین ترمینال‌ها را از قبل بررسی کند.",
    );
  }

  if (input.connection?.immigration === "yes") {
    paragraphs.push(
      "توجه: عبور از Immigration در محل اتصال لازم است؛ مسافر باید مدارک و زمان احتمالی این مرحله را با مراجع رسمی تطبیق دهد.",
    );
  }

  if (input.connection?.recheck === "yes") {
    paragraphs.push(
      "توجه: Check-in مجدد در محل اتصال لازم است؛ مسافر باید مهلت بسته شدن کانتر ایرلاین بعدی را جداگانه چک کند.",
    );
  }

  if (input.connection?.security === "yes") {
    paragraphs.push(
      "توجه: بازرسی امنیتی مجدد در محل اتصال انجام می‌شود؛ مسافر باید این مرحله را در برنامه زمان‌بندی خود لحاظ کند.",
    );
  }

  const min = timing?.estimatedMinimumMinutes;
  const actual = timing?.connectionMinutes;
  if (typeof min === "number" && typeof actual === "number") {
    if (actual < min) {
      paragraphs.push(
        `توجه: زمان در نظر گرفته‌شده برای اتصال (${formatDuration(actual)}) کمتر از حداقل برآوردی سامانه (${formatDuration(min)}) است. مسافر باید پس از ورود، کنترل گذرنامه، دریافت بار (در صورت نیاز)، کنترل امنیتی و جابه‌جایی بین ترمینال‌ها را در کوتاه‌ترین زمان ممکن انجام دهد و شرایط دقیق را با ایرلاین یا فرودگاه تطبیق دهد.`,
      );
    } else if (actual < min + 30) {
      paragraphs.push(
        `توجه: زمان در نظر گرفته‌شده برای اتصال (${formatDuration(actual)}) فقط کمی بیشتر از حداقل برآوردی سامانه (${formatDuration(min)}) است. مسافر باید بلافاصله پس از ورود، تشریفات اتصال را آغاز کند تا امکان رسیدن به پرواز بعدی در زمان مقرر فراهم باشد.`,
      );
    } else {
      paragraphs.push(
        `زمان در نظر گرفته‌شده برای اتصال (${formatDuration(actual)}) از حداقل برآوردی سامانه (${formatDuration(min)}) بیشتر است؛ با رعایت مراحل معمول اتصال، زمان کافی وجود دارد.`,
      );
    }
  }

  if (timing?.crossesLocalDate) {
    paragraphs.push(
      "توجه: این اتصال از نیمه‌شب محلی عبور می‌کند؛ مسافر باید ساعات فعالیت فرودگاه و امکان ماندن در محدوده ترانزیت را از قبل بررسی کند.",
    );
  }

  const score = toPersianDigits(analysis.score);
  const level = analysis.level?.title ?? "—";
  paragraphs.push(
    `نتیجه ارزیابی سامانه برای این مسیر: «${level}» با امتیاز ${score} از ۱۰۰. این ارزیابی صرفاً برای اطلاع‌رسانی و کمک به تصمیم‌گیری است.`,
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
