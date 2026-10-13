import { classifyProductUrl } from "./product-url";

export type ProductDestinations = { type: string; url?: string; websiteUrl?: string; googlePlayUrl?: string; appStoreUrl?: string };

export function hasWebsiteDestination(product: ProductDestinations) {
  const urlKind = classifyProductUrl(product.url ?? "");
  return Boolean(product.websiteUrl || urlKind === "website" || (product.type.toLowerCase() === "website" && !product.url && !product.googlePlayUrl && !product.appStoreUrl));
}

export function hasGooglePlayDestination(product: ProductDestinations) {
  return Boolean(product.googlePlayUrl || classifyProductUrl(product.url ?? "") === "google-play");
}

export function hasAppStoreDestination(product: ProductDestinations) {
  return Boolean(product.appStoreUrl || classifyProductUrl(product.url ?? "") === "app-store");
}

export function productWorkspaceKind(product: ProductDestinations) {
  const store = classifyProductUrl(product.url ?? "");
  if (product.type.toLowerCase() === "website" && hasWebsiteDestination(product)) return "website";
  if (store === "google-play" || store === "app-store") return store;
  if (hasGooglePlayDestination(product)) return "google-play";
  if (hasAppStoreDestination(product)) return "app-store";
  if (hasWebsiteDestination(product)) return "website";
  return product.type.toLowerCase() === "website" ? "website" : "unselected-store";
}

export function productSectionAllowed(product: ProductDestinations, view: string) {
  if (view === "SEO" || view === "Answers") return hasWebsiteDestination(product);
  if (view === "Keywords" || view === "Results" || view === "Connections") return hasGooglePlayDestination(product);
  if (view === "Optimize") return hasGooglePlayDestination(product) || hasAppStoreDestination(product);
  if (view === "Calendar") return product.type.toLowerCase() !== "website" && (hasGooglePlayDestination(product) || hasAppStoreDestination(product));
  if (view === "Publish" || view === "Create") return product.type.toLowerCase() !== "website" && (hasGooglePlayDestination(product) || hasAppStoreDestination(product));
  if (["Research", "Settings", "Product workspace"].includes(view)) return true;
  return false;
}
