import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";

export async function POST() {
  try {
    if (!(await getOwnerId())) return ownerAuthenticationRequired();
    return Response.json({ error: "AI connection tests are managed from the administrator portal." }, { status: 403 });
  } catch (error) {
    console.error("AI connection test failed", error);
    return Response.json({ error: "The AI connection test failed." }, { status: 500 });
  }
}
