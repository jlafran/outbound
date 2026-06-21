import { NextResponse } from "next/server";

import { resetAppServicesForE2E } from "@/features/app/app-services";

export async function POST() {
  if (
    process.env.OUTREACH_E2E_MODE !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  resetAppServicesForE2E();
  return NextResponse.json({ reset: true });
}
