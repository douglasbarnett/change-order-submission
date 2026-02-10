import { NextResponse } from "next/server";

import { changeOrderInputSchema, evaluateChecklist, isPast24Hours } from "~/lib/change-order-schema";
import { sendEmail } from "~/lib/email";
import { saveBlocked, saveSubmission } from "~/lib/change-order-store";

type SubmissionNotification = {
  status: "SENT" | "FAILED" | "SKIPPED";
  to?: string;
  mode?: "resend";
  previewUrl?: string;
  error?: string;
};

async function sendTeamSubmissionNotification(
  input: {
    projectId: string;
    contractorName: string;
    contractorEmail: string;
    workPerformedAt: string;
    scope: string;
    materialCost: number;
    laborCost: number;
    additionalCharges: number;
    photos: string[];
  },
  submissionStatus: "SUBMITTED" | "BLOCKED",
  blockingReasons?: string[],
): Promise<SubmissionNotification> {
  const teamNotificationTo = (process.env.NEW_CO_NOTIFY_TO || "").trim();
  if (!teamNotificationTo) {
    return { status: "SKIPPED", error: "NEW_CO_NOTIFY_TO is not configured." };
  }

  const totalCost = input.materialCost + input.laborCost + input.additionalCharges;
  const statusLabel = submissionStatus === "SUBMITTED" ? "Submitted" : "Blocked";
  const blockingLines =
    submissionStatus === "BLOCKED" && blockingReasons && blockingReasons.length > 0
      ? `\n\nBlocking reasons:\n${blockingReasons.map((reason) => `- ${reason}`).join("\n")}`
      : "";

  const subject = `New change order ${statusLabel.toLowerCase()} - ${input.projectId}`;
  const text =
    `A contractor submitted a new change order.` +
    `\n\nStatus: ${statusLabel}` +
    `\nProject: ${input.projectId}` +
    `\nContractor: ${input.contractorName}` +
    `\nContractor email: ${input.contractorEmail}` +
    `\nWork performed: ${input.workPerformedAt}` +
    `\nScope: ${input.scope}` +
    `\nTotal requested: $${totalCost.toFixed(2)}` +
    `\nPhotos attached: ${input.photos.length}` +
    `${blockingLines}` +
    `\n\nOpen the team queue to review this submission.`;

  const blockingHtml =
    submissionStatus === "BLOCKED" && blockingReasons && blockingReasons.length > 0
      ? `<div style="margin-top:12px;border:1px solid #fecdd3;background:#fff1f2;border-radius:8px;padding:10px 12px;">
          <p style="margin:0;color:#9f1239;font-size:14px;"><strong>Blocking reasons:</strong></p>
          <ul style="margin:8px 0 0 18px;padding:0;color:#9f1239;font-size:14px;">
            ${blockingReasons.map((reason) => `<li style="margin:0 0 6px;">${reason}</li>`).join("")}
          </ul>
        </div>`
      : "";

  const statusColor = submissionStatus === "SUBMITTED" ? "#166534" : "#9f1239";
  const html = `
    <div style="background:#f2f7ff;padding:20px;font-family:Inter,Segoe UI,Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;background:#ffffff;">
        <div style="padding:16px 20px;background:#ffffff;border-bottom:1px solid #dbeafe;">
          <img src="cid:remi-logo@change-order" alt="Remi" style="height:24px;display:block;" />
        </div>
        <div style="padding:20px;">
          <p style="margin:0 0 12px;color:#0f172a;font-size:16px;">A new change order was submitted.</p>
          <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:12px 14px;">
            <p style="margin:0;color:${statusColor};font-size:14px;"><strong>Status:</strong> ${statusLabel}</p>
            <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Project:</strong> ${input.projectId}</p>
            <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Contractor:</strong> ${input.contractorName}</p>
            <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Contractor email:</strong> ${input.contractorEmail}</p>
            <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Work performed:</strong> ${input.workPerformedAt}</p>
            <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Total requested:</strong> $${totalCost.toFixed(2)}</p>
            <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Photos attached:</strong> ${input.photos.length}</p>
          </div>
          ${blockingHtml}
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

  return {
    status: result.sent ? "SENT" : "FAILED",
    to: teamNotificationTo,
    mode: result.mode,
    previewUrl: result.previewUrl,
    error: result.error,
  };
}

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
    const submissionNotification = await sendTeamSubmissionNotification(parsed.data, "BLOCKED", blockingReasons);
    return NextResponse.json(
      {
        status: "blocked",
        changeOrder: blocked,
        reasons: blockingReasons,
        submissionNotification,
      },
      { status: 422 },
    );
  }

  const submitted = saveSubmission(parsed.data);
  const submissionNotification = await sendTeamSubmissionNotification(parsed.data, "SUBMITTED");

  return NextResponse.json({
    status: "ok",
    changeOrder: submitted,
    message: "Change order submitted successfully.",
    submissionNotification,
  });
}
