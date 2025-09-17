// lib/bedrock.ts
// Invoca Bedrock (Claude 3.5 Haiku via Inference Profile preferencialmente) usando AWS SDK v3.
// Pensado para SSR no Next.js (Node runtime). NÃO use no client.

import "server-only";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// -------------------- Região & Modelo/Profile --------------------
const REGION =
  process.env.BEDROCK_REGION?.trim() ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";

// Preferência: profile -> modelId -> fallback seguro
const DEFAULT_MODEL_OR_PROFILE =
  process.env.BEDROCK_INFERENCE_PROFILE_ARN?.trim() ||
  process.env.BEDROCK_MODEL_ID?.trim() ||
  "arn:aws:bedrock:us-east-1:299276366441:inference-profile/us.anthropic.claude-3-5-haiku-20241022-v1:0";

// -------------------- Credenciais (opcional, local) --------------------
// Em produção (Amplify SSR), NÃO defina chaves. Deixe o provider chain usar a role.
function getOptionalStaticCredentials() {
  const akid = process.env.BEDROCK_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.BEDROCK_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const token = process.env.BEDROCK_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
  return akid && secret
    ? { accessKeyId: akid, secretAccessKey: secret, sessionToken: token }
    : undefined;
}

// -------------------- Cliente --------------------
const bedrock = new BedrockRuntimeClient({
  region: REGION,
  credentials: getOptionalStaticCredentials(),
});

// -------------------- Tipos --------------------
export type Msg = { role: "user" | "assistant"; content: string };

export type InvokeArgs = {
  message: string;
  history?: Msg[];
  /** Instruções e/ou contexto para RAG manual (vai em `system`). */
  system?: string;

  maxTokens?: number;       // default 1000
  temperature?: number;     // default 0.2
  topP?: number;            // default 0.9
  stopSequences?: string[]; // opcional

  timeoutMs?: number;       // default 30_000
  /** tentativas em erro transitório (5xx/Throttling). default 2 (total 3 execuções) */
  maxRetries?: number;      // default 2

  /** Override pontual de modelo/profile para A/B */
  modelIdOverride?: string;
};

// -------------------- Util --------------------
function sanitizeHistory(history: Msg[] = []) {
  return history
    .filter(
      (h) =>
        h &&
        (h.role === "user" || h.role === "assistant") &&
        typeof h.content === "string" &&
        h.content.trim().length > 0,
    )
    .slice(-20)
    .map((h) => ({
      role: h.role,
      content: [{ type: "text", text: h.content }],
    }));
}

function buildPayload(args: Required<Pick<InvokeArgs, "message" | "maxTokens" | "temperature" | "topP">> & {
  historyBlocks: ReturnType<typeof sanitizeHistory>;
  system?: string;
  stopSequences?: string[];
}) {
  const { message, historyBlocks, maxTokens, temperature, topP, system, stopSequences } = args;

  const payload: any = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    temperature,
    top_p: topP,
    messages: [
      ...historyBlocks,
      { role: "user", content: [{ type: "text", text: String(message ?? "").trim() }] },
    ],
  };

  if (system && system.trim().length > 0) {
    // aceita string e envia como bloco de system
    payload.system = [{ type: "text", text: system }];
  }
  if (Array.isArray(stopSequences) && stopSequences.length > 0) {
    payload.stop_sequences = stopSequences;
  }

  return payload;
}

function shouldRetry(name?: string, code?: number) {
  if (!name && !code) return false;
  const n = (name || "").toLowerCase();
  if (n.includes("throttl")) return true;
  if (n.includes("timeout")) return true;
  if (code && code >= 500) return true;
  return false;
}

async function invokeOnce(
  modelId: string,
  body: string,
  abortSignal: AbortSignal,
): Promise<Uint8Array | undefined> {
  const cmd = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body,
  });
  const resp = await bedrock.send(cmd, { abortSignal });
  return resp.body as Uint8Array;
}

function decodeBody(buf?: Uint8Array): string {
  return new TextDecoder().decode(buf ?? new Uint8Array());
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
    return raw.trim() || "[sem texto]";
  }
}

// -------------------- API principal --------------------
export async function invokeHaiku({
  message,
  history = [],
  system,
  maxTokens = 1000,
  temperature = 0.2,
  topP = 0.9,
  stopSequences,
  timeoutMs = 30_000,
  maxRetries = 2,
  modelIdOverride,
}: InvokeArgs): Promise<string> {
  const resolvedModelId = (modelIdOverride || DEFAULT_MODEL_OR_PROFILE || "").trim();
  if (!resolvedModelId) {
    throw new Error(
      "ModelId/InferenceProfile não configurado (defina BEDROCK_INFERENCE_PROFILE_ARN ou BEDROCK_MODEL_ID).",
    );
  }

  const historyBlocks = sanitizeHistory(history);
  const payloadObj = buildPayload({
    message,
    historyBlocks,
    maxTokens,
    temperature,
    topP,
    system,
    stopSequences,
  });
  const body = JSON.stringify(payloadObj);

  let attempt = 0;
  let lastErr: any;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const respBody = await invokeOnce(resolvedModelId, body, controller.signal);
      clearTimeout(timer);
      const text = extractText(decodeBody(respBody));
      return text;
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err;
      const code = err?.$metadata?.httpStatusCode;
      const name = err?.name || err?.Code || err?.code;

      if (name === "AbortError") {
        if (attempt >= maxRetries) {
          throw new Error(`Timeout ao chamar o Bedrock (${Math.round(timeoutMs / 1000)}s).`);
        }
      } else if (!shouldRetry(name, code) || attempt >= maxRetries) {
        const raw = (err?.message || JSON.stringify(err)).toString();
        throw new Error(`Falha ao invocar Bedrock (${code ?? "?"}/${name ?? "Erro"}): ${raw}`);
      }

      // Backoff: 200ms, 600ms, 1800ms...
      const delay = 200 * Math.pow(3, attempt);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      attempt += 1;
    }
  }

  const raw = (lastErr?.message || JSON.stringify(lastErr)).toString();
  throw new Error(`Falha ao invocar Bedrock: ${raw}`);
}
