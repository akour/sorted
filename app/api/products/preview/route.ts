import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { fetchProductMetadata } from "../../../../lib/product-icons";
import { normalizeProductUrlInput } from "../../../../lib/product-url";

export async function POST(request: Request) {
  let failureStage = "authenticate";
  try {
    if (!(await getOwnerId())) return ownerAuthenticationRequired();
    failureStage = "read-request";
    const payload = await request.json().catch(() => ({})) as { url?: unknown };
    const rawUrl = typeof payload.url === "string" ? payload.url : "";
    const url = normalizeProductUrlInput(rawUrl);
    if (!url) return Response.json({ error: "Paste a public website, Google Play, or App Store link." }, { status: 400 });

    failureStage = "fetch-product-metadata";
    const preview = await fetchProductMetadata(url);
    if (!preview) return Response.json({ error: "We could not identify that product link." }, { status: 400 });
    return Response.json({ preview });
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message.replace(/https?:\/\/[^\s)]+/g, "[redacted URL]").slice(0, 180)
      : "Unknown error";
    console.error("product_preview_failed", {
      stage: failureStage,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage,
    });
    return Response.json({ error: "We could not read details from that link." }, { status: 502 });
  }
}
