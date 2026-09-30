export type GooglePlayPromoHandoffInput = {
  title?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  googlePlay?: {
    options?: Array<{ tagline?: string; description?: string }>;
    selectedOption?: number;
    officialEventType?: string;
    eventSubtype?: string;
    startTimeUtc?: string;
    endTimeUtc?: string;
    countryCodes?: string[] | string;
    userEligibility?: string;
  };
  localization?: Array<{ locale?: string; tagline?: string; description?: string }>;
  creative?: {
    concept?: string;
    dimensions?: string;
    proofToShow?: string[] | string;
  };
};

export const GOOGLE_PLAY_PROMO_EVENT_TYPES = [
  { value: "OFFER", label: "Offer" },
  { value: "TIME-LIMITED_EVENT", label: "Time-limited event" },
  { value: "MAJOR_UPDATE", label: "Major update" },
] as const;

export const GOOGLE_PLAY_PROMO_SUBTYPES = {
  OFFER: [
    { value: "DISCOUNT", label: "Discount" },
    { value: "VALUE_ADD", label: "Value-add" },
    { value: "FREE_REWARD", label: "Free reward" },
    { value: "SUBSCRIPTION_TRIAL", label: "Subscription trial" },
  ],
  "TIME-LIMITED_EVENT": [
    { value: "COMPETITION_CHALLENGE", label: "Competition or challenge" },
    { value: "REAL-TIME", label: "Real-time event" },
    { value: "SPECIAL", label: "Special event" },
  ],
  MAJOR_UPDATE: [
    { value: "FEATURES_&_ANNOUNCEMENTS", label: "Features and announcements" },
    { value: "NEW_CONTENT", label: "New content" },
    { value: "PRE_REGISTRATION_UPDATE", label: "Pre-registration update" },
  ],
} as const;

export type GooglePlayPromoEventType = typeof GOOGLE_PLAY_PROMO_EVENT_TYPES[number]["value"];

const eventTypeValues = new Set<string>(GOOGLE_PLAY_PROMO_EVENT_TYPES.map((item) => item.value));

function parseTime(value: string | undefined) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return value;
}

function parseUtcDateTime(date: string | undefined, time: string | undefined) {
  const validDate = parseDate(date ?? "");
  const validTime = parseTime(time);
  if (!validDate || !validTime) return null;
  return new Date(`${date}T${validTime}:00.000Z`);
}

function countryCodes(value: string[] | string | undefined) {
  const input = Array.isArray(value) ? value.join(",") : value ?? "";
  return input.split(/[;,]/).map((code) => code.trim().toUpperCase()).filter(Boolean);
}

export function validateGooglePlayPromoSetup(event: GooglePlayPromoHandoffInput): string[] {
  const errors: string[] = [];
  const googlePlay = event.googlePlay ?? {};
  const type = googlePlay.officialEventType ?? "";

  if (!eventTypeValues.has(type)) errors.push("Choose an official Google Play event type.");
  const allowedSubtypes = eventTypeValues.has(type)
    ? GOOGLE_PLAY_PROMO_SUBTYPES[type as GooglePlayPromoEventType].map((item) => item.value as string)
    : [];
  if (!allowedSubtypes.includes(googlePlay.eventSubtype ?? "")) {
    errors.push("Choose a Google Play event subtype that matches the selected event type.");
  }
  if (type === "OFFER" && !["EVERYONE", "NEW_USERS_ONLY"].includes(googlePlay.userEligibility ?? "")) {
    errors.push("For an offer, choose whether it is available to everyone or only new users.");
  }

  if (!parseDate(event.startDate)) errors.push("Add a valid Google Play event start date in Event plan.");
  if (!parseDate(event.endDate)) errors.push("Add a valid Google Play event end date in Event plan.");
  const start = parseUtcDateTime(event.startDate, googlePlay.startTimeUtc);
  const end = parseUtcDateTime(event.endDate, googlePlay.endTimeUtc);
  if (!parseTime(googlePlay.startTimeUtc)) errors.push("Add a valid Google Play start time in UTC (HH:MM).");
  if (!parseTime(googlePlay.endTimeUtc)) errors.push("Add a valid Google Play end time in UTC (HH:MM).");
  if (start && end) {
    if (end.getTime() <= start.getTime()) errors.push("The Google Play end date and time must be after the start date and time.");
    else if (end.getTime() - start.getTime() > 28 * 86_400_000) errors.push("Google Play events can run for no more than four weeks.");
  }

  const countries = countryCodes(googlePlay.countryCodes);
  if (!countries.length) errors.push("Add at least one Google Play target country or region code.");
  if (countries.some((code) => !/^[A-Z]{2}$/.test(code))) errors.push("Use two-letter country or region codes, separated by commas.");
  if (new Set(countries).size !== countries.length) errors.push("Remove duplicate Google Play country codes.");

  return errors;
}

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

  return [...errors, ...validateGooglePlayPromoSetup(event)];
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
  const countries = countryCodes(event.googlePlay?.countryCodes);
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
- Official Play event type: ${singleLine(event.googlePlay?.officialEventType, "(not selected)")}
- Official Play event subtype: ${singleLine(event.googlePlay?.eventSubtype, "(not selected)")}
- Target countries/regions: ${countries.length ? countries.join("; ") : "(not provided)"}
- Start time (UTC): ${singleLine(event.startDate && event.googlePlay?.startTimeUtc ? `${event.startDate} ${event.googlePlay.startTimeUtc}` : undefined, "(not provided)")}
- End time (UTC): ${singleLine(event.endDate && event.googlePlay?.endTimeUtc ? `${event.endDate} ${event.googlePlay.endTimeUtc}` : undefined, "(not provided)")}
${event.googlePlay?.officialEventType === "OFFER" ? `- Offer eligibility: ${singleLine(event.googlePlay.userEligibility, "(not selected)")}\n` : ""}

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
- Confirm the countries/regions and UTC schedule above match the markets and launch plan in Play Console. Google allows a maximum event duration of four weeks.
- Add the required primary and square images. Check Google's current image specifications and safe areas; artwork must not contain text, logos, slogans, or app/game names. A public YouTube video is highly recommended.
- Make sure the tagline is event-specific and the description clearly explains the user value and how to participate. Do not repeat the tagline in the description. For offers, state the value and relevant eligibility or redemption conditions.
- Review the exact language for each market and confirm that event details and creative claims are accurate and distinct from other live events.
- ${timingNote}
- If requesting featuring, confirm eligibility and available quota, and submit at least 14 days before the event starts. Featuring is not guaranteed.
- Review all fields carefully before submitting; Google says submitted events cannot be edited.

## Official references

- [Create promotional content in Play Console](https://support.google.com/googleplay/android-developer/answer/12932541?hl=en)
- [Google Play promotional content quality guidelines](https://support.google.com/googleplay/android-developer/answer/12929944?hl=en)

Sorted captures the core event type, subtype, target countries, UTC schedule, and selected offer eligibility. Asset upload/IDs and final submission remain in Play Console.

This is a review handoff, not a publish action. Create, review, and submit the event in Play Console.
`;
}
