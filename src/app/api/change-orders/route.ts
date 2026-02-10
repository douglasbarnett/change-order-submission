import { NextResponse } from "next/server";

import { listChangeOrders } from "~/lib/change-order-store";

export async function GET() {
  return NextResponse.json({ changeOrders: listChangeOrders() });
}
