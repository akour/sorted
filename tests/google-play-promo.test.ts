import assert from "node:assert/strict";
import test from "node:test";
import { buildGooglePlayPromoHandoff, validateGooglePlayPromoHandoff } from "../lib/google-play-promo.ts";

const validEvent = {
  title: "Spring challenge",
  eventType: "seasonal",
  startDate: "2026-10-10",
  endDate: "2026-10-24",
  googlePlay: {
    selectedOption: 1,
    officialEventType: "TIME-LIMITED_EVENT",
    eventSubtype: "COMPETITION_CHALLENGE",
    startTimeUtc: "10:30",
    endTimeUtc: "12:00",
    countryCodes: "US, CA",
    options: [
      { tagline: "Unused option", description: "Unused description" },
      { tagline: "Spring puzzle challenge", description: "Solve fresh seasonal levels to unlock a new challenge and earn a limited-time reward." },
    ],
  },
  localization: [{ locale: "ar", tagline: "\u062a\u062d\u062f\u064a \u0627\u0644\u0631\u0628\u064a\u0639", description: "\u0627\u0646\u0636\u0645 \u0625\u0644\u0649 \u0627\u0644\u062a\u062d\u062f\u064a \u0644\u0641\u062a\u0631\u0629 \u0645\u062d\u062f\u0648\u062f\u0629." }],
} satisfies Parameters<typeof validateGooglePlayPromoHandoff>[0];

test("Google Play handoff only requires the selected Play copy and event basics", () => {
  assert.deepEqual(validateGooglePlayPromoHandoff(validEvent), []);
  const handoff = buildGooglePlayPromoHandoff(validEvent, "Example game", new Date("2026-09-30T00:00:00.000Z"));
  assert.match(handoff, /Spring puzzle challenge/);
  assert.match(handoff, /Example game/);
  assert.match(handoff, /2026-10-10/);
  assert.match(handoff, /TIME-LIMITED_EVENT/);
  assert.match(handoff, /COMPETITION_CHALLENGE/);
  assert.match(handoff, /Target countries\/regions: US; CA/);
  assert.match(handoff, /Start time \(UTC\): 2026-10-10 10:30/);
  assert.match(handoff, /### ar/);
  assert.match(handoff, /review handoff, not a publish action/i);
});

test("rejects invalid copy, repeated tagline, invalid dates, and runs longer than four weeks", () => {
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { options: [{ tagline: "x".repeat(81), description: "Spring puzzle challenge" }] } }).join(" "), /80 characters/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { options: [{ tagline: "Spring", description: "Join the Spring event and play." }] } }).join(" "), /repeats the tagline/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, startDate: "2026-02-30" }).join(" "), /valid Google Play event start date/);
  assert.deepEqual(validateGooglePlayPromoHandoff({ ...validEvent, endDate: "2026-11-07", googlePlay: { ...validEvent.googlePlay, endTimeUtc: "10:30" } }), []);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, endDate: "2026-11-08" }).join(" "), /four weeks/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, endDate: "2026-10-10", googlePlay: { ...validEvent.googlePlay, endTimeUtc: "10:29" } }).join(" "), /end date and time must be after/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { ...validEvent.googlePlay, officialEventType: "OFFER" } }).join(" "), /subtype that matches/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { ...validEvent.googlePlay, countryCodes: "US, us" } }).join(" "), /duplicate/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { ...validEvent.googlePlay, countryCodes: "USA" } }).join(" "), /two-letter/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { ...validEvent.googlePlay, startTimeUtc: "25:00" } }).join(" "), /valid Google Play start time/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { ...validEvent.googlePlay, officialEventType: "OFFER", eventSubtype: "DISCOUNT" } }).join(" "), /available to everyone/);
});
