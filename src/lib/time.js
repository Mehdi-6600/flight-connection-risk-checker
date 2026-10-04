const formatterCache = new Map();

function dateTimeFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("en-GB-u-ca-gregory-nu-latn", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
    );
  }
  return formatterCache.get(timeZone);
}

export function parseIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function parseClockTime(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function zonedParts(timestamp, timeZone) {
  const values = Object.fromEntries(
    dateTimeFormatter(timeZone)
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  if (values.hour === 24) values.hour = 0;
  return values;
}

function sameMinute(parts, desired) {
  return (
    parts.year === desired.year &&
    parts.month === desired.month &&
    parts.day === desired.day &&
    parts.hour === desired.hour &&
    parts.minute === desired.minute
  );
}

/**
 * Converts a local airport date/time into a UTC timestamp without assuming the
 * browser's timezone. Nonexistent daylight-saving times are rejected; repeated
 * DST times resolve to the earlier occurrence and are flagged for review.
 */
export function airportLocalToUtc(dateValue, timeValue, timeZone) {
  const date = parseIsoDate(dateValue);
  const clock = parseClockTime(timeValue);
  if (!date || !clock || typeof timeZone !== "string" || !timeZone) {
    return { ok: false, reason: "تاریخ، ساعت یا منطقهٔ زمانی معتبر نیست." };
  }

  const desired = { ...date, ...clock };
  const wallClockAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );

  try {
    const possibleOffsets = new Set();
    for (let deltaHours = -36; deltaHours <= 36; deltaHours += 6) {
      const parts = zonedParts(wallClockAsUtc + deltaHours * 60 * 60 * 1000, timeZone);
      const representedAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
      possibleOffsets.add(representedAsUtc - (wallClockAsUtc + deltaHours * 60 * 60 * 1000));
    }

    const matches = [];
    for (const offset of possibleOffsets) {
      const candidate = wallClockAsUtc - offset;
      if (sameMinute(zonedParts(candidate, timeZone), desired)) matches.push(candidate);
    }

    const uniqueMatches = [...new Set(matches)].sort((left, right) => left - right);
    if (uniqueMatches.length === 0) {
      return {
        ok: false,
        reason: "این ساعت در منطقهٔ زمانی فرودگاه معتبر نیست (احتمال تغییر ساعت فصلی).",
      };
    }

    return {
      ok: true,
      timestamp: uniqueMatches[0],
      ambiguous: uniqueMatches.length > 1,
      timezone: timeZone,
    };
  } catch {
    return { ok: false, reason: "منطقهٔ زمانی فرودگاه قابل تشخیص نیست." };
  }
}

export function airportLocalDate(timestamp, timeZone) {
  const parts = zonedParts(timestamp, timeZone);
  return [parts.year, String(parts.month).padStart(2, "0"), String(parts.day).padStart(2, "0")].join("-");
}

export function timezoneOffsetMinutes(timestamp, timeZone) {
  const parts = zonedParts(timestamp, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((representedAsUtc - timestamp) / 60_000);
}

export function formatDuration(minutes, { compact = false } = {}) {
  if (!Number.isFinite(minutes)) return "نامشخص";
  if (minutes < 0) return `منفی ${formatDuration(Math.abs(minutes), { compact })}`;
  const wholeMinutes = Math.floor(minutes);
  const hours = Math.floor(wholeMinutes / 60);
  const rest = wholeMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${toPersianDigits(hours)} ${compact ? "س" : "ساعت"}`);
  if (rest > 0 || hours === 0) parts.push(`${toPersianDigits(rest)} ${compact ? "د" : "دقیقه"}`);
  return parts.join(" و ");
}

export function toPersianDigits(value) {
  return String(value).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

export function formatPersianDate(value, { includeTime = false } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "نامشخص";
  const options = includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" };
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arab", options).format(date);
}

export function formatAirportInstant(timestamp, airport) {
  const result = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arab", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: airport.timezone,
  }).format(new Date(timestamp));
  return result;
}
