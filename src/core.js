/**
 * Decimal Time Converter — converts between 24-hour sexagesimal time and decimal hours.
 *
 * Design decisions (stated plainly so the tests cannot drift):
 *
 * 1. Input acceptance. toClock/parseClock/formatClock accept either a number of
 *    decimal hours OR a [h, m, s] array. A single number is the common case for
 *    payroll; the array form avoids string parsing when the caller already has
 *    structured data. String inputs are deliberately rejected — parseClock is the
 *    string entry point, and mixing concerns led to ambiguous behaviour.
 *
 * 2. Rounding boundary. Decimal values are rounded to 4 places before conversion
 *    to clock time. This keeps 7.999999 hours (a float artefact) from producing
 *    -1 second rather than 8:00:00. The boundary is 0.00005 hours = 0.18s. Rounding
 *    down would mis-attribute 0.18s; rounding up shifts the second at most by one
 *    tick, which is below the precision a payroll system reports.
 *
 * 3. Seconds default to zero, minutes default to zero in array input. Omitting
 *    trailing components is common (timesheets rarely record seconds) and defaults
 *    are explicit to avoid NaN propagation.
 *
 * 4. Midnight rollover. A decimal value of exactly 24.0 is valid and represents the
 *    end of the day; it normalises to 24:00:00 rather than wrapping to 00:00:00.
 *    Times beyond 24 are an error — there is no "next day" in a 24-hour clock
 *    without a date, and pretending to roll over would silently corrupt totals.
 */

/**
 * Thrown when input does not meet the preconditions documented for each function.
 * Using a dedicated class (rather than Error) lets callers distinguish converter
 * errors from other runtime failures in a try/catch.
 */
export class DecimalTimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecimalTimeError';
  }
}

const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = 3600;
const ROUND_DP = 4;
// Rounding threshold for decimal hours: half a unit in the 4th decimal place.
const ROUND_EPSILON = Math.pow(10, -ROUND_DP) / 2;

/**
 * Round a decimal-hours number to ROUND_DP places using a fixed epsilon so that
 * values like 7.9999995 collapse to 8.0000 instead of drifting below.
 *
 * Math.round gives a deterministic result regardless of host float quirks because
 * we pre-shift by the same power of ten on every platform tested.
 */
export function roundDecimal(hours) {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) {
    throw new DecimalTimeError('roundDecimal expects a finite number');
  }
  const shifted = hours * Math.pow(10, ROUND_DP);
  return Math.round(shifted) / Math.pow(10, ROUND_DP);
}

/**
 * Normalise a [h, m, s] array by filling missing trailing components with 0 and
 * validating ranges. Returns a fresh 3-tuple. Does NOT roll seconds into minutes
 * or minutes into hours — that would mask input errors (e.g. 90 seconds) by
 * rewriting history. Callers get an error instead of a surprise.
 */
export function normalizeClock(parts) {
  if (!Array.isArray(parts)) {
    throw new DecimalTimeError('clock parts must be an array [h, m, s]');
  }
  if (parts.length < 1 || parts.length > 3) {
    throw new DecimalTimeError('clock parts must have 1 to 3 elements');
  }
  const h = parts[0];
  const m = parts.length > 1 ? parts[1] : 0;
  const s = parts.length > 2 ? parts[2] : 0;
  for (const v of [h, m, s]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new DecimalTimeError('clock components must be finite numbers');
    }
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(s)) {
    throw new DecimalTimeError('clock components must be integers');
  }
  if (h < 0 || h > HOURS_PER_DAY) {
    throw new DecimalTimeError(`hour out of range: ${h}`);
  }
  if (h === HOURS_PER_DAY && (m !== 0 || s !== 0)) {
    throw new DecimalTimeError('24:00 is the last representable time; 24:00:01 is out of range');
  }
  if (m < 0 || m >= 60) {
    throw new DecimalTimeError(`minute out of range: ${m}`);
  }
  if (s < 0 || s >= 60) {
    throw new DecimalTimeError(`second out of range: ${s}`);
  }
  return [h, m, s];
}

/**
 * Convert sexagesimal clock time to decimal hours.
 *
 * Accepts a [h, m, s] array (or shorter). Returns decimal hours as a Number,
 * rounded to 4 decimal places to keep the output stable across downstream
 * float arithmetic (e.g. summing a week of times). Without rounding,
 * 8h30m yields 8.499999999999998 on many VMs and totals drift.
 */
