export type GooglePlayPromoHandoffInput = {
  title?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  googlePlay?: {
    options?: Array<{ tagline?: string; description?: string }>;
    selectedOption?: number;
  };
  localization?: Array<{ locale?: string; tagline?: string; description?: string }>;
  creative?: {
    concept?: string;
    dimensions?: string;
    proofToShow?: string[] | string;
  };
};

function selectedOption(event: GooglePlayPromoHandoffInput) {
  const options = event.googlePlay?.options ?? [];
  const index = event.googlePlay?.selectedOption ?? 0;
  return Number.isInteger(index) && index >= 0 ? options[index] : undefined;
}

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function characterCount(value: string) {
  return Array.from(value).length;
}

function singleLine(value: string | undefined, fallback = "(not provided)") {
  const text = value?.replace(/[\r\n]+/g, " ").trim();
  return text ? text.replace(/`/g, "\\`") : fallback;
}

export function validateGooglePlayPromoHandoff(event: GooglePlayPromoHandoffInput): string[] {
  const errors: string[] = [];
  const copy = selectedOption(event);
  const tagline = typeof copy?.tagline === "string" ? copy.tagline : "";
  const description = typeof copy?.description === "string" ? copy.description : "";

  if (!event.title?.trim()) errors.push("Add an event name before exporting the Google Play handoff.");
  if (!tagline.trim()) errors.push("Add a tagline to the selected Google Play option.");
  if (characterCount(tagline) > 80) errors.push("The selected Google Play tagline exceeds 80 characters.");
  if (!description.trim()) errors.push("Add a description to the selected Google Play option.");
  if (characterCount(description) > 500) errors.push("The selected Google Play description exceeds 500 characters.");
  if (tagline.trim() && description.toLowerCase().includes(tagline.trim().toLowerCase())) {
    errors.push("The Google Play description repeats the tagline; Google asks for distinct copy.");
  }

  const start = parseDate(event.startDate);
  const end = parseDate(event.endDate);
  if (!start) errors.push("Add a valid Google Play event start date.");
  if (!end) errors.push("Add a valid Google Play event end date.");
  if (start && end) {
    if (end.getTime() < start.getTime()) errors.push("The event end date must be on or after its start date.");
    else {
      const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
      if (inclusiveDays > 28) errors.push("Google Play events can run for no more than four weeks.");
    }
  }

  return errors;
}

function fenced(value: string | undefined) {
  const text = value?.trim() || "(Not provided)";
  const longestBacktickRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}text\n${text}\n${fence}`;
}

export function buildGooglePlayPromoHandoff(
  event: GooglePlayPromoHandoffInput,
  productName: string,
  exportedAt = new Date(),
) {
  const copy = selectedOption(event);
  const locales = (event.localization ?? []).filter((locale) => locale.tagline?.trim() && locale.description?.trim());
  const proof = Array.isArray(event.creative?.proofToShow)
    ? event.creative.proofToShow.filter((item) => item.trim())
    : typeof event.creative?.proofToShow === "string"
      ? event.creative.proofToShow.split("\n").map((item) => item.trim()).filter(Boolean)
      : [];
  const start = parseDate(event.startDate);
  const todayUtc = Date.UTC(exportedAt.getUTCFullYear(), exportedAt.getUTCMonth(), exportedAt.getUTCDate());
  const daysUntilStart = start ? Math.ceil((start.getTime() - todayUtc) / 86_400_000) : null;
  const timingNote = daysUntilStart === null
    ? "Check submission timing in Play Console."
    : daysUntilStart > 60
      ? `This event starts in ${daysUntilStart} days. Google says events can be submitted no earlier than 60 days before they start; prepare the draft and submit inside that window.`
      : daysUntilStart < 4
        ? `This event starts in ${daysUntilStart} days. Google recommends submitting at least four days ahead for review, so approval before launch may be at risk.`
        : `This event starts in ${daysUntilStart} days. Google recommends submitting at least four days before launch.`;
  const localization = locales.length
    ? locales.map((locale) => `### ${locale.locale || "Additional language"}\n\n**Tagline**\n\n${fenced(locale.tagline)}\n\n**Description**\n\n${fenced(locale.description)}`).join("\n\n")
    : "No complete additional-language copy is saved. Add translations in Play Console if you are targeting other language markets.";

  return `# Google Play promotional content handoff

Prepared from Sorted on ${exportedAt.toISOString()}.

## Event details

- Product: ${singleLine(productName, "(not set)")}
- Play Console internal event name: ${singleLine(event.title, "(not set)")}
- Sorted planning category: ${singleLine(event.eventType, "(not set)")}
- Planned start date: ${singleLine(event.startDate, "(not set)")}
- Planned end date: ${singleLine(event.endDate, "(not set)")}

## Selected Google Play copy

**Tagline (${characterCount(copy?.tagline ?? "")}/80 characters)**

${fenced(copy?.tagline)}

**Description (${characterCount(copy?.description ?? "")}/500 characters)**

${fenced(copy?.description)}

## Other completed translations

${localization}

## Creative handoff

- Concept: ${singleLine(event.creative?.concept)}
- Planned dimensions: ${singleLine(event.creative?.dimensions)}
- Verifiable details to depict: ${proof.length ? proof.map((item) => singleLine(item)).join("; ") : "(not provided)"}

## Complete these items in Google Play Console

- Confirm the app is eligible. Promotional content is available to all games; apps must meet Google's Premium growth tools eligibility criteria.
- Choose the official event type and subtype. Sorted's planning category is not a Google Play event-type selection.
- Select at least one country or region, and map language names to the exact Play Console locale codes.
- Set the start and end times in UTC. Sorted currently stores dates only, not times or time zones. Keep the event within Google's four-week maximum and any type-specific duration rules.
- Add the required primary and square images. Check Google's current image specifications and safe areas; artwork must not contain text, logos, slogans, or app/game names. A public YouTube video is highly recommended.
- Make sure the tagline is event-specific and the description clearly explains the user value and how to participate. Do not repeat the tagline in the description. For offers, state the value and relevant eligibility or redemption conditions.
- Review the exact language for each market and confirm that event details and creative claims are accurate and distinct from other live events.
- ${timingNote}
- If requesting featuring, confirm eligibility and available quota, and submit at least 14 days before the event starts. Featuring is not guaranteed.
- Review all fields carefully before submitting; Google says submitted events cannot be edited.

## Official references

- [Create promotional content in Play Console](https://support.google.com/googleplay/android-developer/answer/12932541?hl=en)
- [Google Play promotional content quality guidelines](https://support.google.com/googleplay/android-developer/answer/12929944?hl=en)

Google Play provides a promotional-content CSV template in Play Console. Sorted does not generate that template yet because this workspace does not capture all required Console fields (such as country codes, official event type/subtype, UTC times, and asset IDs).

This is a review handoff, not a publish action. Create, review, and submit the event in Play Console.
`;
}
