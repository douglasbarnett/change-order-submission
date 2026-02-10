"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TeamQueueStatus = "NEW" | "IN_REVIEW" | "NEEDS_INFO" | "APPROVED" | "DENIED";
type SubmissionStatus = "DRAFT" | "SUBMITTED" | "BLOCKED";
type DecisionStatus = "PENDING" | "NEEDS_INFO" | "APPROVED" | "DENIED";
type DecisionAction = "NONE" | "NEEDS_INFO" | "APPROVE" | "DENY";
type DenialReasonCode =
  | "MISSING_REQUIRED_INFO"
  | "INSUFFICIENT_PHOTO_EVIDENCE"
  | "OUTSIDE_24_HOUR_WINDOW"
  | "DUPLICATE_REQUEST"
  | "PRICING_NOT_JUSTIFIED"
  | "IN_SCOPE_OF_TURNKEY"
  | "OTHER";

type QueueItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  status: SubmissionStatus;
  blockingReasons?: string[];
  reviewerNotes: string;
  teamStatus: TeamQueueStatus;
  decisionStatus: DecisionStatus;
  decisionAt?: string;
  decisionBy?: string;
  approvedAmount?: number;
  denialReasonCode?: DenialReasonCode;
  decisionExplanation?: string;
  contractorFacingMessage?: string;
  needsInfoChecklist: string[];
  isFinalized: boolean;
  decisionEmailStatus?: "PENDING" | "SENT" | "FAILED";
  decisionEmailSentAt?: string;
  decisionEmailTo?: string;
  decisionEmailSubject?: string;
  decisionEmailBody?: string;
  decisionEmailError?: string;
  decisionEmailPreviewUrl?: string;
  decisionEmailMode?: "smtp" | "preview";
  input: {
    projectId: string;
    contractorName: string;
    contractorEmail?: string;
    workPerformedAt: string;
    scope: string;
    quantity: number | string;
    unitLabel: string;
    materialCost: number | string;
    laborCost: number | string;
    additionalCharges: number | string;
    photos: string[];
  };
};

const teamStatuses: TeamQueueStatus[] = ["NEW", "IN_REVIEW", "NEEDS_INFO", "APPROVED", "DENIED"];
const decisionStatuses: DecisionStatus[] = ["PENDING", "NEEDS_INFO", "APPROVED", "DENIED"];
const denialReasonCodes: DenialReasonCode[] = [
  "MISSING_REQUIRED_INFO",
  "INSUFFICIENT_PHOTO_EVIDENCE",
  "OUTSIDE_24_HOUR_WINDOW",
  "DUPLICATE_REQUEST",
  "PRICING_NOT_JUSTIFIED",
  "IN_SCOPE_OF_TURNKEY",
  "OTHER",
];

type DraftDecision = {
  action: DecisionAction;
  decidedBy: string;
  approvedAmount: string;
  denialReasonCode: DenialReasonCode;
  decisionExplanation: string;
  contractorFacingMessage: string;
  needsInfoChecklistText: string;
  acknowledgeLateSubmission: boolean;
};

const defaultDecisionDraft: DraftDecision = {
  action: "NONE",
  decidedBy: "",
  approvedAmount: "",
  denialReasonCode: "MISSING_REQUIRED_INFO",
  decisionExplanation: "",
  contractorFacingMessage: "",
  needsInfoChecklistText: "",
  acknowledgeLateSubmission: false,
};

