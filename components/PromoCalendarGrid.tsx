"use client";

import { useMemo, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent } from "react";
import {
  addPromoCalendarDays,
  differenceInPromoCalendarDays,
  formatPromoCalendarDateKey,
  getPromoCalendarDays,
  getPromoCalendarEventsForDay,
  getPromoCalendarWeekSegments,
  isPromoCalendarDate,
  type PromoCalendarDay,
  type PromoCalendarEventDate,
  type PromoCalendarView,
  type PromoCalendarWeekSegment,
} from "../lib/promo-calendar";

type CalendarEvent = PromoCalendarEventDate & {
  id?: number;
  productId: number;
  productName?: string;
  title: string;
  eventType: string;
  status: string;
  isExample?: boolean;
};

type CalendarProduct = { id: number; name: string };
type DragMode = "move" | "resize";
type DragState = { eventId: number; mode: DragMode };

function subscribeToCalendarClock() {
  return () => {};
}

function getCalendarTodayKey() {
  return formatPromoCalendarDateKey(new Date());
}

function getServerCalendarDateKey() {
  return "";
}

function eventColor(eventType: string) {
  const type = eventType.toLowerCase();
  if (type.includes("offer")) return "offer";
  if (type.includes("season") || type.includes("liveops")) return "seasonal";
  if (type.includes("content")) return "content";
  return "feature";
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function formatShortDate(value: string) {
  if (!isPromoCalendarDate(value)) return "Choose dates";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dateFromKey(value));
}

function eventDateRange(event: CalendarEvent) {
  if (!isPromoCalendarDate(event.startDate)) return "Unscheduled";
  if (!isPromoCalendarDate(event.endDate) || event.endDate === event.startDate) return formatShortDate(event.startDate);
  return formatShortDate(event.startDate) + " – " + formatShortDate(event.endDate);
}

function getPointerDate(days: PromoCalendarDay[], element: HTMLElement, clientX: number) {
  const rect = element.getBoundingClientRect();
  const column = Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - rect.left) / rect.width) * days.length)));
  return days[column]?.key;
}

