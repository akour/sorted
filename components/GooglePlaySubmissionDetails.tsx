"use client";

import {
  GOOGLE_PLAY_PROMO_EVENT_TYPES,
  GOOGLE_PLAY_PROMO_SUBTYPES,
  validateGooglePlayPromoSetup,
  type GooglePlayPromoEventType,
} from "../lib/google-play-promo";
import { GooglePlayAssetsPanel } from "./GooglePlayAssetsPanel";
import type { GooglePlayAssetSet } from "../lib/google-play-assets";

type GooglePlaySetup = GooglePlayAssetSet & {
  officialEventType?: string;
  eventSubtype?: string;
  startTimeUtc?: string;
  endTimeUtc?: string;
  countryCodes?: string[] | string;
  userEligibility?: string;
};

export function GooglePlaySubmissionDetails({
  startDate,
  endDate,
  value,
  onChange,
}: {
  startDate: string;
  endDate: string;
  value: GooglePlaySetup;
  onChange: (next: Partial<GooglePlaySetup>) => void;
}) {
  const eventType = value.officialEventType ?? "";
  const subtypes = eventType in GOOGLE_PLAY_PROMO_SUBTYPES
    ? GOOGLE_PLAY_PROMO_SUBTYPES[eventType as GooglePlayPromoEventType]
    : [];
  const errors = validateGooglePlayPromoSetup({ startDate, endDate, googlePlay: value });
  const countryText = Array.isArray(value.countryCodes) ? value.countryCodes.join(", ") : value.countryCodes ?? "";

  return (
    <section className="google-play-submission" aria-labelledby="google-play-submission-heading">
      <div className="event-card-heading">
        <div>
          <p className="eyebrow">Play Console setup</p>
          <h3 id="google-play-submission-heading">Complete the event details</h3>
          <span>Dates come from Event plan. Enter times as UTC, not your local time.</span>
        </div>
      </div>
      <div className="event-form-grid">
        <label>Official event type
          <select value={eventType} onChange={(event) => onChange({ officialEventType: event.target.value, eventSubtype: "", userEligibility: event.target.value === "OFFER" ? value.userEligibility : "" })}>
            <option value="">Choose an event type</option>
            {GOOGLE_PLAY_PROMO_EVENT_TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Official subtype
          <select value={value.eventSubtype ?? ""} onChange={(event) => onChange({ eventSubtype: event.target.value })} disabled={!subtypes.length}>
            <option value="">Choose a subtype</option>
            {subtypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Start time <span className="field-help">UTC</span>
          <input type="time" value={value.startTimeUtc ?? ""} onChange={(event) => onChange({ startTimeUtc: event.target.value })} />
        </label>
        <label>End time <span className="field-help">UTC</span>
          <input type="time" value={value.endTimeUtc ?? ""} onChange={(event) => onChange({ endTimeUtc: event.target.value })} />
        </label>
        <label className="google-play-countries">Target countries / regions <span className="field-help">Two-letter codes separated by commas, e.g. US, CA, GB</span>
          <input value={countryText} onChange={(event) => onChange({ countryCodes: event.target.value })} placeholder="US, CA, GB" autoCapitalize="characters" />
        </label>
        {eventType === "OFFER" && <label>Offer eligibility
          <select value={value.userEligibility ?? ""} onChange={(event) => onChange({ userEligibility: event.target.value })}>
            <option value="">Choose eligibility</option>
            <option value="EVERYONE">Everyone</option>
            <option value="NEW_USERS_ONLY">New users only</option>
          </select>
        </label>}
      </div>
      {errors.length ? <p className="google-play-setup-status" role="status">Handoff setup still needs: {errors.join(" ")}</p> : <p className="google-play-setup-status ready">Required Play event details are ready for review.</p>}
      <GooglePlayAssetsPanel value={value} onChange={onChange} />
    </section>
  );
}
