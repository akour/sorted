"use client";

import { useMemo, useState } from "react";
import {
  formatPromoCalendarDateKey,
  getPromoCalendarDays,
  getPromoCalendarEventsForDay,
  type PromoCalendarView,
} from "../lib/promo-calendar";

type CalendarEvent = {
  id?: number;
  productId: number;
  productName?: string;
  title: string;
  eventType: string;
  status: string;
  startDate: string;
  endDate: string;
};

type CalendarProduct = { id: number; name: string };

function eventColor(eventType: string) {
  const type = eventType.toLowerCase();
  if (type.includes("offer")) return "offer";
  if (type.includes("season") || type.includes("liveops")) return "seasonal";
  if (type.includes("content")) return "content";
  return "feature";
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

export function PromoCalendarGrid({
  events,
  products,
  selectedEventId,
  loading,
  onSelect,
  onNew,
}: {
  events: CalendarEvent[];
  products: CalendarProduct[];
  selectedEventId?: number;
  loading: boolean;
  onSelect: (event: CalendarEvent) => void;
  onNew: (date?: string) => void;
}) {
  const [view, setView] = useState<PromoCalendarView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const days = useMemo(() => getPromoCalendarDays(anchor, view), [anchor, view]);
  const todayKey = formatPromoCalendarDateKey(new Date());
  const monthTitle = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dayLabel = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
  const heading = view === "month"
    ? monthTitle
    : `${dayLabel.format(days[0].date)} – ${dayLabel.format(days[6].date)}${days[0].date.getFullYear() === days[6].date.getFullYear() ? `, ${days[6].date.getFullYear()}` : `, ${days[0].date.getFullYear()} – ${days[6].date.getFullYear()}`}`;
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(2024, 0, 7 + index)));
  const visibleEvents = events.filter((event) => Boolean(event.startDate));
  const periodEventCount = visibleEvents.filter((event) => {
    const eventEnd = event.endDate || event.startDate;
    return event.startDate <= days[days.length - 1].key && eventEnd >= days[0].key;
  }).length;

  function navigate(direction: -1 | 1) {
    setExpandedDate(null);
    setAnchor((current) => view === "month"
      ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
      : new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7));
  }

  function renderDay(day: (typeof days)[number]) {
    const eventsForDay = getPromoCalendarEventsForDay(visibleEvents, day.key)
      .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title));
    const maxVisible = expandedDate === day.key ? eventsForDay.length : view === "month" ? 3 : 8;
    const hiddenCount = Math.max(0, eventsForDay.length - maxVisible);
    const label = formatLongDate(day.date);

    return <div
      className={`promo-calendar-day ${view === "week" ? "week-day" : "month-day"} ${day.inCurrentMonth ? "" : "outside-month"} ${day.key === todayKey ? "today" : ""}`}
      role="gridcell"
      aria-label={`${label}${eventsForDay.length ? `, ${eventsForDay.length} event${eventsForDay.length === 1 ? "" : "s"}` : ""}`}
      key={day.key}
    >
      <div className="promo-calendar-day-heading">
        <button type="button" className="promo-calendar-date" onClick={() => onNew(day.key)} aria-label={`Add event on ${label}`}>
          <span>{day.date.getDate()}</span>
        </button>
        <button type="button" className="promo-calendar-add" onClick={() => onNew(day.key)} aria-label={`Add event on ${label}`}>＋</button>
      </div>
      <div className="promo-calendar-day-events">
        {eventsForDay.slice(0, maxVisible).map((event) => {
          const product = products.find((item) => item.id === event.productId);
          const productName = event.productName || product?.name;
          const continues = event.startDate < day.key;
          const accessibleName = `${event.title || "Untitled event"}${continues ? ", continues" : ""}${productName ? `, ${productName}` : ""}, ${event.status}`;
          return <button
            type="button"
            className={`promo-calendar-event type-${eventColor(event.eventType)} ${event.id === selectedEventId ? "selected" : ""} ${continues ? "continues" : ""}`}
            key={`${event.id ?? event.title}-${day.key}`}
            onClick={() => onSelect(event)}
            title={accessibleName}
            aria-label={accessibleName}
            aria-pressed={event.id === selectedEventId}
          >
            <span className="promo-calendar-event-title">{event.title || "Untitled event"}</span>
            {products.length > 1 && productName && <span className="promo-calendar-event-product">{productName}</span>}
          </button>;
        })}
        {hiddenCount > 0 && <button className="promo-calendar-more" type="button" onClick={() => setExpandedDate(day.key)} aria-label={`Show ${hiddenCount} more events on ${label}`}>+{hiddenCount} more</button>}
      </div>
    </div>;
  }

  return <section className="promo-calendar-card" aria-label="Promotional events calendar">
    <div className="promo-calendar-toolbar">
      <div className="promo-calendar-navigation" aria-label="Calendar navigation">
        <button type="button" className="secondary-button" onClick={() => { setExpandedDate(null); setAnchor(new Date()); }}>Today</button>
        <button type="button" className="promo-calendar-arrow" onClick={() => navigate(-1)} aria-label={view === "month" ? "Previous month" : "Previous week"}>‹</button>
        <button type="button" className="promo-calendar-arrow" onClick={() => navigate(1)} aria-label={view === "month" ? "Next month" : "Next week"}>›</button>
      </div>
      <div className="promo-calendar-heading" aria-live="polite"><h3>{heading}</h3><span>{periodEventCount} event{periodEventCount === 1 ? "" : "s"} in view{products.length > 1 ? ` · ${products.length} products` : ""}</span></div>
      <div className="promo-calendar-view-toggle" role="group" aria-label="Calendar view">
        <button type="button" className={view === "month" ? "active" : ""} onClick={() => { setExpandedDate(null); setView("month"); }} aria-pressed={view === "month"}>Month</button>
        <button type="button" className={view === "week" ? "active" : ""} onClick={() => { setExpandedDate(null); setView("week"); }} aria-pressed={view === "week"}>Week</button>
      </div>
    </div>
    <p className="promo-calendar-hint">Select an event to edit it, or choose a date to schedule a new one.</p>
    <div className="promo-calendar-scroll">
      <div className={`promo-calendar-grid ${view}`} role="grid" aria-label={`${heading} promotional events`}>
        <div className="promo-calendar-weekdays" role="row">{weekdays.map((weekday, index) => <div role="columnheader" key={`weekday-${index}`}>{weekday}</div>)}</div>
        {Array.from({ length: days.length / 7 }, (_, weekIndex) => <div className="promo-calendar-week-row" role="row" key={days[weekIndex * 7].key}>{days.slice(weekIndex * 7, weekIndex * 7 + 7).map(renderDay)}</div>)}
      </div>
    </div>
    {loading && <p className="promo-calendar-empty-note" role="status">Loading your events…</p>}
    {!loading && !visibleEvents.length && <p className="promo-calendar-empty-note">No scheduled events in this view yet. Add one on a date to start filling your calendar.</p>}
  </section>;
}
