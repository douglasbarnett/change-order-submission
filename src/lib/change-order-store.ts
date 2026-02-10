import type { ChangeOrderInput } from "./change-order-schema";

export type TeamQueueStatus = "NEW" | "IN_REVIEW" | "NEEDS_INFO" | "APPROVED" | "DENIED";
export type DecisionStatus = "PENDING" | "NEEDS_INFO" | "APPROVED" | "DENIED";
export type DenialReasonCode =
  | "MISSING_REQUIRED_INFO"
  | "INSUFFICIENT_PHOTO_EVIDENCE"
  | "OUTSIDE_24_HOUR_WINDOW"
  | "DUPLICATE_REQUEST"
  | "PRICING_NOT_JUSTIFIED"
  | "IN_SCOPE_OF_TURNKEY"
  | "OTHER";
export type DecisionEmailStatus = "PENDING" | "SENT" | "FAILED";
export type DecisionEmailMode = "smtp" | "preview";

export type StoredChangeOrder = {
  id: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  status: "DRAFT" | "SUBMITTED" | "BLOCKED";
  input: ChangeOrderInput;
  blockingReasons?: string[];
  teamStatus: TeamQueueStatus;
  reviewerNotes: string;
  decisionStatus: DecisionStatus;
  decisionAt?: string;
  decisionBy?: string;
  approvedAmount?: number;
  denialReasonCode?: DenialReasonCode;
  decisionExplanation?: string;
  contractorFacingMessage?: string;
  needsInfoChecklist: string[];
  isFinalized: boolean;
  decisionEmailStatus: DecisionEmailStatus;
  decisionEmailSentAt?: string;
  decisionEmailTo?: string;
  decisionEmailSubject?: string;
  decisionEmailBody?: string;
  decisionEmailHtml?: string;
  decisionEmailError?: string;
  decisionEmailPreviewUrl?: string;
  decisionEmailMode?: DecisionEmailMode;
};

declare global {
  // eslint-disable-next-line no-var
  var __changeOrderPocStore: StoredChangeOrder[] | undefined;
}

const store = globalThis.__changeOrderPocStore ?? [];
globalThis.__changeOrderPocStore = store;

