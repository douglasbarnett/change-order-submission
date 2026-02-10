import { NextResponse } from "next/server";
import { z } from "zod";

import { updateTeamQueueItem, type TeamQueueStatus } from "~/lib/change-order-store";

const updateSchema = z.object({
  teamStatus: z.enum(["NEW", "IN_REVIEW", "NEEDS_INFO", "APPROVED", "DENIED"]).optional(),
  reviewerNotes: z.string().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await request.json();
  const parsed = updateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "error",
        message: "Invalid update payload.",
      },
      { status: 400 },
    );
  }

  const updated = updateTeamQueueItem(id, {
    teamStatus: parsed.data.teamStatus as TeamQueueStatus | undefined,
    reviewerNotes: parsed.data.reviewerNotes,
  });

  if (!updated) {
    return NextResponse.json({ status: "error", message: "Submission not found." }, { status: 404 });
  }

  return NextResponse.json({ status: "ok", changeOrder: updated });
}
