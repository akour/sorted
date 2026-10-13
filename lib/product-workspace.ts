import { classifyProductUrl } from "./product-url";

export function productWorkspaceKind(product: { type: string; url?: string }) {
  const store = classifyProductUrl(product.url ?? "");
  if (store === "google-play" || store === "app-store") return store;
  return product.type.toLowerCase() === "website" ? "website" : "unselected-store";
}

export function productSectionAllowed(product: { type: string; url: string }, view: string) {
  const kind = productWorkspaceKind(product);
  if (kind === "website") return !["Keywords", "Optimize", "Results", "Connections", "Calendar", "Publish", "Create"].includes(view);
  if (view === "SEO") return true; // SEO is for the app's owned website.
  if (kind !== "google-play") return !["Keywords", "Results", "Connections", "Calendar"].includes(view);
  return true;
}
