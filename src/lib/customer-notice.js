import { formatDuration, toPersianDigits } from "./time.js";

const BASE_NOTICE = `اطلاعیه مهم درباره پروازهای کانکشنی

خریدار محترم،

لطفاً پیش از خرید یا صدور بلیت توجه داشته باشید که پروازهای کانکشنی ممکن است تحت تأثیر عواملی از جمله تأخیر یا تغییر برنامه پرواز، حداقل زمان موردنیاز برای اتصال، تغییر ترمینال یا فرودگاه، کنترل‌های امنیتی و مرزی، Immigration، تحویل مجدد بار، نیاز به Check-in مجدد، شرایط بلیت‌های جداگانه و قوانین ایرلاین‌ها و فرودگاه‌ها قرار گیرند.

اطلاعات و ارزیابی ارائه‌شده توسط این سامانه صرفاً جنبه اطلاع‌رسانی و کمک به تصمیم‌گیری دارد و تضمین‌کننده امکان قطعی انجام اتصال یا پذیرش مسافر توسط ایرلاین یا فرودگاه نیست.

خریدار موظف است پیش از نهایی کردن خرید، شرایط بلیت، قوانین ایرلاین‌های مربوطه، الزامات ترانزیت، مدارک موردنیاز، شرایط ورود و خروج و الزامات مربوط به بار را بررسی و از صحت و کفایت زمان اتصال اطمینان حاصل نماید.

در پروازهای دارای بلیت‌های جداگانه یا Self-Transfer، ریسک از دست رفتن پرواز بعدی ممکن است افزایش یابد و حمایت‌های مربوط به یک بلیت واحد لزوماً وجود نداشته باشد.

با خرید بلیت، خریدار اعلام می‌کند هشدارها و محدودیت‌های مربوط به مسیر و اتصال را مطالعه کرده و با آگاهی از شرایط و ریسک‌های احتمالی نسبت به انتخاب و خرید itinerary اقدام می‌نماید.`;

function dynamicParagraphs(input, analysis) {
  const paragraphs = [];
  const { connection, timing } = analysis;

  if (!connection.sameAirport && connection.sameCity) {
    paragraphs.push(
      "توجه: این itinerary شامل تغییر فرودگاه در یک شهر است و مسافر باید زمان، مسیر و امکان جابه‌جایی بین فرودگاه‌ها را شخصاً بررسی نماید.",
    );
  }
  if (!connection.sameAirport && !connection.sameCity) {
    paragraphs.push(
      "توجه: فرودگاه ورود و فرودگاه حرکت پرواز بعدی در دو شهر متفاوت قرار دارند؛ این مورد نیازمند برنامه‌ریزی جداگانه برای جابه‌جایی زمینی و رعایت زمان کافی است.",
    );
  }
  if (input.connection.ticketType === "separate") {
    paragraphs.push(
      "این itinerary شامل بلیت‌های جداگانه است و در صورت از دست رفتن پرواز بعدی، شرایط جبران یا انتقال به پرواز بعدی ممکن است با بلیت یکپارچه متفاوت باشد.",
    );
  }
  if (input.connection.transferType === "self") {
    paragraphs.push(
      "این اتصال از نوع Self-Transfer است و مسئولیت رعایت زمان موردنیاز برای خروج، دریافت بار، انجام تشریفات و Check-in مجدد بر عهده مسافر است.",
    );
  }
  if (input.connection.baggageThrough === "no") {
    paragraphs.push(
      "بر اساس اطلاعات ثبت‌شده، بار تا مقصد نهایی Check-through نمی‌شود؛ مسافر باید بار خود را در محل اتصال دریافت و مجدداً تحویل دهد و زمان لازم برای این فرآیند را در برنامه لحاظ کند.",
    );
  }
  if (input.connection.terminalChange === "yes") {
    paragraphs.push(
      "در محل اتصال تغییر ترمینال وجود دارد؛ زمان و روش جابه‌جایی بین ترمینال‌ها باید پیش از سفر بررسی شود.",
    );
  }
  if (input.connection.immigration === "yes") {
    paragraphs.push(
      "این اتصال نیازمند عبور از کنترل مهاجرت (Immigration) است؛ مدت زمان احتمالی و الزامات مدارک باید با مراجع رسمی تأیید شود.",
    );
  }
  if (input.connection.recheck === "yes") {
    paragraphs.push(
      "پذیرش مجدد (Check-in) در محل اتصال لازم است؛ مهلت بسته شدن کانتر پذیرش ایرلاین بعدی باید جداگانه بررسی شود.",
    );
  }
  if (input.connection.security === "yes") {
    paragraphs.push(
      "بازرسی امنیتی مجدد در محل اتصال لازم است و می‌تواند به زمان موردنیاز برای اتصال اضافه کند.",
    );
  }

  const min = timing.estimatedMinimumMinutes;
  const actual = timing.connectionMinutes;
  if (typeof min === "number" && typeof actual === "number") {
    if (actual < min) {
      paragraphs.push(
        `زمان اتصال این itinerary (${formatDuration(actual)}) کمتر از حداقل برآوردی این سامانه (${formatDuration(min)}) است؛ توصیه می‌شود این مسیر تنها با تأیید رسمی ایرلاین یا فرودگاه نهایی شود.`,
      );
    } else if (actual < min + 30) {
      paragraphs.push(
        `زمان اتصال این itinerary (${formatDuration(actual)}) تنها اندکی بیشتر از حداقل برآوردی این سامانه (${formatDuration(min)}) است؛ حاشیهٔ زمانی محدود را در تصمیم خرید لحاظ کنید.`,
      );
    }
  }

  if (timing.crossesLocalDate) {
    paragraphs.push(
      "این اتصال از نیمه‌شب محلی عبور می‌کند؛ ساعات فعالیت فرودگاه، دسترسی به خدمات و امکان ماندن در محدودهٔ ترانزیت باید پیش از سفر بررسی شود.",
    );
  }

  const finalScore = toPersianDigits(analysis.score);
  const finalLevel = analysis.level.title;
  paragraphs.push(
    `ارزیابی خودکار این سامانه برای این itinerary: «${finalLevel}» با امتیاز ${finalScore} از ۱۰۰. این ارزیابی صرفاً کمک‌کننده است و جایگزین تأیید رسمی نیست.`,
  );

  return paragraphs;
}

export function buildCustomerNotice(input, analysis) {
  const paragraphs = [BASE_NOTICE, ...dynamicParagraphs(input, analysis)];
  return paragraphs.join("\n\n");
}

export const CUSTOMER_NOTICE_BASE = BASE_NOTICE;
