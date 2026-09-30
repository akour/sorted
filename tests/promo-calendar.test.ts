import assert from "node:assert/strict";
import test from "node:test";
import { formatPromoCalendarDateKey, getPromoCalendarDays, getPromoCalendarEventsForDay } from "../lib/promo-calendar.ts";

test("month view starts on Sunday and includes the full month without skipping days", () => {
  const days = getPromoCalendarDays(new Date(2026, 8, 15), "month");
  assert.equal(days[0].key, "2026-08-30");
  assert.equal(days.at(-1)?.key, "2026-10-03");
  assert.equal(days.length % 7, 0);
  assert.equal(days.filter((day) => day.inCurrentMonth).length, 30);
});

test("week view includes the anchor date and all seven days from Sunday", () => {
  const days = getPromoCalendarDays(new Date(2026, 8, 30), "week");
  assert.deepEqual(days.map((day) => day.key), [
    "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03",
  ]);
});

test("multi-day events appear on every covered date and missing end dates are treated as one-day events", () => {
  const events = [
    { id: 1, startDate: "2026-09-29", endDate: "2026-10-02" },
    { id: 2, startDate: "2026-09-30" },
    { id: 3, startDate: "not-a-date", endDate: "2026-10-01" },
  ];
  assert.deepEqual(getPromoCalendarEventsForDay(events, "2026-09-30").map((event) => event.id), [1, 2]);
  assert.deepEqual(getPromoCalendarEventsForDay(events, "2026-10-01").map((event) => event.id), [1]);
  assert.equal(formatPromoCalendarDateKey(new Date(2026, 8, 30)), "2026-09-30");
});
