import { classifyProductUrl, isPublicProductHostname, normalizeProductUrlInput } from "./product-url";

export function getInitialProductIconUrl(value: string): string {
  const normalized = normalizeProductUrlInput(value);
  if (!normalized || classifyProductUrl(normalized) !== "website") return "";
  const hostname = new URL(normalized).hostname;
  if (!isPublicProductHostname(hostname)) return "";
  return "https://www.google.com/s2/favicons?domain_url="
    + encodeURIComponent("https://" + hostname)
    + "&sz=128";
}
