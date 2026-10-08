export const LISTING_FIELDS = [
  { key: "title", label: "App name", limit: 30 },
  { key: "shortDescription", label: "Short description", limit: 80 },
  { key: "fullDescription", label: "Full description", limit: 4000 },
] as const;
export type ListingCopy = Record<(typeof LISTING_FIELDS)[number]["key"], string>;
export const EMPTY_LISTING: ListingCopy = { title: "", shortDescription: "", fullDescription: "" };
export const SAMPLE_LISTING: ListingCopy = {
  title: "Daylight: Daily Habits",
  shortDescription: "Build small routines and make room for a little progress every day.",
  fullDescription: "A little progress, every day.\n\nChoose a habit. Find your rhythm. Daylight helps you build a daily routine, one small step at a time.\n\nCreate a routine that fits your day\nPick a habit, add a reminder, and check in when you complete it.\n\nNotice your progress\nLook back at your check-ins to see the routines you are building.\n\nIllustrative copy for a fictional app. Replace this example with your own verified product details.",
};
export function checkListing(copy: ListingCopy) {
  const fields = LISTING_FIELDS.map(field => ({ ...field, count: copy[field.key].length, missing: !copy[field.key].trim(), over: Math.max(0, copy[field.key].length - field.limit) }));
  const complete = fields.every(field => !field.missing);
  const withinLimits = complete && fields.every(field => field.over === 0);
  const notes: string[] = [];
  if (copy.title.trim() && copy.title === copy.title.toUpperCase() && /[a-z]/i.test(copy.title)) notes.push("Review all-capital title text. Keep normal capitalization except for genuine brand names or acronyms.");
  if (/(?:#\s*1|\bbest\b|\bnumber one\b|\btop[- ]rated\b)/i.test(`${copy.title} ${copy.shortDescription}`)) notes.push("Review ranking or superiority claims in the title and short description against Google Play's metadata rules.");
  if (copy.title.trim() && copy.title.trim().toLowerCase() === copy.shortDescription.trim().toLowerCase()) notes.push("The short description repeats the title. Use it to explain a distinct benefit.");
  return { fields, complete, withinLimits, notes };
}
