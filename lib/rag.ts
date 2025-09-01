// lib/rag.ts
import 'server-only';
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
  type RetrieveAndGenerateCommandInput
} from "@aws-sdk/client-bedrock-agent-runtime";

const REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";
const KB_ID = process.env.BEDROCK_KB_ID;
const PROFILE_ARN = process.env.BEDROCK_INFERENCE_PROFILE_ARN; // Haiku via profile

const client = new BedrockAgentRuntimeClient({ region: REGION });

export async function ragWithKB(query: string, opts?: {
  maxTokens?: number; temperature?: number; topP?: number;
}) {
  if (!KB_ID) throw new Error("BEDROCK_KB_ID não configurado.");
  const input: RetrieveAndGenerateCommandInput = {
    input: { text: query },
    retrieveAndGenerateConfiguration: {
      type: "KNOWLEDGE_BASE",
      knowledgeBaseConfiguration: {
        knowledgeBaseId: KB_ID,
        ...(PROFILE_ARN ? { inferenceProfileArn: PROFILE_ARN } : {})
      }
    },
    inferenceConfig: {
      textInferenceConfig: {
        maxTokens: opts?.maxTokens ?? 1024,
        temperature: opts?.temperature ?? 0.2,
        topP: opts?.topP ?? 0.9
      }
    }
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
        const uri = r?.location?.s3Location?.uri || r?.location?.webLocation?.url;
        return `[#${i + 1}] ${title || uri || "fonte"}`;
      })
    ) ?? [];
  return { text: text.toString().trim(), citations };
}
