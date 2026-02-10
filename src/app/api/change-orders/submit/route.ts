import { NextResponse } from "next/server";

import { changeOrderInputSchema, evaluateChecklist, isPast24Hours } from "~/lib/change-order-schema";
import { saveBlocked, saveSubmission } from "~/lib/change-order-store";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = changeOrderInputSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "blocked",
        reasons: ["Submission payload is invalid. Please review required fields."],
        issues: parsed.error.flatten(),
      },
      { status: 422 },
    );
  }

  const checklistViolations = evaluateChecklist(parsed.data).map((issue) => issue.message);
  const isLate = isPast24Hours(parsed.data.workPerformedAt);
  const blockingReasons = [...checklistViolations];

  if (isLate) {
    blockingReasons.push("This change order was submitted after 24 hours and cannot be finalized.");
  }

  if (blockingReasons.length > 0) {
    const blocked = saveBlocked(parsed.data, blockingReasons);
    return NextResponse.json(
      {
        status: "blocked",
        changeOrder: blocked,
        reasons: blockingReasons,
      },
      { status: 422 },
    );
  }

  const submitted = saveSubmission(parsed.data);
  return NextResponse.json({
    status: "ok",
    changeOrder: submitted,
    message: "Change order submitted successfully.",
  });
}
