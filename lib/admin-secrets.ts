import { env } from "cloudflare:workers";

const ENCRYPTION_CONTEXT = "sorted-admin-provider-key-v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getEncryptionKey(usage: KeyUsage[]): Promise<CryptoKey> {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET is required to protect managed provider keys.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ENCRYPTION_CONTEXT}:${secret}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usage);
}

export async function encryptAdminSecret(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptAdminSecret(value: string): Promise<string> {
  const [encodedIv, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedCiphertext) throw new Error("Managed provider key is malformed.");
  const key = await getEncryptionKey(["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(encodedIv) as unknown as BufferSource }, key, fromBase64(encodedCiphertext) as unknown as BufferSource);
  return new TextDecoder().decode(plaintext);
}

export function secretHint(value: string): string {
  const compact = value.trim();
  return compact.length <= 4 ? "••••" : `••••${compact.slice(-4)}`;
}
