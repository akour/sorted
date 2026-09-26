export const OWNER_ONLY_SITE_HOST = "sorted-workspace.akourx2.chatgpt.site";
export const OWNER_ONLY_SITE_ORIGIN = `https://${OWNER_ONLY_SITE_HOST}`;

export const AUTH_ALLOWED_HOSTS = [
  OWNER_ONLY_SITE_HOST,
  "sort3d.space",
  "www.sort3d.space",
  "localhost:*",
  "127.0.0.1:*",
];

export const AUTH_TRUSTED_ORIGINS = [
  OWNER_ONLY_SITE_ORIGIN,
  "https://sort3d.space",
  "https://www.sort3d.space",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];

export function isOwnerOnlySiteHost(host: string | null | undefined): boolean {
  return normalizeHost(host) === OWNER_ONLY_SITE_HOST;
}

export function isCustomerAuthHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host);
  return (
    normalized === "sort3d.space" ||
    normalized === "www.sort3d.space" ||
    normalized === "localhost" ||
    normalized === "127.0.0.1"
  );
}

export function normalizeHost(host: string | null | undefined): string {
  return host?.trim().split(":", 1)[0]?.toLowerCase() ?? "";
}
