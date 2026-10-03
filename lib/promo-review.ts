import { isPromoCalendarDate } from "./promo-calendar";

type PromoCopy = { tagline?: string; description?: string };
type ReviewEvent = {
  productId: number; title: string; startDate: string; endDate: string;
  eventBrief: Record<string, string>;
  googlePlay: PromoCopy & { options?: PromoCopy[]; selectedOption?: number };
  localization: Array<PromoCopy & { locale: string; status: string; sourceTagline?: string; sourceDescription?: string }>;
};

export function selectedPromoCopy(event: Pick<ReviewEvent, "googlePlay">): PromoCopy {
  return event.googlePlay.options?.length ? event.googlePlay.options[event.googlePlay.selectedOption ?? 0] ?? {} : event.googlePlay;
}

export function promoCopyErrors(copy: PromoCopy, label = "Google Play") {
  const errors: string[] = [];
  if (!copy.tagline?.trim()) errors.push(`${label}: add a tagline.`);
  if ((copy.tagline?.length ?? 0) > 80) errors.push(`${label}: shorten the tagline to 80 characters.`);
  if (!copy.description?.trim()) errors.push(`${label}: add a description.`);
  if ((copy.description?.length ?? 0) > 500) errors.push(`${label}: shorten the description to 500 characters.`);
  if (copy.description?.includes("\n")) errors.push(`${label}: use one paragraph.`);
  return errors;
}

export function promoReviewErrors(event: ReviewEvent) {
  const errors: string[] = [];
  if (!event.productId) errors.push("Choose a product.");
  if (!event.title.trim()) errors.push("Give the event a name.");
  if (!isPromoCalendarDate(event.startDate) || !isPromoCalendarDate(event.endDate)) errors.push("Choose valid start and end dates.");
  else if (event.endDate < event.startDate) errors.push("End date must be on or after the start date.");
  if (!event.eventBrief.whatNew?.trim()) errors.push("Describe what is actually happening in this event.");
  if (/[?؟]|missing fact|needs confirmation/i.test(event.eventBrief.notes ?? "")) errors.push("Resolve the open questions in event notes.");
  if (Object.values(event.eventBrief).some((text) => /proposal to confirm|to be confirmed|needs confirmation/i.test(text))) errors.push("Resolve unconfirmed event details before handoff.");
  const source = selectedPromoCopy(event);
  errors.push(...promoCopyErrors(source));
  // Empty optional channels never block a Google Play package.
  for (const locale of event.localization.filter((item) => item.locale !== "en" && (item.tagline?.trim() || item.description?.trim()))) {
    errors.push(...promoCopyErrors(locale, locale.locale));
    if (locale.status !== "ready") errors.push(`${locale.locale}: review the translation and mark it ready.`);
    if (locale.sourceTagline !== source.tagline || locale.sourceDescription !== source.description) errors.push(`${locale.locale}: review against the current English copy.`);
  }
  return errors;
}
