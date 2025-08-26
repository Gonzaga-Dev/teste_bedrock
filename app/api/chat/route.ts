// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku, type Msg } from "@/lib/bedrock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "us-east-1";

// --- util ---
function toMsgArray(x: unknown): Msg[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((m) => ({
      role:
        (m as any)?.role === "user" || (m as any)?.role === "assistant"
          ? (m as any).role
          : "user",
      content: String((m as any)?.content ?? ""),
    }))
    .filter((m) => m.content.trim() !== "");
}

// --- POST /api/chat ---
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const history = toMsgArray(body?.history);

    if (!message) {
      return NextResponse.json({ error: "message vazio" }, { status: 400 });
    }

    // Diagnóstico de credenciais (apenas booleans; não vaza segredos)
    const flags = {
      bedrockEnv:
        !!process.env.BEDROCK_ACCESS_KEY_ID &&
        !!process.env.BEDROCK_SECRET_ACCESS_KEY,
      awsEnv:
        !!process.env.AWS_ACCESS_KEY_ID &&
        !!process.env.AWS_SECRET_ACCESS_KEY,
      rel: process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ? "set" : "unset",
      full: process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ? "set" : "unset",
      region:
        process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "unknown",
    };
    console.log("CHAT flags:", flags);

    const reply = await invokeHaiku({ message, history });
    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message || "erro").toString();
    return NextResponse.json(
      { error: msg, reply: `Erro do servidor: ${msg}` },
      { status: 500 },
    );
  }
}

// --- GET /api/chat ---
// Endpoint de debug para verificar de onde as credenciais viriam neste handler.
export async function GET() {
  return NextResponse.json(
    {
      hasBedrockEnv:
        !!process.env.BEDROCK_ACCESS_KEY_ID &&
        !!process.env.BEDROCK_SECRET_ACCESS_KEY,
      hasAwsEnv:
        !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY,
      hasContainerCreds:
        !!process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
        !!process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI,
      region:
        process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "unknown",
      ok: true,
    },
    { status: 200 },
  );
}
