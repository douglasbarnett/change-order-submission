import { NextResponse } from "next/server";
import { z } from "zod";

import { sendDecisionEmail } from "~/lib/email";
import {
  applyTeamDecision,
  getChangeOrderById,
  hasValidContractorEmail,
  type DenialReasonCode,
  updateDecisionEmailDelivery,
} from "~/lib/change-order-store";

const denialReasonCodes = [
  "MISSING_REQUIRED_INFO",
  "INSUFFICIENT_PHOTO_EVIDENCE",
  "OUTSIDE_24_HOUR_WINDOW",
  "DUPLICATE_REQUEST",
  "PRICING_NOT_JUSTIFIED",
  "IN_SCOPE_OF_TURNKEY",
  "OTHER",
] as const;

const decisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("NEEDS_INFO"),
    decidedBy: z.string().min(1),
    decisionExplanation: z.string().min(1),
    contractorFacingMessage: z.string().optional().default(""),
    needsInfoChecklist: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    action: z.literal("APPROVE"),
    decidedBy: z.string().min(1),
    approvedAmount: z.number().positive(),
    decisionExplanation: z.string().min(1),
    contractorFacingMessage: z.string().optional().default(""),
    acknowledgeLateSubmission: z.boolean().optional().default(false),
    isLate: z.boolean().optional().default(false),
  }),
  z.object({
    action: z.literal("DENY"),
    decidedBy: z.string().min(1),
    denialReasonCode: z.enum(denialReasonCodes),
    decisionExplanation: z.string().min(1),
    contractorFacingMessage: z.string().optional().default(""),
  }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const existing = getChangeOrderById(id);
  if (!existing) {
    return NextResponse.json({ status: "error", message: "Submission not found." }, { status: 404 });
  }

  if (existing.status !== "SUBMITTED") {
    return NextResponse.json(
      {
        status: "error",
        message: "Only submitted change orders can be reviewed.",
      },
      { status: 422 },
    );
  }

  const payload = await request.json();
  const parsed = decisionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "error",
        message: "Invalid decision payload.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  if (parsed.data.action === "APPROVE" && parsed.data.isLate && !parsed.data.acknowledgeLateSubmission) {
    return NextResponse.json(
      {
        status: "error",
        message: "Late submissions require explicit acknowledgment before approval.",
      },
      { status: 422 },
    );
  }

  const updated =
    parsed.data.action === "NEEDS_INFO"
      ? applyTeamDecision(id, {
          action: "NEEDS_INFO",
          decidedBy: parsed.data.decidedBy,
          decisionExplanation: parsed.data.decisionExplanation,
          contractorFacingMessage: parsed.data.contractorFacingMessage,
          needsInfoChecklist: parsed.data.needsInfoChecklist,
        })
      : parsed.data.action === "APPROVE"
        ? applyTeamDecision(id, {
            action: "APPROVE",
            decidedBy: parsed.data.decidedBy,
            approvedAmount: parsed.data.approvedAmount,
            decisionExplanation: parsed.data.decisionExplanation,
            contractorFacingMessage: parsed.data.contractorFacingMessage,
          })
        : applyTeamDecision(id, {
            action: "DENY",
            decidedBy: parsed.data.decidedBy,
            denialReasonCode: parsed.data.denialReasonCode as DenialReasonCode,
            decisionExplanation: parsed.data.decisionExplanation,
            contractorFacingMessage: parsed.data.contractorFacingMessage,
          });

  if (!updated) {
    return NextResponse.json({ status: "error", message: "Submission not found." }, { status: 404 });
  }

  if (!hasValidContractorEmail(updated)) {
    const failed = updateDecisionEmailDelivery(id, {
      status: "FAILED",
      error: "Invalid contractor email address.",
    });
    return NextResponse.json({
      status: "ok",
      changeOrder: failed ?? updated,
      emailStatus: "FAILED",
    });
  }

  const emailResult = await sendDecisionEmail({
    to: updated.input.contractorEmail,
    subject: updated.decisionEmailSubject ?? "Change order decision",
    text: updated.decisionEmailBody ?? "A decision has been made on your change order.",
    html: updated.decisionEmailHtml,
  });

  const withDelivery = updateDecisionEmailDelivery(id, {
    status: emailResult.sent ? "SENT" : "FAILED",
    error: emailResult.error,
    previewUrl: emailResult.previewUrl,
    mode: emailResult.mode,
  });

  return NextResponse.json({
    status: "ok",
    changeOrder: withDelivery ?? updated,
    emailStatus: emailResult.sent ? "SENT" : "FAILED",
    emailPreviewUrl: emailResult.previewUrl,
  });
}
