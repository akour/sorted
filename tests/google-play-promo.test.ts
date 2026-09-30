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
  assert.match(handoff, /### ar/);
  assert.match(handoff, /times in UTC/);
  assert.match(handoff, /review handoff, not a publish action/i);
});

test("rejects invalid copy, repeated tagline, invalid dates, and runs longer than four weeks", () => {
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { options: [{ tagline: "x".repeat(81), description: "Spring puzzle challenge" }] } }).join(" "), /80 characters/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, googlePlay: { options: [{ tagline: "Spring", description: "Join the Spring event and play." }] } }).join(" "), /repeats the tagline/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, startDate: "2026-02-30" }).join(" "), /valid Google Play event start date/);
  assert.match(validateGooglePlayPromoHandoff({ ...validEvent, endDate: "2026-11-07" }).join(" "), /four weeks/);
});
