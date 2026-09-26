import { fetchProductMetadata } from "../../../../lib/product-icons";
import { normalizeProductUrlInput } from "../../../../lib/product-url";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { url?: unknown };
    const rawUrl = typeof payload.url === "string" ? payload.url : "";
    const url = normalizeProductUrlInput(rawUrl);
    if (!url) return Response.json({ error: "Paste a public website, Google Play, or App Store link." }, { status: 400 });

    const preview = await fetchProductMetadata(url);
    if (!preview) return Response.json({ error: "We could not identify that product link." }, { status: 400 });
    return Response.json({ preview });
  } catch {
    return Response.json({ error: "We could not read details from that link. You can still add the product manually." }, { status: 502 });
  }
}
