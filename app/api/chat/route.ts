// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku, type Msg } from "@/lib/bedrock";
import { retrieveFromKB } from "@/lib/retrieve"; // RAG manual (só retrieve)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "us-east-1";

// --- utils ---
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

function truncate(s: string, max = 2000) {
  if (s.length <= max) return s;
  return s.slice(0, max) + " …";
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

    const hasKB = !!process.env.BEDROCK_KB_ID?.trim();

    // 1) Recupera contexto da KB (se configurada)
    let system: string | undefined = undefined;
    if (hasKB) {
      const chunks = await retrieveFromKB(message, { maxResults: 6 });
      const contexto =
        chunks
          .map((c, i) =>
            `### Trecho ${i + 1}\n${truncate(c.text, 1800)}${
              c.source ? `\n[Fonte]: ${c.source}` : ""
            }`,
          )
          .join("\n\n") || "(sem trechos relevantes da KB)";

      // 2) System com instruções + contexto (você controla o “estilo”)
      system = [
        "Você é um assistente de seleção técnica.",
        "Use ESTRITAMENTE o CONTEXTO abaixo para responder.",
        "Se faltar evidência no contexto, diga isso explicitamente.",
        "Seja conciso e traga justificativas ancoradas nos trechos.",
        "",
        "=== CONTEXTO ===",
        contexto,
      ].join("\n");
    }

    // 3) Invoca o modelo com prompt custom (message) + contexto (system)
    const reply = await invokeHaiku({
      message,
      history,
      system,
      maxTokens: 1200,
      temperature: 0.2,
      topP: 0.9,
    });

    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message || "erro").toString();
    return NextResponse.json(
      { error: msg, reply: `Erro do servidor: ${msg}` },
      { status: 500 },
    );
  }
}

// --- GET /api/chat --- (diagnóstico rápido)
export async function GET() {
  return NextResponse.json(
    {
      kbId: process.env.BEDROCK_KB_ID ? "set" : "unset",
      profile: process.env.BEDROCK_INFERENCE_PROFILE_ARN ? "set" : "unset",
      modelId: process.env.BEDROCK_MODEL_ID ? "set" : "unset",
      region:
        process.env.BEDROCK_REGION ||
        process.env.AWS_REGION ||
        process.env.AWS_DEFAULT_REGION ||
        "us-east-1",
      ok: true,
    },
    { status: 200 },
  );
}
