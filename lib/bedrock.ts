// lib/bedrock.ts (refatorado p/ nova lógica com SDK)
// Requisitos de permissão na role: bedrock:InvokeModel, bedrock:InvokeModelWithResponseStream (se for usar streaming), e opcionalmente bedrock:GetInferenceProfile.

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// -------- Region & Model/Profile resolution --------
const REGION =
  process.env.BEDROCK_REGION?.trim() ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";

// depois (preferir profile)
const RESOLVED_MODEL_ID =
  process.env.BEDROCK_INFERENCE_PROFILE_ARN?.trim() ||
  process.env.BEDROCK_MODEL_ID?.trim() ||
  "arn:aws:bedrock:us-east-1:299276366441:inference-profile/us.anthropic.claude-3-5-haiku-20241022-v1:0";


// -------- Credenciais (opcionalmente via env custom) --------
// Em produção no Amplify, NÃO defina chaves; deixe a role SSR prover.
// Este bloco só existe para quem quer rodar local com env custom sem perfis AWS.
function getOptionalStaticCredentials() {
  const akid =
    process.env.BEDROCK_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secret =
    process.env.BEDROCK_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const token =
    process.env.BEDROCK_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;

  if (akid && secret) {
    return {
      accessKeyId: akid,
      secretAccessKey: secret,
      sessionToken: token,
    };
  }
  return undefined; // provider chain padrão (role, SSO, etc.)
}

// Cliente Bedrock
const bedrock = new BedrockRuntimeClient({
  region: REGION,
  credentials: getOptionalStaticCredentials(),
});

// ===== Tipos =====
export type Msg = { role: "user" | "assistant"; content: string };

type InvokeArgs = {
  message: string;
  history?: Msg[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  timeoutMs?: number; // novo: permite sobrescrever timeout
};

// ===== Util =====
function sanitizeHistory(history: Msg[]): { role: "user" | "assistant"; content: { type: "text"; text: string }[] }[] {
  return (history || [])
    .filter(
      (h) =>
        h &&
        (h.role === "user" || h.role === "assistant") &&
        typeof h.content === "string" &&
        h.content.trim().length > 0
    )
    .slice(-20)
    .map((h) => ({
      role: h.role,
      content: [{ type: "text", text: h.content }],
    }));
}

function extractText(raw: string): string {
  if (!raw) return "[sem texto]";
  try {
    const parsed: any = JSON.parse(raw);
    const text =
      parsed?.content?.[0]?.text ??
      parsed?.message?.content?.[0]?.text ??
      parsed?.output_text ??
      parsed?.completion ??
      "";
    const out = (text ?? "").toString().trim();
    return out || "[sem texto]";
  } catch {
    // Em raros casos o serviço pode retornar texto plano
    return raw.trim() || "[sem texto]";
  }
}

// ===== Invocação =====
export async function invokeHaiku({
  message,
  history = [],
  maxTokens = 1000,
  temperature = 0.2,
  topP = 0.9,
  timeoutMs = 30_000,
}: InvokeArgs): Promise<string> {
  if (!RESOLVED_MODEL_ID) {
    throw new Error(
      "ModelId/InferenceProfile não configurado (defina BEDROCK_MODEL_ID ou BEDROCK_INFERENCE_PROFILE_ARN)."
    );
  }

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    temperature,
    top_p: topP,
    messages: [
      ...sanitizeHistory(history),
      { role: "user", content: [{ type: "text", text: String(message ?? "").trim() }] },
    ],
  };

  const cmd = new InvokeModelCommand({
    modelId: RESOLVED_MODEL_ID, // aceita tanto 'anthropic.claude-...' quanto ARN de inference-profile
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  // Timeout com AbortController (preserva comportamento do original)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let respBody: Uint8Array | undefined;

  try {
    const resp = await bedrock.send(cmd, { abortSignal: controller.signal });
    respBody = resp.body as Uint8Array;
  } catch (err: any) {
    const code = err?.$metadata?.httpStatusCode;
    const name = err?.name || err?.Code || err?.code || "BedrockError";
    const msg = err?.message || JSON.stringify(err);
    if (name === "AbortError") {
      throw new Error(`Timeout ao chamar o Bedrock (${Math.round(timeoutMs / 1000)}s).`);
    }
    throw new Error(`Falha ao invocar Bedrock (${code ?? "?"}/${name}): ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  const text = new TextDecoder().decode(respBody ?? new Uint8Array());
  return extractText(text);
}
