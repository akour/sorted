import { env } from "cloudflare:workers";

const ADMIN_ENCRYPTION_CONTEXT = "sorted-admin-provider-key-v1";
const PRODUCT_CONNECTION_ENCRYPTION_CONTEXT = "sorted-product-connection-v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getEncryptionKey(usage: KeyUsage[], context: string): Promise<CryptoKey> {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET is required to protect managed provider keys.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${context}:${secret}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usage);
}

async function encryptSecret(value: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(["encrypt"], context);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

async function decryptSecret(value: string, context: string, malformedMessage: string): Promise<string> {
  const [encodedIv, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedCiphertext) throw new Error(malformedMessage);
  const key = await getEncryptionKey(["decrypt"], context);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(encodedIv) as unknown as BufferSource }, key, fromBase64(encodedCiphertext) as unknown as BufferSource);
  return new TextDecoder().decode(plaintext);
}

export function encryptAdminSecret(value: string): Promise<string> {
  return encryptSecret(value, ADMIN_ENCRYPTION_CONTEXT);
}

export function decryptAdminSecret(value: string): Promise<string> {
  return decryptSecret(value, ADMIN_ENCRYPTION_CONTEXT, "Managed provider key is malformed.");
}

export function encryptProductConnectionSecret(value: string): Promise<string> {
  return encryptSecret(value, PRODUCT_CONNECTION_ENCRYPTION_CONTEXT);
}

export function decryptProductConnectionSecret(value: string): Promise<string> {
  return decryptSecret(value, PRODUCT_CONNECTION_ENCRYPTION_CONTEXT, "Product connection credentials are malformed.");
}

export function secretHint(value: string): string {
  const compact = value.trim();
  return compact.length <= 4 ? "••••" : `••••${compact.slice(-4)}`;
}