export default function TeamQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submissionFilter, setSubmissionFilter] = useState<"ALL" | SubmissionStatus>("ALL");
  const [teamFilter, setTeamFilter] = useState<"ALL" | TeamQueueStatus>("ALL");
  const [decisionFilter, setDecisionFilter] = useState<"ALL" | DecisionStatus>("ALL");
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, DraftDecision>>({});
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; previewUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadQueue() {
    setError(null);
    const res = await fetch("/api/change-orders");
    if (!res.ok) {
      setError("Could not load queue data.");
      return;
    }
    const data = (await res.json()) as { changeOrders: QueueItem[] };
    setItems(data.changeOrders);
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (submissionFilter !== "ALL" && item.status !== submissionFilter) {
        return false;
      }
      if (teamFilter !== "ALL" && item.teamStatus !== teamFilter) {
        return false;
      }
      if (decisionFilter !== "ALL" && item.decisionStatus !== decisionFilter) {
        return false;
      }
      return true;
    });
  }, [decisionFilter, items, submissionFilter, teamFilter]);

  async function updateQueueItem(item: QueueItem, updates: { teamStatus?: TeamQueueStatus; reviewerNotes?: string }) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/change-orders/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updates),
    });
    setBusyId(null);

    if (!res.ok) {
      setError("Could not save reviewer updates.");
      return;
    }

    const data = (await res.json()) as { changeOrder: QueueItem };
    setItems((prev) => prev.map((entry) => (entry.id === item.id ? data.changeOrder : entry)));
  }

  function isLate(item: QueueItem): boolean {
    const workPerformedAt = new Date(item.input.workPerformedAt);
    if (Number.isNaN(workPerformedAt.getTime())) {
      return false;
    }
    return Date.now() - workPerformedAt.getTime() > 24 * 60 * 60 * 1000;
  }

  function isPreviewablePhoto(photo: string): boolean {
    return photo.startsWith("data:image/") || photo.startsWith("http://") || photo.startsWith("https://");
  }

  function getDraft(itemId: string): DraftDecision {
    return decisionDrafts[itemId] ?? defaultDecisionDraft;
  }

  function patchDraft(itemId: string, partial: Partial<DraftDecision>) {
    setDecisionDrafts((prev) => ({
      ...prev,
      [itemId]: { ...getDraft(itemId), ...partial },
    }));
  }

  async function openAction(item: QueueItem, action: DecisionAction) {
    patchDraft(item.id, { action });
    if (item.teamStatus === "NEW" && !item.isFinalized) {
      await updateQueueItem(item, { teamStatus: "IN_REVIEW" });
    }
  }

  async function submitDecision(item: QueueItem) {
    const draft = getDraft(item.id);
    if (draft.action === "NONE") {
      setError("Pick an action before saving a decision.");
      return;
    }

    setBusyId(item.id);
    setError(null);
    setNotice(null);

    const base = {
      action: draft.action,
      decidedBy: draft.decidedBy.trim(),
      decisionExplanation: draft.decisionExplanation.trim(),
      contractorFacingMessage: draft.contractorFacingMessage.trim(),
    };

    const needsInfoChecklist = draft.needsInfoChecklistText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const payload =
      draft.action === "APPROVE"
        ? {
            ...base,
            approvedAmount: Number(draft.approvedAmount),
            acknowledgeLateSubmission: draft.acknowledgeLateSubmission,
            isLate: isLate(item),
          }
        : draft.action === "DENY"
          ? {
              ...base,
              denialReasonCode: draft.denialReasonCode,
            }
          : {
              ...base,
              needsInfoChecklist,
            };

    const res = await fetch(`/api/change-orders/${item.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusyId(null);

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "Could not save decision.");
      return;
    }

    const data = (await res.json()) as {
      changeOrder: QueueItem;
      emailStatus?: "SENT" | "FAILED";
      emailPreviewUrl?: string;
    };
    setItems((prev) => prev.map((entry) => (entry.id === item.id ? data.changeOrder : entry)));
    patchDraft(item.id, { action: "NONE" });

    if (data.emailStatus === "SENT") {
      setNotice({
        text: "Decision saved and contractor email sent.",
        previewUrl: data.emailPreviewUrl,
      });
    } else if (data.emailStatus === "FAILED") {
      setError("Decision saved, but contractor email failed to send.");
    }
  }

  return (
    <main>
      <header className="brand-header">
        <img src="/remi-logo.svg" alt="Remi logo" className="brand-logo" />
        <div>
          <h1>Change Order Team Queue</h1>
        </div>
      </header>

      <section>
        <div className="view-switch">
          <Link href="/change-order-poc" className="secondary nav-link">
            Contractor view
          </Link>
          <button type="button" className="primary" onClick={() => void loadQueue()}>
            Refresh queue
          </button>
        </div>
        <div className="row">
          <div>
            <label htmlFor="submissionFilter">Submission status</label>
            <select
              id="submissionFilter"
              value={submissionFilter}
              onChange={(e) => setSubmissionFilter(e.target.value as "ALL" | SubmissionStatus)}
            >
              <option value="ALL">All</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="BLOCKED">Blocked</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>
          <div>
            <label htmlFor="teamFilter">Team status</label>
            <select
              id="teamFilter"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value as "ALL" | TeamQueueStatus)}
            >
              <option value="ALL">All</option>
              {teamStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="decisionFilter">Decision status</label>
            <select
              id="decisionFilter"
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value as "ALL" | DecisionStatus)}
            >
              <option value="ALL">All</option>
              {decisionStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? (
        <div className="alert success">
          <strong>{notice.text}</strong>
          {notice.previewUrl ? (
            <>
              {" "}
              <a href={notice.previewUrl} target="_blank" rel="noreferrer">
                View email preview
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      <section>
        <h2>Queue items ({filtered.length})</h2>
        {filtered.length === 0 ? <p className="muted">No submissions match the current filters.</p> : null}
        <div className="queue-list">
          {filtered.map((item) => {
            const requestedInfo = item.needsInfoChecklist ?? [];
            const total =
              Number(item.input.materialCost || 0) +
              Number(item.input.laborCost || 0) +
              Number(item.input.additionalCharges || 0);
            return (
              <article key={item.id} className="queue-card">
                <div className="queue-head">
                  <h3>{item.input.projectId}</h3>
                  <span className="queue-badge">{item.decisionStatus}</span>
                </div>
                <p className="muted">Contractor: {item.input.contractorName || "-"}</p>
                <p className="muted">Contractor email: {item.input.contractorEmail || "-"}</p>
                <p className="muted">Submitted: {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "-"}</p>
                <p className="muted">Submission status: {item.status}</p>
                <p className="muted">Total: ${total.toFixed(2)}</p>
                <p className="muted">Photos: {item.input.photos.length}</p>
                <p className="muted">Scope: {item.input.scope || "-"}</p>
                <p className="muted">Team status: {item.teamStatus}</p>
                <p className="muted">Decision status: {item.decisionStatus}</p>
                {isLate(item) ? <p className="muted">Late submission: Yes (&gt;24h)</p> : null}

                {item.input.photos.length > 0 ? (
                  <div className="photo-grid">
                    {item.input.photos.map((photo, index) => (
                      isPreviewablePhoto(photo) ? (
                        <button
                          type="button"
                          key={`${item.id}-photo-${index + 1}`}
                          onClick={() => setPreviewPhoto(photo)}
                          className="photo-tile photo-button"
                          aria-label={`Preview submission photo ${index + 1}`}
                        >
                          <img src={photo} alt={`Submission photo ${index + 1}`} className="photo-thumb" />
                        </button>
                      ) : (
                        <div key={`${item.id}-photo-${index + 1}`} className="photo-tile photo-tile-fallback">
                          <span className="muted">Photo {index + 1} not previewable</span>
                        </div>
                      )
                    ))}
                  </div>
                ) : null}

                {item.blockingReasons?.length ? (
                  <div className="alert error">
                    <strong>Blocked reasons:</strong>
                    <ul>
                      {item.blockingReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="decision-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void openAction(item, "NEEDS_INFO")}
                    disabled={busyId === item.id || item.isFinalized}
                  >
                    Request info
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void openAction(item, "APPROVE")}
                    disabled={busyId === item.id || item.isFinalized || item.status !== "SUBMITTED"}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void openAction(item, "DENY")}
                    disabled={busyId === item.id || item.isFinalized || item.status !== "SUBMITTED"}
                  >
                    Deny
                  </button>
                </div>

                {!item.isFinalized ? (
                  <>
                    {getDraft(item.id).action !== "NONE" ? (
                      <div className="decision-panel">
                        <h4>Decision: {getDraft(item.id).action}</h4>
                        <div className="row">
                          <div>
                            <label htmlFor={`${item.id}-decidedBy`}>Decided by</label>
                            <input
                              id={`${item.id}-decidedBy`}
                              value={getDraft(item.id).decidedBy}
                              onChange={(e) => patchDraft(item.id, { decidedBy: e.target.value })}
                            />
                          </div>
                          {getDraft(item.id).action === "APPROVE" ? (
                            <div>
                              <label htmlFor={`${item.id}-approvedAmount`}>Approved amount</label>
                              <input
                                id={`${item.id}-approvedAmount`}
                                type="number"
                                min={0}
                                step="0.01"
                                value={getDraft(item.id).approvedAmount}
                                onChange={(e) => patchDraft(item.id, { approvedAmount: e.target.value })}
                              />
                            </div>
                          ) : null}
                          {getDraft(item.id).action === "DENY" ? (
                            <div>
                              <label htmlFor={`${item.id}-denialReason`}>Denial reason</label>
                              <select
                                id={`${item.id}-denialReason`}
                                value={getDraft(item.id).denialReasonCode}
                                onChange={(e) =>
                                  patchDraft(item.id, { denialReasonCode: e.target.value as DenialReasonCode })
                                }
                              >
                                {denialReasonCodes.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {reason}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </div>
                        {getDraft(item.id).action === "NEEDS_INFO" ? (
                          <>
                            <label htmlFor={`${item.id}-needsInfoChecklist`}>Missing items (one per line)</label>
                            <textarea
                              id={`${item.id}-needsInfoChecklist`}
                              value={getDraft(item.id).needsInfoChecklistText}
                              onChange={(e) => patchDraft(item.id, { needsInfoChecklistText: e.target.value })}
                            />
                          </>
                        ) : null}
                        <label htmlFor={`${item.id}-decisionExplanation`}>Internal explanation</label>
                        <textarea
                          id={`${item.id}-decisionExplanation`}
                          value={getDraft(item.id).decisionExplanation}
                          onChange={(e) => patchDraft(item.id, { decisionExplanation: e.target.value })}
                        />
                        <label htmlFor={`${item.id}-contractorMessage`}>Contractor-facing message (optional)</label>
                        <textarea
                          id={`${item.id}-contractorMessage`}
                          value={getDraft(item.id).contractorFacingMessage}
                          onChange={(e) => patchDraft(item.id, { contractorFacingMessage: e.target.value })}
                        />

                        {getDraft(item.id).action === "APPROVE" && isLate(item) ? (
                          <label>
                            <input
                              type="checkbox"
                              checked={getDraft(item.id).acknowledgeLateSubmission}
                              onChange={(e) =>
                                patchDraft(item.id, { acknowledgeLateSubmission: e.target.checked })
                              }
                            />{" "}
                            I acknowledge this late submission (&gt;24h) is being approved as an exception.
                          </label>
                        ) : null}

                        <div className="button-row">
                          <button
                            type="button"
                            className="primary"
                            onClick={() => void submitDecision(item)}
                            disabled={busyId === item.id}
                          >
                            Save decision
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => patchDraft(item.id, { action: "NONE" })}
                            disabled={busyId === item.id}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {item.decisionStatus !== "PENDING" ? (
                  <div className="decision-summary">
                    <h4>Decision summary</h4>
                    <p className="muted">Outcome: {item.decisionStatus}</p>
                    <p className="muted">Decided by: {item.decisionBy || "-"}</p>
                    <p className="muted">Decided at: {item.decisionAt ? new Date(item.decisionAt).toLocaleString() : "-"}</p>
                    {item.approvedAmount !== undefined ? <p className="muted">Approved amount: ${item.approvedAmount.toFixed(2)}</p> : null}
                    {item.denialReasonCode ? <p className="muted">Denial reason: {item.denialReasonCode}</p> : null}
                    {requestedInfo.length > 0 ? (
                      <>
                        <p className="muted">Requested info:</p>
                        <ul>
                          {requestedInfo.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {item.decisionExplanation ? <p className="muted">Internal explanation: {item.decisionExplanation}</p> : null}
                    {item.contractorFacingMessage ? (
                      <p className="muted">Contractor message: {item.contractorFacingMessage}</p>
                    ) : null}
                    <p className="muted">Decision email: {item.decisionEmailStatus ?? "PENDING"}</p>
                    {item.decisionEmailMode ? <p className="muted">Delivery mode: {item.decisionEmailMode}</p> : null}
                    {item.decisionEmailTo ? <p className="muted">Sent to: {item.decisionEmailTo}</p> : null}
                    {item.decisionEmailSentAt ? (
                      <p className="muted">Sent at: {new Date(item.decisionEmailSentAt).toLocaleString()}</p>
                    ) : null}
                    {item.decisionEmailSubject ? <p className="muted">Subject: {item.decisionEmailSubject}</p> : null}
                    {item.decisionEmailError ? <p className="muted">Email error: {item.decisionEmailError}</p> : null}
                    {item.decisionEmailPreviewUrl ? (
                      <a
                        href={item.decisionEmailPreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="secondary nav-link"
                      >
                        View sent email preview
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <label htmlFor={`${item.id}-notes`}>Reviewer notes</label>
                <textarea
                  id={`${item.id}-notes`}
                  value={item.reviewerNotes}
                  onChange={(e) => {
                    const value = e.target.value;
                    setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, reviewerNotes: value } : entry)));
                  }}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void updateQueueItem(item, { reviewerNotes: item.reviewerNotes })}
                  disabled={busyId === item.id || item.isFinalized}
                >
                  Save notes
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {previewPhoto ? (
        <div className="photo-modal-overlay" onClick={() => setPreviewPhoto(null)} role="presentation">
          <div className="photo-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="photo-modal-header">
              <strong>Photo preview</strong>
              <button type="button" className="secondary" onClick={() => setPreviewPhoto(null)}>
                Close
              </button>
            </div>
            <img src={previewPhoto} alt="Submission photo preview" className="photo-modal-image" />
            <a href={previewPhoto} target="_blank" rel="noreferrer" className="secondary nav-link">
              Open in new tab
            </a>
          </div>
        </div>
      ) : null}
    </main>
  );
}
