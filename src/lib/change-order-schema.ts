import { z } from "zod";

const strictEmailRegex =
  /^(?!.*\.\.)([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/;

const strictEmailSchema = z
  .string()
  .trim()
  .email("Valid contractor email is required")
  .refine((value) => strictEmailRegex.test(value), "Valid contractor email is required");

export const lineItemSchema = z.object({
  // Keep parse permissive; checklist rules enforce completeness for final submit.
  description: z.string().default(""),
  quantity: z.coerce.number().nonnegative("Line item quantity must be 0 or greater"),
  unitPrice: z.coerce.number().nonnegative("Line item unit price must be 0 or greater"),
});

export const changeOrderInputSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  contractorName: z.string().min(1, "Contractor name is required"),
  contractorEmail: strictEmailSchema,
  workPerformedAt: z.string().min(1, "Work performed timestamp is required"),
  scope: z.string().min(1, "Scope of change is required"),
  quantity: z.coerce.number().positive("Quantity/area/amount must be greater than 0"),
  unitLabel: z.string().min(1, "Unit label is required"),
  materialCost: z.coerce.number().nonnegative("Material cost must be 0 or greater"),
  laborCost: z.coerce.number().nonnegative("Labor cost must be 0 or greater"),
  additionalCharges: z.coerce.number().nonnegative("Additional charges must be 0 or greater"),
  additionalChargesReason: z.string().optional().default(""),
  whyNeeded: z.string().min(1, "Explain why this change order is needed"),
  whyNotInTurnKey: z.string().min(1, "Explain why this was not included in turn-key pricing"),
  photos: z.array(z.string()).default([]),
  isMultiItem: z.boolean().default(false),
  lineItems: z.array(lineItemSchema).default([]),
});

export type ChangeOrderInput = z.infer<typeof changeOrderInputSchema>;
export const changeOrderDraftInputSchema = changeOrderInputSchema.partial();
export type ChangeOrderDraftInput = z.infer<typeof changeOrderDraftInputSchema>;

export type ChecklistViolation = {
  code: string;
  message: string;
};

export function evaluateChecklist(input: ChangeOrderInput): ChecklistViolation[] {
  const violations: ChecklistViolation[] = [];
  const totalCost = input.materialCost + input.laborCost + input.additionalCharges;

  if (!input.scope.trim()) {
    violations.push({ code: "scope_missing", message: "Scope of change order is required." });
  }

  if (input.quantity <= 0) {
    violations.push({ code: "quantity_missing", message: "Quantity/area/amount must be greater than 0." });
  }

  if (input.materialCost < 0 || input.laborCost < 0) {
    violations.push({
      code: "pricing_invalid",
      message: "Labor and material pricing must be included and non-negative.",
    });
  }

  if (input.additionalCharges > 0 && !input.additionalChargesReason.trim()) {
    violations.push({
      code: "additional_charges_reason_missing",
      message: "Additional charges must include a clear explanation.",
    });
  }

  if (input.quantity > 0 && totalCost / input.quantity <= 0) {
    violations.push({
      code: "unit_price_unclear",
      message: "Price per unit must be determinable and greater than 0.",
    });
  }

  if (!input.whyNeeded.trim()) {
    violations.push({
      code: "justification_missing",
      message: "Include why this change order is needed.",
    });
  }

  if (!input.whyNotInTurnKey.trim()) {
    violations.push({
      code: "turnkey_justification_missing",
      message: "Include why this charge was not in turn-key pricing.",
    });
  }

  if (input.photos.length === 0) {
    violations.push({
      code: "photos_missing",
      message: "At least one supporting photo is required.",
    });
  }

  if (input.isMultiItem) {
    if (input.lineItems.length < 2) {
      violations.push({
        code: "line_items_missing",
        message: "Multiple-item change orders require at least two line items.",
      });
    }

    for (const [index, lineItem] of input.lineItems.entries()) {
      if (!lineItem.description.trim() || lineItem.quantity <= 0 || lineItem.unitPrice < 0) {
        violations.push({
          code: `line_item_${index + 1}_invalid`,
          message: `Line item ${index + 1} needs description, quantity, and unit price.`,
        });
      }
    }
  }

  return violations;
}

export function isPast24Hours(workPerformedAtIso: string): boolean {
  const workPerformedAt = new Date(workPerformedAtIso);
  if (Number.isNaN(workPerformedAt.getTime())) {
    return true;
  }

  const elapsedMs = Date.now() - workPerformedAt.getTime();
  return elapsedMs > 24 * 60 * 60 * 1000;
}

export function normalizeDraftInput(input: ChangeOrderDraftInput): ChangeOrderInput {
  return {
    projectId: input.projectId ?? "POC-DEMO-001",
    contractorName: input.contractorName ?? "",
    contractorEmail: input.contractorEmail ?? "",
    workPerformedAt: input.workPerformedAt ?? "",
    scope: input.scope ?? "",
    quantity: input.quantity ?? 0,
    unitLabel: input.unitLabel ?? "sq ft",
    materialCost: input.materialCost ?? 0,
    laborCost: input.laborCost ?? 0,
    additionalCharges: input.additionalCharges ?? 0,
    additionalChargesReason: input.additionalChargesReason ?? "",
    whyNeeded: input.whyNeeded ?? "",
    whyNotInTurnKey: input.whyNotInTurnKey ?? "",
    photos: input.photos ?? [],
    isMultiItem: input.isMultiItem ?? false,
    lineItems: input.lineItems ?? [],
  };
}