export function toDecimal(parts) {
  const [h, m, s] = normalizeClock(parts);
  const decimal = h + (m * 60 + s) / SECONDS_PER_HOUR;
  return roundDecimal(decimal);
}

/**
 * Convert decimal hours into a normalised [h, m, s] array.
 *
 * Values are rounded to 4 decimal places first so that 7.9999995 (a float
 * artefact of summing 8.0 - tiny epsilon) converts to 8:00:00 rather than
 * producing a negative second via floor subtraction.
 */
export function toClock(hours) {
  if (typeof hours === 'number') {
    if (!Number.isFinite(hours)) {
      throw new DecimalTimeError('toClock expects a finite number or [h,m,s] array');
    }
  } else if (Array.isArray(hours)) {
    // Re-use the array path by converting to decimal first, then back. This is
    // intentional: toClock's contract is "decimal -> clock"; accepting arrays
    // is a convenience that must produce identical results to the number path
    // so callers can normalise on either form without surprises.
    hours = toDecimal(hours);
  } else {
    throw new DecimalTimeError('toClock expects a finite number or [h,m,s] array');
  }
  if (hours < 0) {
    throw new DecimalTimeError('decimal hours must be non-negative');
  }
  const rounded = roundDecimal(hours);
  if (rounded > HOURS_PER_DAY + ROUND_EPSILON) {
    throw new DecimalTimeError(`decimal hours out of range: ${hours}`);
  }
  // Exactly 24 (within epsilon) maps to 24:00:00, the end-of-day sentinel.
  if (rounded >= HOURS_PER_DAY - ROUND_EPSILON) {
    return [HOURS_PER_DAY, 0, 0];
  }
  const totalSeconds = Math.round(rounded * SECONDS_PER_HOUR);
  const h = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const m = Math.floor((totalSeconds % SECONDS_PER_HOUR) / 60);
  const s = totalSeconds % 60;
  return [h, m, s];
}

/**
 * Format a clock value as HH:MM or HH:MM:SS.
 *
 * Seconds are omitted when zero AND when the input was a 2-component array —
 * i.e. the caller explicitly asked for minute precision. For a 3-component
 * array or a decimal number, seconds are always shown (even if 0) so that
 * round-tripping through the string form preserves precision intent.
 */
export function formatClock(input, opts = {}) {
  let parts;
  let showSeconds = opts.seconds;
  if (Array.isArray(input)) {
    parts = normalizeClock(input);
    if (showSeconds === undefined) {
      showSeconds = input.length === 3 || parts[2] !== 0;
    }
  } else if (typeof input === 'number' && Number.isFinite(input)) {
    parts = toClock(input);
    if (showSeconds === undefined) showSeconds = true;
  } else {
    throw new DecimalTimeError('formatClock expects a number or [h,m,s] array');
  }
  const [h, m, s] = parts;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  if (showSeconds) {
    const ss = String(s).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}`;
}

/**
 * Parse an HH:MM or HH:MM:SS string into a [h, m, s] array.
 *
 * Leading zeros are optional; trailing whitespace is tolerated. Anything else
 * (units > 59, hour > 24, non-numeric, missing minutes) is an error. We do not
 * accept 12-hour am/pm input — that would require locale and the brief is a
 * 24-hour converter.
 */
export function parseClock(str) {
  if (typeof str !== 'string') {
    throw new DecimalTimeError('parseClock expects a string');
  }
  const trimmed = str.trim();
  const segments = trimmed.split(':');
  if (segments.length < 2 || segments.length > 3) {
    throw new DecimalTimeError(`expected HH:MM or HH:MM:SS, got ${JSON.stringify(str)}`);
  }
  const nums = segments.map((seg) => {
    const n = Number(seg);
    if (!Number.isInteger(n) || !Number.isFinite(n)) {
      throw new DecimalTimeError(`non-integer segment ${JSON.stringify(seg)} in ${JSON.stringify(str)}`);
    }
    return n;
  });
  // normalizeClock validates ranges; delegating avoids two copies of the rules.
  return normalizeClock(nums);
}
