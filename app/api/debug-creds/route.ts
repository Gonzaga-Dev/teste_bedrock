// app/api/debug-creds/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json({
    hasContainerCreds:
      !!process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      !!process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI,
    hasEnvKeys:
      !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "unknown"
  });
}
