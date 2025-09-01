// lib/retrieve.ts
import "server-only";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  type RetrieveCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";

const REGION =
  process.env.BEDROCK_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";

// Instanciar o client é seguro mesmo sem KB_ID
const client = new BedrockAgentRuntimeClient({ region: REGION });

export type RetrievedChunk = {
  text: string;
  source?: string;
};

function toStringSafe(x: unknown): string | undefined {
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  if (Array.isArray(x)) {
    const s = x.find((v) => typeof v === "string");
    if (typeof s === "string") return s;
  }
  if (x && typeof x === "object") {
    const maybe =
      (x as any).text ??
      (x as any).title ??
      (x as any).value ??
      (x as any).url ??
      (x as any).uri;
    if (typeof maybe === "string") return maybe;
  }
  return undefined;
}

/** Busca n trechos relevantes da KB para a query. */
export async function retrieveFromKB(
  query: string,
  { maxResults = 6, minScore = 0.0 }: { maxResults?: number; minScore?: number } = {}
): Promise<RetrievedChunk[]> {
  const KB_ID = process.env.BEDROCK_KB_ID?.trim();
  if (!KB_ID) {
    // Não estoura na importação; só aqui, quando de fato foi pedido retrieve
    throw new Error("BEDROCK_KB_ID não configurado.");
  }

  const input: RetrieveCommandInput = {
    knowledgeBaseId: KB_ID,
    retrievalQuery: { text: query },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults: maxResults },
    },
  };

  const resp = await client.send(new RetrieveCommand(input));
  const items = resp?.retrievalResults ?? [];

  return items
    .filter((r) => (r.score ?? 0) >= minScore)
    .map((r) => {
      const text = r.content?.text ?? "";
      const url =
        r.location?.webLocation?.url || r.location?.s3Location?.uri || undefined;
      const title = toStringSafe((r as any)?.metadata?.title);
      const source = url || title;
      return { text, source };
    })
    .filter((c) => c.text.trim().length > 0);
}