export function PromoCalendarGrid({
  events,
  products,
  selectedEventId,
  loading,
  onSelect,
  onNew,
  onReschedule,
}: {
  events: CalendarEvent[];
  products: CalendarProduct[];
  selectedEventId?: number;
  loading: boolean;
  onSelect: (event: CalendarEvent) => void;
  onNew: (date?: string) => void;
  onReschedule: (event: CalendarEvent, startDate: string, endDate: string) => void;
}) {
  const [view, setView] = useState<PromoCalendarView>("month");
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [productFilter, setProductFilter] = useState("all");
  const [showExamples, setShowExamples] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const todayKey = useSyncExternalStore(subscribeToCalendarClock, getCalendarTodayKey, getServerCalendarDateKey);
  const calendarAnchor = anchor ?? (todayKey ? dateFromKey(todayKey) : null);
  const filteredEvents = useMemo(
    () => events.filter((event) => productFilter === "all" || String(event.productId) === productFilter),
    [events, productFilter],
  );

  const sampleEvents = useMemo<CalendarEvent[]>(() => {
    if (!calendarAnchor || !products.length) return [];
    const firstProduct = productFilter === "all" ? products[0] : products.find((item) => String(item.id) === productFilter) ?? products[0];
    const secondProduct = productFilter === "all" ? products[1] ?? firstProduct : firstProduct;
    const monthStart = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), 1);
    const examples = [
      { title: "Spooky Space Weekend", eventType: "seasonal", offset: 4, duration: 2, product: firstProduct },
      { title: "Double Star Rewards", eventType: "offer", offset: 10, duration: 1, product: secondProduct },
      { title: "Nebula Update", eventType: "feature", offset: 16, duration: 3, product: firstProduct },
      { title: "Daily Launch Challenge", eventType: "liveops", offset: 23, duration: 2, product: secondProduct },
    ];
    return examples.map((example) => {
      const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() + example.offset);
      const startDate = formatPromoCalendarDateKey(start);
      return {
        productId: example.product.id,
        productName: example.product.name,
        title: example.title,
        eventType: example.eventType,
        status: "planned",
        startDate,
        endDate: addPromoCalendarDays(startDate, example.duration),
        isExample: true,
      };
    });
  }, [calendarAnchor, productFilter, products]);

  if (!calendarAnchor) {
    return <section className="promo-calendar-card" aria-label="Promotional events calendar"><p className="promo-calendar-empty-note" role="status">Opening your calendar…</p></section>;
  }

  const days = getPromoCalendarDays(calendarAnchor, view);
  const weekRows = view === "month"
    ? Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7))
    : view === "week" ? [days] : [];
  const visibleEvents = showExamples ? [...filteredEvents, ...sampleEvents] : filteredEvents;
  const datedEvents = visibleEvents.filter((event) => isPromoCalendarDate(event.startDate));
  const periodStart = view === "day" ? days[0].key : days[0]?.key;
  const periodEnd = view === "day" ? days[0].key : days[days.length - 1]?.key;
  const eventsInView = datedEvents.filter((event) => {
    const endDate = isPromoCalendarDate(event.endDate) && event.endDate >= event.startDate ? event.endDate : event.startDate;
    return event.startDate <= periodEnd && endDate >= periodStart;
  }).length;
  const heading = view === "day"
    ? formatLongDate(calendarAnchor)
    : view === "week"
      ? formatShortDate(days[0].key) + " – " + formatShortDate(days[6].key) + (days[0].date.getFullYear() === days[6].date.getFullYear() ? ", " + days[6].date.getFullYear() : ", " + days[0].date.getFullYear() + " – " + days[6].date.getFullYear())
      : calendarAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(2024, 0, 7 + index)));
  const unscheduledEvents = filteredEvents.filter((event) => !isPromoCalendarDate(event.startDate));
  const upcomingEvents = filteredEvents
    .filter((event) => isPromoCalendarDate(event.startDate) && (isPromoCalendarDate(event.endDate) ? event.endDate : event.startDate) >= todayKey)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .slice(0, 5);

  function navigate(direction: -1 | 1) {
    setHoveredDate(null);
    setAnchor((current) => {
      const date = current ?? calendarAnchor;
      if (view === "month") return new Date(date.getFullYear(), date.getMonth() + direction, 1);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + direction * (view === "week" ? 7 : 1));
    });
  }

  function openDay(dateKey: string) {
    setAnchor(dateFromKey(dateKey));
    setView("day");
    setHoveredDate(null);
  }

  function startDrag(event: DragEvent<HTMLElement>, item: CalendarEvent, mode: DragMode) {
    if (!item.id || item.isExample) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(item.id));
    setDrag({ eventId: item.id, mode });
  }

  function applyDrop(dateKey: string | undefined) {
    if (!drag || !dateKey) return;
    const item = filteredEvents.find((event) => event.id === drag.eventId);
    if (!item || !isPromoCalendarDate(item.startDate)) {
      setDrag(null);
      setHoveredDate(null);
      return;
    }
    const currentEnd = isPromoCalendarDate(item.endDate) && item.endDate >= item.startDate ? item.endDate : item.startDate;
    if (drag.mode === "resize") {
      onReschedule(item, item.startDate, dateKey < item.startDate ? item.startDate : dateKey);
    } else {
      const duration = differenceInPromoCalendarDays(item.startDate, currentEnd);
      onReschedule(item, dateKey, addPromoCalendarDays(dateKey, duration));
    }
    setDrag(null);
    setHoveredDate(null);
  }

  function handleGridDragOver(event: DragEvent<HTMLDivElement>, rowDays: PromoCalendarDay[]) {
    if (!drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setHoveredDate(getPointerDate(rowDays, event.currentTarget, event.clientX) ?? null);
  }

  function handleGridDrop(event: DragEvent<HTMLDivElement>, rowDays: PromoCalendarDay[]) {
    event.preventDefault();
    applyDrop(getPointerDate(rowDays, event.currentTarget, event.clientX));
  }

  function handleDayDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    applyDrop(formatPromoCalendarDateKey(calendarAnchor));
  }

  function resizeFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, item: CalendarEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    if (!isPromoCalendarDate(item.startDate)) return;
    const currentEnd = isPromoCalendarDate(item.endDate) && item.endDate >= item.startDate ? item.endDate : item.startDate;
    const nextEnd = addPromoCalendarDays(currentEnd, event.key === "ArrowRight" ? 1 : -1);
    onReschedule(item, item.startDate, nextEnd < item.startDate ? item.startDate : nextEnd);
  }

  function renderEventBar(segment: PromoCalendarWeekSegment<CalendarEvent>, rowDays: PromoCalendarDay[]) {
    const item = segment.event;
    const productName = item.productName || products.find((product) => product.id === item.productId)?.name;
    const dateRange = eventDateRange(item);
    const accessibleName = item.title + ", " + dateRange + (productName ? ", " + productName : "") + ", " + item.eventType + ", " + item.status;
    return <div
      key={String(item.id ?? item.title) + "-" + rowDays[0].key}
      className={"promo-calendar-event type-" + eventColor(item.eventType) + (item.id === selectedEventId ? " selected" : "") + (segment.continuesBefore ? " continues-before" : "") + (segment.continuesAfter ? " continues-after" : "") + (item.isExample ? " example-event" : "")}
      style={{ gridColumn: String(segment.startIndex + 1) + " / " + String(segment.endIndex + 2), gridRow: segment.lane + 2 }}
      role="button"
      tabIndex={0}
      draggable={Boolean(item.id && !item.isExample)}
      onDragStart={(event) => startDrag(event, item, "move")}
      onDragEnd={() => { setDrag(null); setHoveredDate(null); }}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
      title={accessibleName}
      aria-label={accessibleName}
      aria-pressed={item.id === selectedEventId}
    >
      <span className="promo-calendar-event-copy">
        <strong className="promo-calendar-event-title">{item.title || "Untitled event"}</strong>
        <small className="promo-calendar-event-meta">{productName || "Choose a product"} · {dateRange}</small>
      </span>
      {!segment.continuesAfter && !item.isExample && <button
        className="promo-calendar-resize-handle"
        type="button"
        draggable={Boolean(item.id)}
        title="Drag to change the end date; use the arrow keys when focused"
        aria-label={"Resize " + item.title + " by dragging its end date"}
        onClick={(event) => { event.stopPropagation(); onSelect(item); }}
        onKeyDown={(event) => resizeFromKeyboard(event, item)}
        onDragStart={(event) => { event.stopPropagation(); startDrag(event, item, "resize"); }}
        onDragEnd={() => { setDrag(null); setHoveredDate(null); }}
      >⠿</button>}
    </div>;
  }

  function renderWeekRow(rowDays: PromoCalendarDay[]) {
    const { segments, laneCount } = getPromoCalendarWeekSegments(datedEvents, rowDays);
    return <div
      className="promo-calendar-week-row"
      role="row"
      key={rowDays[0].key}
      style={{ gridTemplateRows: "31px repeat(" + laneCount + ", 22px) minmax(42px, 1fr)" }}
      onDragOver={(event) => handleGridDragOver(event, rowDays)}
      onDragLeave={() => setHoveredDate(null)}
      onDrop={(event) => handleGridDrop(event, rowDays)}
    >
      {rowDays.map((day, index) => <div
        className={"promo-calendar-day " + (day.inCurrentMonth ? "" : "outside-month") + (day.key === todayKey ? " today" : "") + (day.key === hoveredDate ? " is-drop-target" : "")}
        role="gridcell"
        aria-label={formatLongDate(day.date)}
        key={day.key}
        style={{ gridColumn: index + 1, gridRow: "1 / -1" }}
      >
        <div className="promo-calendar-day-heading">
          <button type="button" className="promo-calendar-date" onClick={() => openDay(day.key)} aria-label={"Open " + formatLongDate(day.date)}>
            <span>{day.date.getDate()}</span>
          </button>
          <button type="button" className="promo-calendar-add" onClick={() => onNew(day.key)} aria-label={"Add event on " + formatLongDate(day.date)}>＋</button>
        </div>
      </div>)}
      {segments.map((segment) => renderEventBar(segment, rowDays))}
    </div>;
  }

  function renderAgendaEvent(item: CalendarEvent) {
    const productName = item.productName || products.find((product) => product.id === item.productId)?.name;
    return <button
      type="button"
      key={String(item.id ?? item.title) + "-" + item.startDate}
      className={"promo-calendar-agenda-event type-" + eventColor(item.eventType) + (item.isExample ? " example-event" : "")}
      draggable={Boolean(item.id && !item.isExample)}
      onDragStart={(event) => startDrag(event, item, "move")}
      onDragEnd={() => { setDrag(null); setHoveredDate(null); }}
      onClick={() => onSelect(item)}
    >
      <span className="promo-calendar-agenda-event-top"><strong>{item.title || "Untitled event"}</strong><span>{eventDateRange(item)}</span></span>
      <span>{productName || "Choose a product"} · {item.eventType} · {item.status}</span>
      <small>Drag this event into another day in week or month view to reschedule it.</small>
    </button>;
  }

  function openUpcoming(item: CalendarEvent) {
    if (isPromoCalendarDate(item.startDate)) openDay(item.startDate);
    onSelect(item);
  }

  return <section className="promo-calendar-card" aria-label="Promotional events calendar">
    <div className="promo-calendar-toolbar">
      <div className="promo-calendar-navigation" aria-label="Calendar navigation">
        <button type="button" className="secondary-button" onClick={() => { setHoveredDate(null); setAnchor(new Date()); }}>Today</button>
        <button type="button" className="promo-calendar-arrow" onClick={() => navigate(-1)} aria-label={view === "month" ? "Previous month" : view === "week" ? "Previous week" : "Previous day"}>‹</button>
        <button type="button" className="promo-calendar-arrow" onClick={() => navigate(1)} aria-label={view === "month" ? "Next month" : view === "week" ? "Next week" : "Next day"}>›</button>
      </div>
      <div className="promo-calendar-heading" aria-live="polite">
        <h3>{heading}</h3>
        <span>{filteredEvents.length} saved · {eventsInView} in view{showExamples ? " · examples shown" : ""}</span>
      </div>
      <div className="promo-calendar-controls">
        {products.length > 1 && <label className="promo-calendar-product-filter"><span>Game</span><select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} aria-label="Filter events by game"><option value="all">All games</option>{products.map((product) => <option key={product.id} value={String(product.id)}>{product.name}</option>)}</select></label>}
        <div className="promo-calendar-view-toggle" role="group" aria-label="Calendar view">
          <button type="button" className={view === "month" ? "active" : ""} onClick={() => setView("month")} aria-pressed={view === "month"}>Month</button>
          <button type="button" className={view === "week" ? "active" : ""} onClick={() => setView("week")} aria-pressed={view === "week"}>Week</button>
          <button type="button" className={view === "day" ? "active" : ""} onClick={() => setView("day")} aria-pressed={view === "day"}>Day</button>
        </div>
      </div>
    </div>

    <div className="promo-calendar-subtoolbar">
      <p className="promo-calendar-hint">{view === "day" ? "Review this day, open an event to edit it, or add a new promotion." : "Select a date to open its agenda. Drag an event to move it; drag its handle to resize the date range."}</p>
      <button type="button" className="promo-calendar-example-toggle" onClick={() => setShowExamples((current) => !current)}>{showExamples ? "Hide example events" : "Preview sample schedule"}</button>
    </div>

    <div className="promo-calendar-legend" aria-label="Event type colors">
      <span><i className="type-feature" /> Feature</span><span><i className="type-seasonal" /> Seasonal / LiveOps</span><span><i className="type-offer" /> Offer</span><span><i className="type-content" /> Content</span>
      {showExamples && <strong>Example events are preview-only and are not saved.</strong>}
    </div>

    {view === "day" ? <div className={"promo-calendar-day-agenda" + (hoveredDate === formatPromoCalendarDateKey(calendarAnchor) ? " is-drop-target" : "")} onDragOver={(event) => { if (drag) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setHoveredDate(formatPromoCalendarDateKey(calendarAnchor)); } }} onDragLeave={() => setHoveredDate(null)} onDrop={handleDayDrop}>
      <div className="promo-calendar-agenda-heading"><div><p className="eyebrow">Day agenda · all-day promotions</p><h4>{heading}</h4><span>{getPromoCalendarEventsForDay(visibleEvents, formatPromoCalendarDateKey(calendarAnchor)).length} event(s) scheduled</span></div><button className="primary-button" type="button" onClick={() => onNew(formatPromoCalendarDateKey(calendarAnchor))}>＋ Add event on this date</button></div>
      {getPromoCalendarEventsForDay(visibleEvents, formatPromoCalendarDateKey(calendarAnchor)).length
        ? <div className="promo-calendar-agenda-list">{getPromoCalendarEventsForDay(visibleEvents, formatPromoCalendarDateKey(calendarAnchor)).map(renderAgendaEvent)}</div>
        : <div className="promo-calendar-agenda-empty"><strong>No promotions on this date yet</strong><span>Create one here, or drag an existing event into this day.</span><button type="button" className="secondary-button" onClick={() => onNew(formatPromoCalendarDateKey(calendarAnchor))}>＋ Schedule a promotion</button></div>}
      <button type="button" className="promo-calendar-back-to-month" onClick={() => setView("month")}>← Back to month</button>
    </div> : <div className="promo-calendar-scroll">
      <div className={"promo-calendar-grid " + view} role="grid" aria-label={heading + " promotional events"}>
        <div className="promo-calendar-weekdays" role="row">{weekdays.map((weekday, index) => <div role="columnheader" key={"weekday-" + index}>{weekday}</div>)}</div>
        {weekRows.map(renderWeekRow)}
      </div>
      {loading && <p className="promo-calendar-empty-note" role="status">Loading your events…</p>}
      {!loading && eventsInView === 0 && <p className="promo-calendar-empty-note">No saved events in this {view}. Use the arrows, check Upcoming below, or preview a sample schedule.</p>}
    </div>}

    {upcomingEvents.length > 0 && <section className="promo-calendar-upcoming" aria-label="Upcoming events">
      <div className="promo-calendar-upcoming-heading"><div><p className="eyebrow">Across all dates</p><h4>Upcoming promotions</h4></div><span>{filteredEvents.length} saved event(s)</span></div>
      <div className="promo-calendar-upcoming-list">{upcomingEvents.map((item) => <button type="button" key={item.id} className={"promo-calendar-upcoming-event type-" + eventColor(item.eventType)} onClick={() => openUpcoming(item)}>
        <i /><span><strong>{item.title || "Untitled event"}</strong><small>{item.productName || products.find((product) => product.id === item.productId)?.name || "Choose a product"}</small></span><span className="promo-calendar-upcoming-date">{eventDateRange(item)}</span>
      </button>)}</div>
    </section>}

    {unscheduledEvents.length > 0 && <section className="promo-calendar-unscheduled" aria-label="Unscheduled events">
      <h4>Needs a date <span>{unscheduledEvents.length}</span></h4>
      <div>{unscheduledEvents.map(renderAgendaEvent)}</div>
    </section>}
  </section>;
}
