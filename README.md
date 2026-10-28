# Decimal Time Converter

Converts between 24-hour sexagesimal time (`HH:MM:SS` or `[h, m, s]`) and decimal hours, for payroll and scientific time tracking.

```js
import { toDecimal, toClock, formatClock, parseClock } from 'decimal-time-converter';

toDecimal([8, 30]);        // 8.5
toClock(7.75);             // [7, 45, 0]
formatClock([9, 5, 0]);    // '09:05:00'
parseClock('17:30');       // [17, 30, 0]
```

## Why this exists

Payroll systems record time in decimal hours (8.5h) but humans read and enter time in hours and minutes. This library does that one conversion both ways, deterministically, with no float drift.

The trade-off: decimal values are rounded to 4 decimal places (a tenth of a second) before conversion to clock time. Without that, `8.0 - 1e-9` (a sum artefact) would produce `07:59:59` instead of `08:00:00`. The rounding threshold is `0.00005h` = `0.18s`; on the boundary it may shift the displayed second by one tick, which is below what payroll reports.

## Edge cases you will hit

- `24.0` decimal hours and `[24, 0, 0]` are valid and represent the end of the day. Anything above `24` is an error — this library does not roll into a "next day" because there is no date to carry.
- `60` minutes or `60` seconds is rejected, not silently rolled into the next unit. `[8, 60]` is an error; use `[9, 0]`.
- `toClock` accepts either a number or a `[h, m, s]` array. `toDecimal` accepts only the array. String input goes through `parseClock`. Mixing these (e.g. passing a string to `toDecimal`) throws rather than guessing.
- `formatClock([8, 30])` returns `'08:30'` (no seconds, because the input had none). `formatClock(8.5)` returns `'08:30:00'` (seconds shown, because the precision was unknown). Override with `{ seconds: false }`.

## Exports

- `toDecimal(parts)` → `number` — `[h, m, s]` (or shorter) to decimal hours, rounded to 4 dp.
- `toClock(hours)` → `[h, m, s]` — decimal hours (or array) to clock parts.
- `formatClock(input, opts?)` → `string` — `HH:MM` or `HH:MM:SS`.
- `parseClock(str)` → `[h, m, s]` — parse `HH:MM` or `HH:MM:SS`.
- `normalizeClock(parts)` → `[h, m, s]` — validate and fill defaults; throws on out-of-range.
- `roundDecimal(hours)` → `number` — round to 4 dp with epsilon fix-up.
- `DecimalTimeError` — `Error` subclass thrown by all of the above on bad input.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Contributing

Issues and pull requests are welcome. Please keep the dependency list empty —
that constraint is the point of the project, not an oversight.

