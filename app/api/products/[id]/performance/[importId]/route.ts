import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { googlePlayPerformanceImports, googlePlayPerformanceRows } from "../../../../../../db/schema";
import { getOwnerId, ownerAuthenticationRequired } from "../../../../../../lib/owner";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; importId: string }> }) {
  try {
    const { id, importId: rawImportId } = await context.params;
    const productId = Number(id);
    const importId = Number(rawImportId);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(importId) || importId < 1) return Response.json({ error: "Report not found." }, { status: 404 });
    const db = getDb();
    const [report] = await db.select({ id: googlePlayPerformanceImports.id }).from(googlePlayPerformanceImports).where(and(
      eq(googlePlayPerformanceImports.id, importId),
      eq(googlePlayPerformanceImports.productId, productId),
      eq(googlePlayPerformanceImports.ownerId, ownerId),
    )).limit(1);
    if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
    await db.delete(googlePlayPerformanceRows).where(and(eq(googlePlayPerformanceRows.importId, importId), eq(googlePlayPerformanceRows.productId, productId), eq(googlePlayPerformanceRows.ownerId, ownerId)));
    await db.delete(googlePlayPerformanceImports).where(and(eq(googlePlayPerformanceImports.id, importId), eq(googlePlayPerformanceImports.productId, productId), eq(googlePlayPerformanceImports.ownerId, ownerId)));
    return Response.json({ deleted: true });
  } catch {
    return Response.json({ error: "We could not remove this imported report." }, { status: 500 });
  }
}
