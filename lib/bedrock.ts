// lib/bedrock.ts
// Invoca Bedrock (Claude 3.5 Haiku via Inference Profile preferencialmente) usando AWS SDK v3.
// Pensado para SSR no Next.js (Node runtime). NÃO use no client.
// Permissões mínimas na role SSR: bedrock:InvokeModel (e, se usar streaming, InvokeModelWithResponseStream).
// Opcional: bedrock:GetInferenceProfile se você usa ARNs de profile.
//
// ENV aceitas (nessa ordem de resolução):
//   BEDROCK_REGION | AWS_REGION | AWS_DEFAULT_REGION (default: us-east-1)
//   BEDROCK_INFERENCE_PROFILE_ARN  (preferido)
//   BEDROCK_MODEL_ID               (fallback; ex.: 'anthropic.claude-3-5-haiku-20241022-v1:0')
//   (opcional, local): BEDROCK_ACCESS_KEY_ID / BEDROCK_SECRET_ACCESS_KEY / BEDROCK_SESSION_TOKEN
//
// Observação: Inference Profile evita o erro 400 "on-demand throughput isn’t supported".

import "server-only";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// -------------------- Região & Modelo/Profile --------------------
const REGION =
  process.env.BEDROCK_REGION?.trim() ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";

// Preferência: profile -> modelId -> (fallback seguro: profile do Haiku em us-east-1)
const RESOLVED_MODEL_ID =
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
  /** Instruções e/ou contexto para RAG manual (será enviado em `system`). */
  system?: string;

  maxTokens?: number;      // default 1000
  temperature?: number;    // default 0.2
  topP?: number;           // default 0.9
  stopSequences?: string[]; // opcional

  timeoutMs?: number;      // default 30_000
  /** tentativas em erro transitório (5xx/Throttling). default 2 (total 3 execuções) */
  maxRetries?: number;     // default 2
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

  // Payload no formato Anthropic Messages (via Bedrock)
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
  // throttling / 5xx típicos
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
    // Em raros casos o serviço pode retornar texto plano
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
}: InvokeArgs): Promise<string> {
  if (!RESOLVED_MODEL_ID) {
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

  // Timeout com retry exponencial (curto e suficiente)
  let attempt = 0;
  let lastErr: any;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const respBody = await invokeOnce(RESOLVED_MODEL_ID, body, controller.signal);
      clearTimeout(timer);
      const text = extractText(decodeBody(respBody));
      return text;
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err;
      const code = err?.$metadata?.httpStatusCode;
      const name = err?.name || err?.Code || err?.code;

      if (name === "AbortError") {
        // timeout não costuma melhorar com retry (mas mantemos 1 tentativa extra)
        if (attempt >= maxRetries) {
          throw new Error(`Timeout ao chamar o Bedrock (${Math.round(timeoutMs / 1000)}s).`);
        }
      } else if (!shouldRetry(name, code) || attempt >= maxRetries) {
        const raw = (err?.message || JSON.stringify(err)).toString();
        throw new Error(`Falha ao invocar Bedrock (${code ?? "?"}/${name ?? "Erro"}): ${raw}`);
      }

      // backoff: 200ms, 600ms, 1400ms...
      const delay = 200 * Math.pow(3, attempt);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      attempt += 1;
    }
  }

  // fallback teórico
  const raw = (lastErr?.message || JSON.stringify(lastErr)).toString();
  throw new Error(`Falha ao invocar Bedrock: ${raw}`);
}
