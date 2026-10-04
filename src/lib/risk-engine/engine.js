import { airportLocalDate, airportLocalToUtc, timezoneOffsetMinutes } from "../time.js";
import { airportLocationLabel, sameCity } from "../airports.js";
import { RISK_MODEL_NOTICE, RISK_RULES } from "./risk-rules.js";

const VALUE_LABELS = Object.freeze({
  one: "یک بلیت / یک رزرو",
  separate: "دو بلیت جداگانه",
  unknown: "نامشخص",
  yes: "بله",
  no: "خیر",
  airside: "ترانزیت داخل فرودگاه",
  landside: "خروج و ورود مجدد",
  self: "Self-transfer",
});

function addFactor(factors, key, title, points, description, tone = "neutral") {
  factors.push({ key, title, points, description, tone });
}

function makeLocalTimestamp(date, time, airport, label) {
  const result = airportLocalToUtc(date, time, airport.timezone);
  if (!result.ok) {
    return { error: `${label}: ${result.reason}` };
  }
  return { timestamp: result.timestamp, ambiguous: result.ambiguous };
}

export function resolveFlightTimes(input) {
  const departures = makeLocalTimestamp(
    input.flight1.departureDate,
    input.flight1.departureTime,
    input.flight1.origin,
    "زمان خروج پرواز اول",
  );
  if (departures.error) return { ok: false, error: departures.error };

  const arrivals = makeLocalTimestamp(
    input.flight1.arrivalDate,
    input.flight1.arrivalTime,
    input.flight1.destination,
    "زمان ورود پرواز اول",
  );
  if (arrivals.error) return { ok: false, error: arrivals.error };

  const secondDeparture = makeLocalTimestamp(
    input.flight2.departureDate,
    input.flight2.departureTime,
    input.flight2.origin,
    "زمان خروج پرواز دوم",
  );
  if (secondDeparture.error) return { ok: false, error: secondDeparture.error };

  if (arrivals.timestamp <= departures.timestamp) {
    return { ok: false, error: "زمان ورود پرواز اول باید بعد از زمان خروج همان پرواز باشد." };
  }
  if (secondDeparture.timestamp < arrivals.timestamp) {
    return { ok: false, error: "زمان پرواز دوم باید بعد از زمان ورود پرواز اول باشد." };
  }

  return {
    ok: true,
    flight1DepartureUtc: departures.timestamp,
    flight1ArrivalUtc: arrivals.timestamp,
    flight2DepartureUtc: secondDeparture.timestamp,
    connectionMinutes: Math.round((secondDeparture.timestamp - arrivals.timestamp) / 60_000),
    flight1DurationMinutes: Math.round((arrivals.timestamp - departures.timestamp) / 60_000),
    ambiguousTimes: [departures, arrivals, secondDeparture].some((time) => time.ambiguous),
    arrivalLocalDate: airportLocalDate(arrivals.timestamp, input.flight1.destination.timezone),
    arrivalAtDepartureAirportLocalDate: airportLocalDate(arrivals.timestamp, input.flight2.origin.timezone),
    nextDepartureLocalDate: airportLocalDate(secondDeparture.timestamp, input.flight2.origin.timezone),
    crossesLocalDate:
      airportLocalDate(arrivals.timestamp, input.flight2.origin.timezone) !==
      airportLocalDate(secondDeparture.timestamp, input.flight2.origin.timezone),
  };
}

