import assert from "node:assert/strict";
import test from "node:test";
import {
  addPromoCalendarDays,
  differenceInPromoCalendarDays,
  formatPromoCalendarDateKey,
  getPromoCalendarDays,
  getPromoCalendarEventsForDay,
  getPromoCalendarWeekSegments,
} from "../lib/promo-calendar.ts";

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

test("day view returns just the selected local calendar date", () => {
  const days = getPromoCalendarDays(new Date(2026, 8, 30), "day");
  assert.deepEqual(days.map((day) => day.key), ["2026-09-30"]);
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

test("week segments span dates, continue across weeks, and place overlapping events in separate lanes", () => {
  const days = getPromoCalendarDays(new Date(2026, 8, 30), "week");
  const { segments, laneCount } = getPromoCalendarWeekSegments([
    { id: "long", startDate: "2026-09-28", endDate: "2026-10-02" },
    { id: "overlap", startDate: "2026-09-29", endDate: "2026-09-30" },
    { id: "next-lane", startDate: "2026-10-03", endDate: "2026-10-03" },
    { id: "continues", startDate: "2026-09-25", endDate: "2026-10-05" },
    { id: "invalid", startDate: "2026-02-30", endDate: "2026-03-01" },
  ], days);
  assert.equal(laneCount, 3);
  assert.deepEqual(segments.map(({ event, startIndex, endIndex, lane, continuesBefore, continuesAfter }) => ({
    id: event.id, startIndex, endIndex, lane, continuesBefore, continuesAfter,
  })), [
    { id: "continues", startIndex: 0, endIndex: 6, lane: 0, continuesBefore: true, continuesAfter: true },
    { id: "long", startIndex: 1, endIndex: 5, lane: 1, continuesBefore: false, continuesAfter: false },
    { id: "overlap", startIndex: 2, endIndex: 3, lane: 2, continuesBefore: false, continuesAfter: false },
    { id: "next-lane", startIndex: 6, endIndex: 6, lane: 1, continuesBefore: false, continuesAfter: false },
  ]);
});

test("date shifting keeps all-day ranges stable across month and year boundaries", () => {
  assert.equal(addPromoCalendarDays("2026-12-31", 2), "2027-01-02");
  assert.equal(addPromoCalendarDays("2026-09-30", -1), "2026-09-29");
  assert.equal(differenceInPromoCalendarDays("2026-09-29", "2026-10-02"), 3);
});
