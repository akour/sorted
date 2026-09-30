export type PromoCalendarView = "month" | "week";

export type PromoCalendarEventDate = {
  startDate?: string;
  endDate?: string;
};

export type PromoCalendarDay = {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
};

export function formatPromoCalendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPromoCalendarDays(anchor: Date, view: PromoCalendarView): PromoCalendarDay[] {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
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
    if (!event.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.startDate)) return false;
    const endDate = event.endDate && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate) ? event.endDate : event.startDate;
    return event.startDate <= dateKey && endDate >= dateKey;
  });
}