function estimateMinimumMinutes(input, connection) {
  const { mctMinutes } = RISK_RULES;
  let minutes;

  if (!connection.sameAirport) {
    minutes = connection.sameCity
      ? mctMinutes.sameCityAirportChange
      : mctMinutes.differentCityAirportChange;
  } else if (input.connection.transferType === "self" || input.connection.ticketType === "separate") {
    minutes = mctMinutes.separateTicketOrSelfTransfer;
  } else if (input.connection.transferType === "landside") {
    minutes = mctMinutes.landside;
  } else if (input.connection.transferType === "airside" && input.connection.ticketType === "one") {
    minutes = mctMinutes.sameAirportAirsideSingleTicket;
  } else {
    minutes = mctMinutes.sameAirportAirsideUnclear;
  }

  const add = (value, yesPoints, unknownPoints) => {
    if (value === "yes") minutes += yesPoints;
    else if (value === "unknown") minutes += unknownPoints;
  };
  add(input.connection.immigration, mctMinutes.immigrationYes, mctMinutes.immigrationUnknown);
  add(input.connection.terminalChange, mctMinutes.terminalChangeYes, mctMinutes.terminalChangeUnknown);
  const baggageRecheck = input.connection.baggageThrough === "no"
    ? "yes"
    : input.connection.baggageThrough === "yes"
      ? "no"
      : "unknown";
  add(baggageRecheck, mctMinutes.baggageRecheckYes, mctMinutes.baggageUnknown);
  add(input.connection.recheck, mctMinutes.checkInYes, mctMinutes.checkInUnknown);
  add(input.connection.security, mctMinutes.securityYes, mctMinutes.securityUnknown);
  return minutes;
}

function timePenalty(remainingMinutes, estimatedMctMinutes) {
  if (remainingMinutes <= 0) return { points: 100, title: "زمان اتصال", description: "زمان باقی‌مانده برای رسیدن به پرواز بعدی وجود ندارد." };
  const band = RISK_RULES.timePenaltyBands.find((item) => remainingMinutes < item.belowMinutes);
  if (band) {
    return {
      points: band.points,
      title: "فاصله اتصال",
      description: `فاصلهٔ مؤثر ${band.label} است؛ برای طی مراحل اتصال حاشیهٔ کمی باقی می‌ماند.`,
    };
  }
  const relative = RISK_RULES.relativeTimePenalty;
  if (remainingMinutes < estimatedMctMinutes) {
    return {
      points: relative.belowEstimatedMct,
      title: "فاصله نسبت به برآورد MCT",
      description: "زمان باقی‌مانده از حداقل زمان اتصالِ برآوردشده کمتر است.",
    };
  }
  if (remainingMinutes < estimatedMctMinutes + RISK_RULES.timeThresholds.mctMarginMinutes.limited) {
    return {
      points: relative.belowMctPlus30,
      title: "حاشیهٔ زمانی محدود",
      description: "زمان فقط کمی از حداقل زمان اتصالِ برآوردشده بیشتر است.",
    };
  }
  if (remainingMinutes < estimatedMctMinutes + RISK_RULES.timeThresholds.mctMarginMinutes.modest) {
    return {
      points: relative.belowMctPlus60,
      title: "حاشیهٔ زمانی قابل‌توجه نیست",
      description: "فاصله از برآورد داخلی بیشتر است، اما حاشیهٔ یک‌ساعته ندارد.",
    };
  }
  return {
    points: 0,
    title: "فاصله اتصال",
    description: "زمان از برآورد داخلی اتصال بیشتر است؛ این موضوع تضمین رسمی ایجاد نمی‌کند.",
  };
}

function scoreLevel(score) {
  return RISK_RULES.levels.find((level) => score >= level.min && score <= level.max) ?? RISK_RULES.levels.at(-1);
}

function normalizedAirline(value) {
  return String(value ?? "").trim().toLocaleLowerCase("fa-IR").replace(/[\s\-_.]/g, "");
}

