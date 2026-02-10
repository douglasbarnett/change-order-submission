"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type NumericField = "" | `${number}`;

type LineItem = {
  description: string;
  quantity: NumericField;
  unitPrice: NumericField;
};

type ChangeOrderForm = {
  projectId: string;
  contractorName: string;
  contractorEmail: string;
  workPerformedAt: string;
  scope: string;
  quantity: NumericField;
  unitLabel: string;
  materialCost: NumericField;
  laborCost: NumericField;
  additionalCharges: NumericField;
  additionalChargesReason: string;
  whyNeeded: string;
  whyNotInTurnKey: string;
  isMultiItem: boolean;
  photos: string[];
  lineItems: LineItem[];
};

type ApiChangeOrder = {
  id: string;
  status: "DRAFT" | "SUBMITTED" | "BLOCKED";
  createdAt: string;
  submittedAt?: string;
  blockingReasons?: string[];
  input: ChangeOrderForm;
};

const defaultLineItem: LineItem = { description: "", quantity: "", unitPrice: "" };

const defaultForm: ChangeOrderForm = {
  projectId: "POC-DEMO-001",
  contractorName: "",
  contractorEmail: "",
  workPerformedAt: "",
  scope: "",
  quantity: "",
  unitLabel: "",
  materialCost: "",
  laborCost: "",
  additionalCharges: "",
  additionalChargesReason: "",
  whyNeeded: "",
  whyNotInTurnKey: "",
  isMultiItem: false,
  photos: [],
  lineItems: [{ ...defaultLineItem }, { ...defaultLineItem }],
};

const steps = [
  { title: "Project", subtitle: "Project and timing details" },
  { title: "Scope", subtitle: "Scope and quantity" },
  { title: "Pricing", subtitle: "Costs and unit price" },
  { title: "Reason", subtitle: "Justification and photos" },
  { title: "Review", subtitle: "Line items and submit" },
] as const;

