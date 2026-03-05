export function normalizeTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") return "UTC";
  const trimmed = timeZone.trim();
  if (!trimmed) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return "UTC";
  }
}

export function getLocalDateKey(timeZone, date = new Date()) {
  const tz = normalizeTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getTimeZoneOffsetMs(timeZone, date) {
  const tz = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  const asUTC = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUTC - date.getTime();
}

export function getNextLocalMidnightIso(timeZone, now = new Date()) {
  const tz = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);
  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  const y = Number(values.year);
  const m = Number(values.month);
  const d = Number(values.day);

  let t = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  t = t - getTimeZoneOffsetMs(tz, new Date(t));
  t = t - getTimeZoneOffsetMs(tz, new Date(t));
  return new Date(t).toISOString();
}