function makeFactorList(input, connection, timing, estimatedMctMinutes) {
  const points = RISK_RULES.factorPoints;
  const factors = [];
  addFactor(
    factors,
    "mct-estimate",
    "برآورد غیررسمی زمان اتصال",
    points.baseEstimateUncertainty,
    "برای این مسیر دادهٔ رسمی MCT در این ابزار موجود نیست؛ امتیاز با قاعدهٔ محافظه‌کارانه محاسبه شده است.",
    "caution",
  );

  const timeResult = timePenalty(timing.connectionMinutes - timing.delayMinutes, estimatedMctMinutes);
  addFactor(factors, "time", timeResult.title, timeResult.points, timeResult.description, timeResult.points >= 40 ? "danger" : timeResult.points >= 15 ? "caution" : "neutral");

  if (!connection.sameAirport) {
    const airportPoints = connection.sameCity ? points.sameCityAirportChange : points.differentCityAirportChange;
    addFactor(
      factors,
      "airport-change",
      connection.sameCity ? "تغییر فرودگاه در یک شهر" : "اختلاف فرودگاه و شهر اتصال",
      airportPoints,
      connection.sameCity
        ? `ورود در ${connection.arrivalAirport.iata} و پرواز بعدی از ${connection.departureAirport.iata} است؛ جابه‌جایی زمینی بین دو فرودگاه لازم می‌شود.`
        : `فرودگاه ورود (${connection.arrivalAirport.cityFa}) و مبدأ پرواز بعدی (${connection.departureAirport.cityFa}) در یک شهر نیستند.`,
      "danger",
    );
    if (input.connection.airportChange === "no") {
      addFactor(factors, "airport-answer-conflict", "مغایرت در پاسخ تغییر فرودگاه", points.contradictoryAirportAnswer, "کدهای فرودگاه ورود و حرکت متفاوت‌اند، اما در فرم تغییر فرودگاه «خیر» انتخاب شده است؛ تشخیص خودکار بر اساس کدها اعمال شد.", "caution");
    }
  } else if (input.connection.airportChange === "yes") {
    addFactor(factors, "airport-answer-conflict", "مغایرت در پاسخ تغییر فرودگاه", points.contradictoryAirportAnswer, "کدهای واردشده یکسان‌اند، اما در فرم تغییر فرودگاه «بله» انتخاب شده است.", "caution");
  }

  if (input.connection.ticketType === "separate") {
    addFactor(factors, "separate-ticket", "دو بلیت جداگانه", points.separateTicket, "در بلیت‌های جداگانه، حمایت در صورت تأخیر و پذیرش مجدد می‌تواند تابع شرایط هر بلیت باشد.", "danger");
  } else if (input.connection.ticketType === "unknown") {
    addFactor(factors, "ticket-unknown", "نوع بلیت نامشخص", points.ticketUnknown, "مشخص نیست دو پرواز در یک رزرو هستند یا بلیت جداگانه دارند.", "caution");
  }

  if (input.connection.transferType === "self") {
    addFactor(factors, "self-transfer", "اتصال از نوع Self-transfer", points.selfTransfer, "ممکن است مسافر نیاز به دریافت بار، خروج از محدودهٔ ترانزیت و پذیرش مجدد داشته باشد.", "danger");
  } else if (input.connection.transferType === "landside") {
    addFactor(factors, "landside", "خروج و ورود مجدد (Landside)", points.landside, "خروج از محدودهٔ ترانزیت و ورود دوباره می‌تواند مراحل بیشتری ایجاد کند.", "caution");
  } else if (input.connection.transferType === "unknown") {
    addFactor(factors, "transfer-unknown", "نوع اتصال نامشخص", points.transferUnknown, "شرایط Airside یا Landside برای این itinerary مشخص نشده است.", "caution");
  }

  const addAnswerFactor = (key, title, value, yesPoints, unknownPoints, yesDescription, unknownDescription) => {
    if (value === "yes") addFactor(factors, key, title, yesPoints, yesDescription, "caution");
    else if (value === "unknown") addFactor(factors, `${key}-unknown`, `${title} نامشخص`, unknownPoints, unknownDescription, "caution");
  };

  const baggageRecheck = input.connection.baggageThrough === "no"
    ? "yes"
    : input.connection.baggageThrough === "yes"
      ? "no"
      : "unknown";
  addAnswerFactor("baggage", "تحویل مجدد بار", baggageRecheck, points.baggageRecheck, points.baggageUnknown, "بار تا مقصد نهایی Check-through نمی‌شود و ممکن است دریافت و تحویل مجدد لازم باشد.", "وضعیت انتقال بار مشخص نیست؛ الزام تحویل مجدد می‌تواند زمان‌بر باشد.");
  addAnswerFactor("check-in", "پذیرش مجدد", input.connection.recheck, points.checkInRequired, points.checkInUnknown, "مسافر باید دوباره پذیرش شود؛ مهلت بسته‌شدن کانتر باید جداگانه بررسی شود.", "نیاز به پذیرش مجدد مشخص نشده است.");
  addAnswerFactor("immigration", "کنترل مهاجرت", input.connection.immigration, points.immigrationRequired, points.immigrationUnknown, "عبور از Immigration می‌تواند به زمان اتصال اضافه کند و به تابعیت/قوانین مسیر وابسته است.", "نیاز به عبور از Immigration تأیید نشده است.");
  addAnswerFactor("terminal", "تغییر ترمینال", input.connection.terminalChange, points.terminalChange, points.terminalUnknown, "تغییر ترمینال ممکن است نیازمند جابه‌جایی یا بازرسی دوباره باشد.", "نیاز به تغییر ترمینال مشخص نیست.");
  addAnswerFactor("security", "بازرسی امنیتی مجدد", input.connection.security, points.securityRecheck, points.securityUnknown, "بازرسی امنیتی مجدد به مراحل اتصال اضافه می‌شود.", "نیاز به بازرسی امنیتی مجدد مشخص نشده است.");

  const airline1 = normalizedAirline(input.flight1.airline);
  const airline2 = normalizedAirline(input.flight2.airline);
  if (airline1 && airline2 && airline1 !== airline2) {
    addFactor(factors, "airline-difference", "ایرلاین‌های متفاوت طبق اطلاعات فرم", points.airlineDifferent, `ایرلاین‌ها در فرم «${input.flight1.airline.trim()}» و «${input.flight2.airline.trim()}» ثبت شده‌اند؛ هماهنگی پذیرش/بار را بررسی کنید.`, "caution");
  } else if (!airline1 || !airline2) {
    addFactor(factors, "airline-unknown", "اطلاعات ایرلاین کامل نیست", points.airlineUnknown, "نام هر دو ایرلاین ثبت نشده است؛ همکاری بین ایرلاین‌ها از این ابزار قابل تأیید نیست.", "caution");
  }

  if (timing.ambiguousTimes) {
    addFactor(factors, "dst-ambiguous-time", "ساعت محلی تکراری در تغییر ساعت فصلی", points.ambiguousLocalTime, "حداقل یکی از ساعت‌های ورودی در بازهٔ تکراری DST قرار دارد؛ برای محاسبه، رخداد زودتر انتخاب شده است. زمان را با بلیت/ایرلاین تطبیق دهید.", "caution");
  }

  const crossesLocalDate = timing.crossesLocalDate;
  if (crossesLocalDate) {
    addFactor(factors, "overnight", "عبور اتصال از نیمه‌شب", points.overnightConnection, "تاریخ محلی ورود و حرکت بعدی متفاوت است؛ ساعات فعالیت و امکان ماندن در محدودهٔ ترانزیت را بررسی کنید.", "caution");
  }
  if (timing.connectionMinutes >= RISK_RULES.timeThresholds.longLayoverMinutes.veryLong) {
    addFactor(factors, "long-layover", "توقف طولانی", points.longLayover24Hours, "توقف ۲۴ ساعته یا بیشتر ممکن است نیازمند بررسی اقامت، دسترسی به محدودهٔ ترانزیت و قوانین ورود باشد.", "caution");
  } else if (timing.connectionMinutes >= RISK_RULES.timeThresholds.longLayoverMinutes.extended) {
    addFactor(factors, "long-layover", "توقف بیش از ۱۲ ساعت", points.longLayover12Hours, "برای توقف طولانی، ساعت فعالیت فرودگاه و امکان ماندن در محدودهٔ ترانزیت را تأیید کنید.", "caution");
  }

  const flightNumberMissing = Number(!String(input.flight1.flightNumber ?? "").trim()) + Number(!String(input.flight2.flightNumber ?? "").trim());
  if (flightNumberMissing) {
    addFactor(factors, "flight-number-missing", "شماره پرواز کامل نیست", points.missingFlightNumber * flightNumberMissing, "شمارهٔ پروازها ثبت نشده است؛ تطبیق ترمینال، زمان‌بندی و شرایط رزرو باید با اطلاعات بلیت انجام شود.", "neutral");
  }

  return factors;
}

