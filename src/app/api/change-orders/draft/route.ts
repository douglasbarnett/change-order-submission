import { NextResponse } from "next/server";

import { changeOrderDraftInputSchema, normalizeDraftInput } from "~/lib/change-order-schema";
import { saveDraft } from "~/lib/change-order-store";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = changeOrderDraftInputSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "error",
        message: "Invalid draft payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const saved = saveDraft(normalizeDraftInput(parsed.data));
  return NextResponse.json({ status: "ok", changeOrder: saved });
}
