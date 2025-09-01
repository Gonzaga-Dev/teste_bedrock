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

const KB_ID = process.env.BEDROCK_KB_ID?.trim();
if (!KB_ID) throw new Error("BEDROCK_KB_ID não configurado.");

const client = new BedrockAgentRuntimeClient({ region: REGION });

export type RetrievedChunk = {
  text: string;
  source?: string; // título/URL se disponível
};

/** Busca n trechos relevantes da KB para a query. */
export async function retrieveFromKB(
  query: string,
  {
    maxResults = 6,           // quantos trechos retornar
    minScore = 0.0            // se quiser filtrar por score
  }: { maxResults?: number; minScore?: number } = {}
): Promise<RetrievedChunk[]> {
  const input: RetrieveCommandInput = {
    knowledgeBaseId: KB_ID,
    retrievalQuery: { text: query },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: maxResults,
      },
    },
  };

  const resp = await client.send(new RetrieveCommand(input));
  const items = resp?.retrievalResults ?? [];

  return items
    .filter((r) => (r.score ?? 0) >= minScore)
    .map((r) => ({
      text: r.content?.text ?? "",
      source:
        r.metadata?.title ||
        r.location?.webLocation?.url ||
        r.location?.s3Location?.uri,
    }))
    .filter((c) => c.text.trim().length > 0);
}