const strictEmailRegex =
  /^(?!.*\.\.)([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/;

export default function HomePage() {
  const [form, setForm] = useState<ChangeOrderForm>(defaultForm);
  const [changeOrders, setChangeOrders] = useState<ApiChangeOrder[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function toNumber(value: NumericField): number {
    if (value === "") {
      return 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isValidEmail(value: string): boolean {
    const email = value.trim();
    return strictEmailRegex.test(email);
  }

  const totalCost = useMemo(() => {
    return toNumber(form.materialCost) + toNumber(form.laborCost) + toNumber(form.additionalCharges);
  }, [form.additionalCharges, form.laborCost, form.materialCost]);

  const pricePerUnit = useMemo(() => {
    const quantityValue = toNumber(form.quantity);
    if (quantityValue <= 0) {
      return 0;
    }
    return totalCost / quantityValue;
  }, [form.quantity, totalCost]);

  async function refreshList() {
    const res = await fetch("/api/change-orders", { method: "GET" });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as { changeOrders: ApiChangeOrder[] };
    setChangeOrders(data.changeOrders);
  }

  async function saveDraft() {
    setBusy(true);
    setSuccess(null);
    setErrors([]);
    const res = await fetch("/api/change-orders/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);

    if (res.ok) {
      setSuccess("Draft saved.");
      await refreshList();
      return;
    }

    setErrors(["Could not save draft."]);
  }

  async function submitFinal() {
    setBusy(true);
    setSuccess(null);
    setErrors([]);

    const res = await fetch("/api/change-orders/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = (await res.json()) as { status: string; message?: string; reasons?: string[] };
    setBusy(false);

    if (res.ok) {
      setSuccess(data.message ?? "Submitted.");
      await refreshList();
      return;
    }

    setErrors(data.reasons ?? ["Submission blocked."]);
    await refreshList();
  }

  function updateLineItem(index: number, key: keyof LineItem, value: string) {
    const next = [...form.lineItems];
    if (key === "description") {
      next[index] = {
        ...next[index],
        description: value,
      };
    } else if (key === "quantity") {
      next[index] = {
        ...next[index],
        quantity: value as NumericField,
      };
    } else {
      next[index] = {
        ...next[index],
        unitPrice: value as NumericField,
      };
    }
    setForm((prev) => ({ ...prev, lineItems: next }));
  }

  function getStepErrors(stepIndex: number): string[] {
    const stepErrors: string[] = [];

    if (stepIndex === 0) {
      if (!form.projectId.trim()) {
        stepErrors.push("Project ID is required.");
      }
      if (!form.contractorName.trim()) {
        stepErrors.push("Contractor name is required.");
      }
      if (!form.contractorEmail.trim()) {
        stepErrors.push("Contractor email is required.");
      } else if (!isValidEmail(form.contractorEmail)) {
        stepErrors.push("Contractor email must be valid.");
      }
      if (!form.workPerformedAt.trim()) {
        stepErrors.push("Work performed date/time is required.");
      }
    }

    if (stepIndex === 1) {
      if (!form.scope.trim()) {
        stepErrors.push("Scope is required.");
      }
      if (toNumber(form.quantity) <= 0) {
        stepErrors.push("Quantity/area/amount must be greater than 0.");
      }
      if (!form.unitLabel.trim()) {
        stepErrors.push("Unit label is required.");
      }
    }

    if (stepIndex === 2) {
      if (toNumber(form.materialCost) < 0) {
        stepErrors.push("Material cost must be 0 or greater.");
      }
      if (toNumber(form.laborCost) < 0) {
        stepErrors.push("Labor cost must be 0 or greater.");
      }
      if (toNumber(form.additionalCharges) < 0) {
        stepErrors.push("Additional charges must be 0 or greater.");
      }
      if (toNumber(form.additionalCharges) > 0 && !form.additionalChargesReason.trim()) {
        stepErrors.push("Provide a reason for additional charges.");
      }
      if (toNumber(form.quantity) > 0 && totalCost / toNumber(form.quantity) <= 0) {
        stepErrors.push("Unit price must be determinable and greater than 0.");
      }
    }

    if (stepIndex === 3) {
      if (!form.whyNeeded.trim()) {
        stepErrors.push("Explain why this change order is needed.");
      }
      if (!form.whyNotInTurnKey.trim()) {
        stepErrors.push("Explain why this was not included in turn-key pricing.");
      }
      if (form.photos.length === 0) {
        stepErrors.push("At least one supporting photo is required.");
      }
    }

    if (stepIndex === 4 && form.isMultiItem) {
      if (form.lineItems.length < 2) {
        stepErrors.push("Multi-item CO requires at least two line items.");
      }
      form.lineItems.forEach((item, index) => {
        if (!item.description.trim() || toNumber(item.quantity) <= 0 || toNumber(item.unitPrice) < 0) {
          stepErrors.push(`Line item ${index + 1} needs description, quantity, and unit price.`);
        }
      });
    }

    return stepErrors;
  }

  function goNext() {
    const stepErrors = getStepErrors(currentStep);
    if (stepErrors.length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors([]);
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  }

  function goBack() {
    setErrors([]);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }

  async function addPhotos(files: FileList | null) {
    if (!files) {
      return;
    }
    const incomingFiles = Array.from(files);
    const incoming = await Promise.all(
      incomingFiles.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Could not read file."));
            reader.readAsDataURL(file);
          }),
      ),
    );
    setForm((prev) => {
      const merged = [...prev.photos, ...incoming];
      const unique = Array.from(new Set(merged));
      return { ...prev, photos: unique };
    });
  }

  function removePhoto(photoValue: string) {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.filter((photo) => photo !== photoValue),
    }));
  }

  function isPreviewablePhoto(photo: string): boolean {
    return photo.startsWith("data:image/") || photo.startsWith("http://") || photo.startsWith("https://");
  }

  return (
    <main>
      <header className="brand-header">
        <img src="/remi-logo.svg" alt="Remi logo" className="brand-logo" />
        <div>
          <h1>Change Order Submission</h1>
        </div>
      </header>

      <section>
        <div className="view-switch">
          <span className="muted">Current view: Contractor</span>
          <Link href="/change-order-poc/queue" className="secondary nav-link">
            Go to team queue
          </Link>
        </div>
      </section>

      {success ? <div className="alert success">{success}</div> : null}
      {errors.length > 0 ? (
        <div className="alert error">
          <strong>Submission blocked:</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="wizard-shell">
        <div className="wizard-head">
          <div>
            <h2>{steps[currentStep].title}</h2>
            <p className="muted">{steps[currentStep].subtitle}</p>
          </div>
          <p className="muted">
            Step {currentStep + 1} of {steps.length}
          </p>
        </div>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }} />
        </div>

        {currentStep === 0 ? (
          <div className="step-body">
            <div className="row">
              <div>
                <label htmlFor="projectId">Project ID</label>
                <input
                  id="projectId"
                  value={form.projectId}
                  onChange={(e) => setForm((prev) => ({ ...prev, projectId: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="contractorName">Contractor name</label>
                <input
                  id="contractorName"
                  value={form.contractorName}
                  onChange={(e) => setForm((prev) => ({ ...prev, contractorName: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="contractorEmail">Contractor email</label>
                <input
                  id="contractorEmail"
                  type="email"
                  value={form.contractorEmail}
                  onChange={(e) => setForm((prev) => ({ ...prev, contractorEmail: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="workPerformedAt">Work performed date/time</label>
                <input
                  id="workPerformedAt"
                  type="datetime-local"
                  value={form.workPerformedAt}
                  onChange={(e) => {
                    const input = e.currentTarget;
                    setForm((prev) => ({ ...prev, workPerformedAt: input.value }));
                    // Close native picker after choosing a date/time.
                    input.blur();
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {currentStep === 1 ? (
          <div className="step-body">
            <label htmlFor="scope">1) Clearly state the scope of this change order</label>
            <textarea
              id="scope"
              value={form.scope}
              onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value }))}
            />

            <div className="row">
              <div>
                <label htmlFor="quantity">2) Quantity/area/amount</label>
                <input
                  id="quantity"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value as NumericField }))}
                />
              </div>
              <div>
                <label htmlFor="unitLabel">Unit label</label>
                <input
                  id="unitLabel"
                  value={form.unitLabel}
                  onChange={(e) => setForm((prev) => ({ ...prev, unitLabel: e.target.value }))}
                />
              </div>
            </div>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="step-body">
            <div className="row">
              <div>
                <label htmlFor="materialCost">3) Material cost</label>
                <input
                  id="materialCost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.materialCost}
                  onChange={(e) => setForm((prev) => ({ ...prev, materialCost: e.target.value as NumericField }))}
                />
              </div>
              <div>
                <label htmlFor="laborCost">3) Labor cost</label>
                <input
                  id="laborCost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.laborCost}
                  onChange={(e) => setForm((prev) => ({ ...prev, laborCost: e.target.value as NumericField }))}
                />
              </div>
              <div>
                <label htmlFor="additionalCharges">4) Any additional charges</label>
                <input
                  id="additionalCharges"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.additionalCharges}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, additionalCharges: e.target.value as NumericField }))
                  }
                />
              </div>
            </div>

            <label htmlFor="additionalChargesReason">4) Explain/justify additional charges</label>
            <textarea
              id="additionalChargesReason"
              value={form.additionalChargesReason}
              onChange={(e) => setForm((prev) => ({ ...prev, additionalChargesReason: e.target.value }))}
            />

            <p className="muted">
              5) Price per unit: ${pricePerUnit.toFixed(2)} / {form.unitLabel || "unit"} (from total $
              {totalCost.toFixed(2)})
            </p>
          </div>
        ) : null}

        {currentStep === 3 ? (
          <div className="step-body">
            <label htmlFor="whyNeeded">6) Why is this CO needed?</label>
            <textarea
              id="whyNeeded"
              value={form.whyNeeded}
              onChange={(e) => setForm((prev) => ({ ...prev, whyNeeded: e.target.value }))}
            />

            <label htmlFor="whyNotInTurnKey">7) Why was this not included in turn-key pricing?</label>
            <textarea
              id="whyNotInTurnKey"
              value={form.whyNotInTurnKey}
              onChange={(e) => setForm((prev) => ({ ...prev, whyNotInTurnKey: e.target.value }))}
            />

            <label htmlFor="photos">8) Attach supporting photos</label>
            <input
              id="photos"
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <p className="muted">{form.photos.length} photo(s) selected.</p>
            {form.photos.length > 0 ? (
              <ul>
                {form.photos.map((photo, index) => (
                  <li key={photo}>
                    Photo {index + 1}{" "}
                    {isPreviewablePhoto(photo) ? (
                      <a href={photo} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      <span className="muted">(not previewable)</span>
                    )}{" "}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => removePhoto(photo)}
                      style={{ marginLeft: "6px", padding: "4px 8px" }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {currentStep === 4 ? (
          <div className="step-body">
            <label>
              <input
                type="checkbox"
                checked={form.isMultiItem}
                onChange={(e) => setForm((prev) => ({ ...prev, isMultiItem: e.target.checked }))}
              />{" "}
              This CO has multiple line items
            </label>

            {form.isMultiItem
              ? form.lineItems.map((item, index) => (
                  <div className="line-item" key={`line-item-${index + 1}`}>
                    <h3>Line item {index + 1}</h3>
                    <label htmlFor={`li-description-${index + 1}`}>Description</label>
                    <input
                      id={`li-description-${index + 1}`}
                      value={item.description}
                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                    />
                    <div className="row">
                      <div>
                        <label htmlFor={`li-qty-${index + 1}`}>Quantity</label>
                        <input
                          id={`li-qty-${index + 1}`}
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={`li-unit-price-${index + 1}`}>Unit price</label>
                        <input
                          id={`li-unit-price-${index + 1}`}
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(index, "unitPrice", e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="muted">Extended: ${(toNumber(item.quantity) * toNumber(item.unitPrice)).toFixed(2)}</p>
                  </div>
                ))
              : null}

            <div className="review-card">
              <h3>Final review</h3>
              <p className="muted">Project: {form.projectId || "-"}</p>
              <p className="muted">Contractor: {form.contractorName || "-"}</p>
              <p className="muted">Contractor email: {form.contractorEmail || "-"}</p>
              <p className="muted">Total cost: ${totalCost.toFixed(2)}</p>
              <p className="muted">
                Unit price: ${pricePerUnit.toFixed(2)} / {form.unitLabel || "unit"}
              </p>
              <p className="muted">Photos attached: {form.photos.length}</p>
              <p className="muted">Work performed at: {form.workPerformedAt || "-"}</p>
              <div className="button-row">
                <button className="secondary" disabled={busy} onClick={saveDraft} type="button">
                  Save draft
                </button>
                <button className="primary" disabled={busy} onClick={submitFinal} type="button">
                  Final submit
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="wizard-nav">
          <button className="secondary" disabled={busy || currentStep === 0} onClick={goBack} type="button">
            Back
          </button>
          {currentStep < steps.length - 1 ? (
            <button className="primary" disabled={busy} onClick={goNext} type="button">
              Next
            </button>
          ) : (
            <button className="secondary" disabled={busy} onClick={saveDraft} type="button">
              Save draft
            </button>
          )}
        </div>
      </section>

      <section>
        <h2>Recent submissions</h2>
        <p className="muted">Draft, submitted, and blocked attempts recorded for this dev session.</p>
        <button className="secondary" onClick={refreshList} type="button">
          Refresh list
        </button>
        <ul>
          {changeOrders.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.status}</strong> - {entry.id} - {entry.input.projectId} - {new Date(entry.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
