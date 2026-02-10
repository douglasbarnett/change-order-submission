import { NextResponse } from "next/server";
import { z } from "zod";

import { sendDecisionEmail } from "~/lib/email";

const bodySchema = z.object({
  to: z.string().email(),
});

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Valid email required." }, { status: 400 });
  }

  const result = await sendDecisionEmail({
    to: parsed.data.to,
    subject: "Remi Change Order email test",
    text:
      "This is a test decision notification from Change Order Submission.\n\n" +
      "If you received this, email delivery is configured correctly.",
  });

  return NextResponse.json({
    status: result.sent ? "ok" : "error",
    mode: result.mode,
    previewUrl: result.previewUrl,
    error: result.error,
  });
}