function buildNarrative(input, connection, timing, estimatedMctMinutes, level) {
  const remaining = timing.connectionMinutes - timing.delayMinutes;
  const sentences = [];

  if (!connection.sameAirport) {
    const place = connection.sameCity ? "دو فرودگاه متفاوت در یک شهر" : "دو فرودگاه در دو شهر متفاوت";
    sentences.push(
      `پرواز ورودی در ${airportLocationLabel(connection.arrivalAirport)} فرود می‌آید، اما پرواز بعدی از ${airportLocationLabel(connection.departureAirport)} انجام می‌شود. این وضعیت ${place} را در بر می‌گیرد و جابه‌جایی زمینی/زمان مسیر باید جداگانه بررسی شود.`,
    );
  } else {
    sentences.push(`هر دو پرواز در ${airportLocationLabel(connection.arrivalAirport)} به هم می‌رسند.`);
  }

  if (timing.delayMinutes > 0) {
    sentences.push(`با فرض ${timing.delayMinutes} دقیقه تأخیر در پرواز اول، ${remaining <= 0 ? "زمان اتصال باقی نمی‌ماند" : `حدود ${remaining} دقیقه`} تا حرکت پرواز دوم می‌ماند.`);
  } else {
    sentences.push(`فاصلهٔ واقعی میان ورود و حرکت، با محاسبهٔ منطقهٔ زمانی هر فرودگاه، ${timing.connectionMinutes} دقیقه است.`);
  }

  if (remaining < estimatedMctMinutes) {
    sentences.push(`این فاصله از برآورد داخلی ${estimatedMctMinutes} دقیقه‌ای برای شرایط ثبت‌شده کمتر است.`);
  } else {
    sentences.push(`برآورد داخلیِ محافظه‌کارانه برای شرایط ثبت‌شده ${estimatedMctMinutes} دقیقه است؛ عبور از این برآورد، امکان ترانزیت را تضمین نمی‌کند.`);
  }

  if (input.connection.ticketType === "separate") {
    sentences.push("چون بلیت‌ها جداگانه‌اند، مسئولیت و راهکار در صورت تأخیر ممکن است با یک رزرو یکسان نباشد.");
  }
  if (input.connection.transferType === "self") {
    sentences.push("Self-transfer اعلام شده است؛ الزامات دریافت بار، خروج، پذیرش و کنترل‌های مرزی را از مراجع رسمی تأیید کنید.");
  }
  if (level.id === "low") {
    sentences.push("با داده‌های فعلی، ریسک پایین ارزیابی می‌شود؛ پیش از نهایی‌کردن فروش، قوانین رسمی ایرلاین و فرودگاه همچنان باید بررسی شوند.");
  } else if (level.id === "medium") {
    sentences.push("پیش از پیشنهاد قطعی، موارد نامشخص و حداقل زمان اتصال را با ایرلاین/فرودگاه تطبیق دهید.");
  } else {
    sentences.push("بر اساس این برآورد، پیشنهاد این اتصال بدون تأیید رسمی یا اصلاح itinerary توصیه نمی‌شود.");
  }
  return sentences.join(" ");
}

