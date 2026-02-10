import { NextResponse } from "next/server";

import { changeOrderInputSchema, evaluateChecklist, isPast24Hours } from "~/lib/change-order-schema";
import { sendEmail } from "~/lib/email";
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

  const teamNotificationTo = (process.env.NEW_CO_NOTIFY_TO || "").trim();
  let submissionNotification: {
    status: "SENT" | "FAILED" | "SKIPPED";
    to?: string;
    mode?: "resend";
    previewUrl?: string;
    error?: string;
  } = { status: "SKIPPED" };

  if (teamNotificationTo) {
    const totalCost = parsed.data.materialCost + parsed.data.laborCost + parsed.data.additionalCharges;
    const subject = `New change order submitted - ${parsed.data.projectId}`;
    const text =
      `A contractor submitted a new change order.` +
      `\n\nProject: ${parsed.data.projectId}` +
      `\nContractor: ${parsed.data.contractorName}` +
      `\nContractor email: ${parsed.data.contractorEmail}` +
      `\nWork performed: ${parsed.data.workPerformedAt}` +
      `\nScope: ${parsed.data.scope}` +
      `\nTotal requested: $${totalCost.toFixed(2)}` +
      `\nPhotos attached: ${parsed.data.photos.length}` +
      `\n\nOpen the team queue to review this submission.`;

    const html = `
      <div style="background:#f2f7ff;padding:20px;font-family:Inter,Segoe UI,Arial,sans-serif;">
        <div style="max-width:640px;margin:0 auto;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;background:#ffffff;">
          <div style="padding:16px 20px;background:#ffffff;border-bottom:1px solid #dbeafe;">
            <img src="cid:remi-logo@change-order" alt="Remi" style="height:24px;display:block;" />
          </div>
          <div style="padding:20px;">
            <p style="margin:0 0 12px;color:#0f172a;font-size:16px;">A new change order was submitted.</p>
            <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:12px 14px;">
              <p style="margin:0;color:#0f4f8b;font-size:14px;"><strong>Project:</strong> ${parsed.data.projectId}</p>
              <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Contractor:</strong> ${parsed.data.contractorName}</p>
              <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Contractor email:</strong> ${parsed.data.contractorEmail}</p>
              <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Work performed:</strong> ${parsed.data.workPerformedAt}</p>
              <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Total requested:</strong> $${totalCost.toFixed(2)}</p>
              <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Photos attached:</strong> ${parsed.data.photos.length}</p>
            </div>
            <p style="margin:14px 0 0;color:#0f172a;font-size:14px;">Open the team queue to review and decide.</p>
          </div>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: teamNotificationTo,
      subject,
      text,
      html,
    });

    submissionNotification = {
      status: result.sent ? "SENT" : "FAILED",
      to: teamNotificationTo,
      mode: result.mode,
      previewUrl: result.previewUrl,
      error: result.error,
    };
  }

  return NextResponse.json({
    status: "ok",
    changeOrder: submitted,
    message: "Change order submitted successfully.",
    submissionNotification,
  });
}