const strictEmailRegex =
  /^(?!.*\.\.)([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/;

function isValidEmail(value: string): boolean {
  return strictEmailRegex.test(value.trim());
}

function normalizeRecord(record: StoredChangeOrder): StoredChangeOrder {
  return {
    ...record,
    updatedAt: record.updatedAt ?? record.createdAt ?? new Date().toISOString(),
    teamStatus:
      record.teamStatus === "DENIED" || record.teamStatus === "APPROVED" || record.teamStatus === "NEEDS_INFO"
        ? record.teamStatus
        : record.teamStatus === "IN_REVIEW"
          ? "IN_REVIEW"
          : "NEW",
    decisionStatus: record.decisionStatus ?? "PENDING",
    needsInfoChecklist: record.needsInfoChecklist ?? [],
    reviewerNotes: record.reviewerNotes ?? "",
    isFinalized: record.isFinalized ?? false,
    decisionEmailStatus: record.decisionEmailStatus ?? "PENDING",
    decisionEmailError: record.decisionEmailError ?? undefined,
    decisionEmailPreviewUrl: record.decisionEmailPreviewUrl ?? undefined,
    decisionEmailMode: record.decisionEmailMode ?? undefined,
    decisionEmailHtml: record.decisionEmailHtml ?? undefined,
  };
}

export function listChangeOrders(): StoredChangeOrder[] {
  return [...store].map(normalizeRecord).reverse();
}

export function getChangeOrderById(id: string): StoredChangeOrder | null {
  const record = store.find((item) => item.id === id);
  return record ? normalizeRecord(record) : null;
}

export function saveDraft(input: ChangeOrderInput): StoredChangeOrder {
  const record: StoredChangeOrder = {
    id: `co_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "DRAFT",
    input,
    teamStatus: "NEW",
    reviewerNotes: "",
    decisionStatus: "PENDING",
    needsInfoChecklist: [],
    isFinalized: false,
    decisionEmailStatus: "PENDING",
  };
  store.push(record);
  return record;
}

export function saveSubmission(input: ChangeOrderInput): StoredChangeOrder {
  const record: StoredChangeOrder = {
    id: `co_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    status: "SUBMITTED",
    input,
    teamStatus: "NEW",
    reviewerNotes: "",
    decisionStatus: "PENDING",
    needsInfoChecklist: [],
    isFinalized: false,
    decisionEmailStatus: "PENDING",
  };
  store.push(record);
  return record;
}

export function saveBlocked(input: ChangeOrderInput, blockingReasons: string[]): StoredChangeOrder {
  const record: StoredChangeOrder = {
    id: `co_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "BLOCKED",
    input,
    blockingReasons,
    teamStatus: "NEW",
    reviewerNotes: "",
    decisionStatus: "PENDING",
    needsInfoChecklist: [],
    isFinalized: false,
    decisionEmailStatus: "PENDING",
  };
  store.push(record);
  return record;
}

export function updateTeamQueueItem(
  id: string,
  updates: { teamStatus?: TeamQueueStatus; reviewerNotes?: string },
): StoredChangeOrder | null {
  const index = store.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const current = store[index];
  if (current.isFinalized) {
    return current;
  }

  const next: StoredChangeOrder = {
    ...current,
    teamStatus: updates.teamStatus ?? current.teamStatus,
    reviewerNotes: updates.reviewerNotes ?? current.reviewerNotes,
    updatedAt: new Date().toISOString(),
  };
  store[index] = next;
  return next;
}

type DecisionInput =
  | {
      action: "NEEDS_INFO";
      decidedBy: string;
      decisionExplanation: string;
      contractorFacingMessage?: string;
      needsInfoChecklist: string[];
    }
  | {
      action: "APPROVE";
      decidedBy: string;
      approvedAmount: number;
      decisionExplanation: string;
      contractorFacingMessage?: string;
    }
  | {
      action: "DENY";
      decidedBy: string;
      denialReasonCode: DenialReasonCode;
      decisionExplanation: string;
      contractorFacingMessage?: string;
    };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildDecisionEmailContent(record: StoredChangeOrder): { subject: string; body: string; html: string } {
  const projectLabel = record.input.projectId || "your project";
  const contractorName = record.input.contractorName || "Contractor";
  const decisionLabel = record.decisionStatus === "DENIED" ? "Denied" : record.decisionStatus === "APPROVED" ? "Approved" : "Needs Info";
  const accentColor = record.decisionStatus === "DENIED" ? "#be123c" : record.decisionStatus === "APPROVED" ? "#166534" : "#0f4f8b";
  const messageBlock = escapeHtml(record.contractorFacingMessage || "");
  const baseHeader = `
    <div style="padding:16px 20px;background:#ffffff;border-bottom:1px solid #dbeafe;">
      <img src="cid:remi-logo@change-order" alt="Remi" style="height:24px;display:block;" />
    </div>
  `;

  const baseFooter = `
    <div style="padding:14px 20px;border-top:1px solid #dbeafe;background:#f8fbff;color:#64748b;font-size:12px;line-height:1.5;">
      Remi Change Orders Team<br/>
      This message was sent for project ${escapeHtml(projectLabel)}.
    </div>
  `;

  const wrapHtml = (inner: string) => `
    <div style="background:#f2f7ff;padding:20px;font-family:Inter,Segoe UI,Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;background:#ffffff;">
        ${baseHeader}
        <div style="padding:20px;">
          ${inner}
        </div>
        ${baseFooter}
      </div>
    </div>
  `;

  if (record.decisionStatus === "APPROVED") {
    const subject = `Change order approved - ${projectLabel}`;
    const body =
      `Hello ${contractorName},` +
      `\n\nYour change order has been approved.` +
      `\nProject: ${projectLabel}` +
      `\nApproved amount: $${record.approvedAmount?.toFixed(2) ?? "0.00"}` +
      (record.contractorFacingMessage ? `\n\nMessage from Remi:\n${record.contractorFacingMessage}` : "") +
      `\n\nThank you,\nRemi Change Orders Team`;

    const html = wrapHtml(`
      <p style="margin:0 0 12px;color:#0f172a;font-size:16px;">Hello ${escapeHtml(contractorName)},</p>
      <p style="margin:0 0 14px;color:#0f172a;font-size:15px;">
        Your change order has been <strong style="color:${accentColor};">approved</strong>.
      </p>
      <div style="border:1px solid #dcfce7;background:#f0fdf4;border-radius:8px;padding:12px 14px;margin:0 0 14px;">
        <p style="margin:0;color:#14532d;font-size:14px;"><strong>Project:</strong> ${escapeHtml(projectLabel)}</p>
        <p style="margin:8px 0 0;color:#14532d;font-size:14px;"><strong>Approved amount:</strong> $${record.approvedAmount?.toFixed(2) ?? "0.00"}</p>
      </div>
      ${
        messageBlock
          ? `<p style="margin:0;color:#0f172a;font-size:14px;white-space:pre-wrap;"><strong>Message from Remi:</strong><br/>${messageBlock}</p>`
          : ""
      }
    `);

    return {
      subject,
      body,
      html,
    };
  }
  if (record.decisionStatus === "DENIED") {
    const subject = `Change order denied - ${projectLabel}`;
    const body =
      `Hello ${contractorName},` +
      `\n\nYour change order has been denied.` +
      `\nProject: ${projectLabel}` +
      `\nReason: ${record.denialReasonCode || "N/A"}` +
      (record.contractorFacingMessage ? `\n\nMessage from Remi:\n${record.contractorFacingMessage}` : "") +
      `\n\nThank you,\nRemi Change Orders Team`;

    const html = wrapHtml(`
      <p style="margin:0 0 12px;color:#0f172a;font-size:16px;">Hello ${escapeHtml(contractorName)},</p>
      <p style="margin:0 0 14px;color:#0f172a;font-size:15px;">
        Your change order has been <strong style="color:${accentColor};">denied</strong>.
      </p>
      <div style="border:1px solid #fecdd3;background:#fff1f2;border-radius:8px;padding:12px 14px;margin:0 0 14px;">
        <p style="margin:0;color:#9f1239;font-size:14px;"><strong>Project:</strong> ${escapeHtml(projectLabel)}</p>
        <p style="margin:8px 0 0;color:#9f1239;font-size:14px;"><strong>Reason code:</strong> ${escapeHtml(record.denialReasonCode || "N/A")}</p>
      </div>
      ${
        messageBlock
          ? `<p style="margin:0;color:#0f172a;font-size:14px;white-space:pre-wrap;"><strong>Message from Remi:</strong><br/>${messageBlock}</p>`
          : ""
      }
    `);

    return {
      subject,
      body,
      html,
    };
  }
  const requestedItems =
    record.needsInfoChecklist.length > 0
      ? record.needsInfoChecklist.map((line) => `- ${line}`).join("\n")
      : "- Additional details requested.";
  const subject = `More information needed - ${projectLabel}`;
  const body =
    `Hello ${contractorName},` +
    `\n\nWe need more information to review your change order.` +
    `\nProject: ${projectLabel}` +
    `\n\nRequested items:\n${requestedItems}` +
    (record.contractorFacingMessage ? `\n\nMessage from Remi:\n${record.contractorFacingMessage}` : "") +
    `\n\nThank you,\nRemi Change Orders Team`;

  const listHtml =
    record.needsInfoChecklist.length > 0
      ? `<ul style="margin:8px 0 0 18px;padding:0;color:#0f4f8b;font-size:14px;">${record.needsInfoChecklist
          .map((line) => `<li style="margin:0 0 6px;">${escapeHtml(line)}</li>`)
          .join("")}</ul>`
      : `<p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;">Additional details requested.</p>`;

  const html = wrapHtml(`
    <p style="margin:0 0 12px;color:#0f172a;font-size:16px;">Hello ${escapeHtml(contractorName)},</p>
    <p style="margin:0 0 14px;color:#0f172a;font-size:15px;">
      We need <strong style="color:${accentColor};">more information</strong> to review your change order.
    </p>
    <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:12px 14px;margin:0 0 14px;">
      <p style="margin:0;color:#0f4f8b;font-size:14px;"><strong>Project:</strong> ${escapeHtml(projectLabel)}</p>
      <p style="margin:8px 0 0;color:#0f4f8b;font-size:14px;"><strong>Requested items:</strong></p>
      ${listHtml}
    </div>
    ${
      messageBlock
        ? `<p style="margin:0;color:#0f172a;font-size:14px;white-space:pre-wrap;"><strong>Message from Remi:</strong><br/>${messageBlock}</p>`
        : ""
    }
  `);

  return {
    subject,
    body,
    html,
  };
}

function prepareDecisionEmail(record: StoredChangeOrder): StoredChangeOrder {
  const to = record.input.contractorEmail?.trim() ?? "";
  const { subject, body, html } = buildDecisionEmailContent(record);
  return {
    ...record,
    decisionEmailStatus: "PENDING",
    decisionEmailSentAt: undefined,
    decisionEmailTo: to,
    decisionEmailSubject: subject,
    decisionEmailBody: body,
    decisionEmailHtml: html,
    decisionEmailError: undefined,
    decisionEmailPreviewUrl: undefined,
  };
}

export function applyTeamDecision(id: string, decision: DecisionInput): StoredChangeOrder | null {
  const index = store.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const current = store[index];
  if (current.isFinalized) {
    return current;
  }

  const now = new Date().toISOString();
  let next: StoredChangeOrder = {
    ...current,
    teamStatus: "IN_REVIEW",
    updatedAt: now,
    decisionAt: now,
    decisionBy: decision.decidedBy,
    decisionExplanation: decision.decisionExplanation,
    contractorFacingMessage: decision.contractorFacingMessage ?? "",
  };

  if (decision.action === "NEEDS_INFO") {
    next = {
      ...next,
      teamStatus: "NEEDS_INFO",
      decisionStatus: "NEEDS_INFO",
      needsInfoChecklist: decision.needsInfoChecklist,
      approvedAmount: undefined,
      denialReasonCode: undefined,
      isFinalized: false,
    };
    next = prepareDecisionEmail(next);
  }

  if (decision.action === "APPROVE") {
    next = {
      ...next,
      teamStatus: "APPROVED",
      decisionStatus: "APPROVED",
      approvedAmount: decision.approvedAmount,
      denialReasonCode: undefined,
      needsInfoChecklist: [],
      isFinalized: true,
    };
    next = prepareDecisionEmail(next);
  }

  if (decision.action === "DENY") {
    next = {
      ...next,
      teamStatus: "DENIED",
      decisionStatus: "DENIED",
      denialReasonCode: decision.denialReasonCode,
      approvedAmount: undefined,
      needsInfoChecklist: [],
      isFinalized: true,
    };
    next = prepareDecisionEmail(next);
  }

  store[index] = next;
  return next;
}

export function updateDecisionEmailDelivery(
  id: string,
  delivery: {
    status: DecisionEmailStatus;
    error?: string;
    previewUrl?: string;
    sentAt?: string;
    mode?: DecisionEmailMode;
  },
): StoredChangeOrder | null {
  const index = store.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }
  const current = normalizeRecord(store[index]);
  const next: StoredChangeOrder = {
    ...current,
    decisionEmailStatus: delivery.status,
    decisionEmailSentAt: delivery.sentAt ?? new Date().toISOString(),
    decisionEmailError: delivery.error,
    decisionEmailPreviewUrl: delivery.previewUrl,
    decisionEmailMode: delivery.mode,
    updatedAt: new Date().toISOString(),
  };
  store[index] = next;
  return next;
}

export function hasValidContractorEmail(record: StoredChangeOrder): boolean {
  return isValidEmail(record.input.contractorEmail ?? "");
}