export function evaluateConnection(input, { delayMinutes = 0 } = {}) {
  if (!input?.flight1?.origin || !input?.flight1?.destination || !input?.flight2?.origin || !input?.flight2?.destination) {
    throw new TypeError("اطلاعات چهار فرودگاه برای تحلیل لازم است.");
  }
  const resolvedTiming = resolveFlightTimes(input);
  if (!resolvedTiming.ok) throw new RangeError(resolvedTiming.error);
  if (!Number.isFinite(delayMinutes) || delayMinutes < 0) throw new RangeError("مقدار تأخیر معتبر نیست.");

  const connection = {
    arrivalAirport: input.flight1.destination,
    departureAirport: input.flight2.origin,
  };
  connection.sameAirport = connection.arrivalAirport.iata === connection.departureAirport.iata;
  connection.sameCity = sameCity(connection.arrivalAirport, connection.departureAirport);
  connection.detectedAirportChange = !connection.sameAirport;
  connection.timezoneOffsetDifferenceMinutes = Math.abs(
    timezoneOffsetMinutes(resolvedTiming.flight1ArrivalUtc, connection.arrivalAirport.timezone) -
      timezoneOffsetMinutes(resolvedTiming.flight2DepartureUtc, connection.departureAirport.timezone),
  );

  const timing = {
    ...resolvedTiming,
    delayMinutes,
  };
  const estimatedMinimumMinutes = estimateMinimumMinutes(input, connection);
  const factors = makeFactorList(input, connection, timing, estimatedMinimumMinutes);
  const rawScore = factors.reduce((sum, factor) => sum + factor.points, 0);
  const score = Math.min(RISK_RULES.scoreRange.max, Math.max(RISK_RULES.scoreRange.min, Math.round(rawScore)));
  const level = scoreLevel(score);
  const remainingMinutes = timing.connectionMinutes - delayMinutes;
  const sortedFactors = [...factors].sort((a, b) => b.points - a.points || a.title.localeCompare(b.title, "fa"));
  const warnings = sortedFactors
    .filter((factor) => factor.points >= 6 || factor.tone === "danger")
    .map((factor) => ({ title: factor.title, description: factor.description, tone: factor.tone, points: factor.points }));

  const inputAirportAnswerConflict =
    (connection.sameAirport && input.connection.airportChange === "yes") ||
    (!connection.sameAirport && input.connection.airportChange === "no");

  return {
    score,
    level,
    factors: sortedFactors,
    warnings,
    timing: {
      ...timing,
      remainingMinutes,
      estimatedMinimumMinutes,
      arrivalLocalDate: resolvedTiming.arrivalLocalDate,
      nextDepartureLocalDate: resolvedTiming.nextDepartureLocalDate,
      crossesLocalDate: resolvedTiming.crossesLocalDate,
      overnight: resolvedTiming.crossesLocalDate,
      ambiguousTimes: resolvedTiming.ambiguousTimes,
    },
    connection: {
      ...connection,
      airportAnswerConflict: inputAirportAnswerConflict,
      locationSummary: connection.sameAirport
        ? "یک فرودگاه"
        : connection.sameCity
          ? "دو فرودگاه متفاوت در یک شهر"
          : "دو فرودگاه در دو شهر متفاوت",
    },
    route: [input.flight1.origin, input.flight1.destination, input.flight2.destination],
    airlineRelation:
      input.flight1.airline && input.flight2.airline
        ? normalizedAirline(input.flight1.airline) === normalizedAirline(input.flight2.airline)
          ? "same"
          : "different"
        : "unknown",
    narrative: buildNarrative(input, connection, timing, estimatedMinimumMinutes, level),
    recommendation: level.recommendation,
    notice: RISK_MODEL_NOTICE,
    delayMinutes,
    modelVersion: RISK_RULES.modelVersion,
  };
}

export function simulateDelays(input) {
  return RISK_RULES.delayScenarios.map((delayMinutes) => ({
    delayMinutes,
    result: evaluateConnection(input, { delayMinutes }),
  }));
}

export function valueLabel(value) {
  return VALUE_LABELS[value] ?? "نامشخص";
}
