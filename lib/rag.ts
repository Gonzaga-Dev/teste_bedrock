// lib/rag.ts
import "server-only";
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
  type RetrieveAndGenerateCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";

const REGION =
  process.env.BEDROCK_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";

const KB_ID = process.env.BEDROCK_KB_ID?.trim();
const PROFILE_ARN = process.env.BEDROCK_INFERENCE_PROFILE_ARN?.trim();
const MODEL_ARN =
  process.env.BEDROCK_MODEL_ARN?.trim() ||
  "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0";

const client = new BedrockAgentRuntimeClient({ region: REGION });

export async function ragWithKB(query: string) {
  if (!KB_ID) throw new Error("BEDROCK_KB_ID não configurado.");

  const retrieveAndGenerateConfiguration: NonNullable<
    RetrieveAndGenerateCommandInput["retrieveAndGenerateConfiguration"]
  > = {
    type: "KNOWLEDGE_BASE",
    knowledgeBaseConfiguration: {
      knowledgeBaseId: KB_ID,
      modelArn: MODEL_ARN,
      ...(PROFILE_ARN ? { inferenceProfileArn: PROFILE_ARN } : {}),
    },
  };

  const input: RetrieveAndGenerateCommandInput = {
    input: { text: query },
    retrieveAndGenerateConfiguration,
    // Sem inferenceConfig por compatibilidade de tipos do SDK
  };

  const resp = await client.send(new RetrieveAndGenerateCommand(input));

  const text =
    resp?.output?.text ??
    resp?.session?.summary?.text ??
    "[sem texto]";

  const citations =
    resp?.citations?.flatMap((c, i) =>
      (c?.retrievedReferences ?? []).map((r) => {
        const title = r?.metadata?.title;
        const uri =
          r?.location?.s3Location?.uri || r?.location?.webLocation?.url;
        return `[#${i + 1}] ${title || uri || "fonte"}`;
      })
    ) ?? [];

  return { text: text.toString().trim(), citations };
}
