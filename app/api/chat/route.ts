// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku, type Msg } from "@/lib/bedrock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "us-east-1";

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const history = toMsgArray(body?.history);
    if (!message) return NextResponse.json({ error: "message vazio" }, { status: 400 });

    // log leve (ajuda a confirmar as creds no runtime do POST)
    console.log("CHAT flags:", {
      envKeys: !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY,
      rel: process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ? "set" : "unset",
      full: process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ? "set" : "unset",
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "unknown",
    });

    const reply = await invokeHaiku({ message, history });
    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message || "erro").toString();
    return NextResponse.json(
      { error: msg, reply: `Erro do servidor: ${msg}` },
      { status: 500 }
    );
  }
}
