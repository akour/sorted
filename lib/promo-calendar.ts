export type PromoCalendarView = "month" | "week" | "day";

export type PromoCalendarEventDate = {
  startDate?: string;
  endDate?: string;
};

export type PromoCalendarDay = {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
};

export type PromoCalendarWeekSegment<T> = {
  event: T;
  startIndex: number;
  endIndex: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export function isPromoCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatPromoCalendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPromoCalendarDays(anchor: Date, view: PromoCalendarView): PromoCalendarDay[] {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  if (view === "day") {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    return [{ date, key: formatPromoCalendarDateKey(date), inCurrentMonth: true }];
  }
  const visibleStart = view === "week"
    ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay())
    : new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - monthStart.getDay());
  const count = view === "week"
    ? 7
    : Math.ceil((monthStart.getDay() + new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()) / 7) * 7;

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(visibleStart.getFullYear(), visibleStart.getMonth(), visibleStart.getDate() + index);
    return {
      date,
      key: formatPromoCalendarDateKey(date),
      inCurrentMonth: date.getMonth() === anchor.getMonth(),
    };
  });
}

export function getPromoCalendarEventsForDay<T extends PromoCalendarEventDate>(events: T[], dateKey: string) {
  return events.filter((event) => {
    if (!isPromoCalendarDate(event.startDate)) return false;
    const endDate = isPromoCalendarDate(event.endDate) && event.endDate >= event.startDate ? event.endDate : event.startDate;
    return event.startDate <= dateKey && endDate >= dateKey;
  });
}

export function getPromoCalendarWeekSegments<T extends PromoCalendarEventDate>(
  events: T[],
  days: PromoCalendarDay[],
): { segments: PromoCalendarWeekSegment<T>[]; laneCount: number } {
  if (!days.length) return { segments: [], laneCount: 1 };
  const firstKey = days[0].key;
  const lastKey = days[days.length - 1].key;
  const pending = events.flatMap((event) => {
    if (!isPromoCalendarDate(event.startDate)) return [];
    const endDate = isPromoCalendarDate(event.endDate) && event.endDate >= event.startDate ? event.endDate : event.startDate;
    if (endDate < firstKey || event.startDate > lastKey) return [];
    const startIndex = Math.max(0, days.findIndex((day) => day.key >= event.startDate));
    let endIndex = days.findIndex((day) => day.key >= endDate);
    if (endIndex < 0) endIndex = days.length - 1;
    return [{
      event,
      startIndex,
      endIndex,
      continuesBefore: event.startDate < firstKey,
      continuesAfter: endDate > lastKey,
    }];
  }).sort((left, right) => left.startIndex - right.startIndex || right.endIndex - left.endIndex);

  const laneEnds: number[] = [];
  const segments = pending.map((segment) => {
    let lane = laneEnds.findIndex((endIndex) => endIndex < segment.startIndex);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(segment.endIndex);
    } else {
      laneEnds[lane] = segment.endIndex;
    }
    return { ...segment, lane };
  });

  return { segments, laneCount: Math.max(1, laneEnds.length) };
}

export function addPromoCalendarDays(dateKey: string, amount: number) {
  if (!isPromoCalendarDate(dateKey)) return dateKey;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
}

export function differenceInPromoCalendarDays(startDate: string, endDate: string) {
  if (!isPromoCalendarDate(startDate) || !isPromoCalendarDate(endDate)) return 0;
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  return Math.round((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86_400_000);
}
