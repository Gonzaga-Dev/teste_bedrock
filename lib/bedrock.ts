// lib/bedrock.ts
// Sem SDK: assina SigV4 na mão e chama o endpoint REST do Bedrock.
// Requer Node 18+ (crypto nativo).

import crypto from "crypto";
import http from "http";
import https from "https";

export const dynamic = "force-dynamic";

const REGION = process.env.BEDROCK_REGION || "us-east-1";
const MODEL_ID = encodeURIComponent(process.env.BEDROCK_INFERENCE_PROFILE_ARN || "");
const SERVICE = "bedrock";
const HOST = `bedrock-runtime.${REGION}.amazonaws.com`;
const ENDPOINT = `https://${HOST}/model/${MODEL_ID}/invoke`;

// ------------------------- Credenciais (Role do Amplify) -------------------------
// Tenta, nesta ordem: variáveis de ambiente locais -> endpoint de tarefa (Amplify/ECS)
type AwsCreds = { accessKeyId: string; secretAccessKey: string; sessionToken?: string; expiration?: string; };

async function getAwsCredentials(): Promise<AwsCreds> {
  // 1) ENV (útil em dev local)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN
    };
  }

  // 2) Credenciais do container (Amplify usa task role sob o capô)
  const rel = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  const full = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  const url = rel ? `http://169.254.170.2${rel}` : full;

  if (!url) {
    throw new Error("Credenciais AWS não encontradas (defina envs ou use a execution role do Amplify).");
  }

  const json = await httpGetJson(url);
  return {
    accessKeyId: json.AccessKeyId,
    secretAccessKey: json.SecretAccessKey,
    sessionToken: json.Token,
    expiration: json.Expiration
  };
}

function httpGetJson(url: string): Promise<any> {
  const lib = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

// ------------------------- SigV4 helpers -------------------------
function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const HH = String(date.getUTCHours()).padStart(2, "0");
  const MM = String(date.getUTCMinutes()).padStart(2, "0");
  const SS = String(date.getUTCSeconds()).padStart(2, "0");
  const dateStamp = `${yyyy}${mm}${dd}`;
  const amzDate = `${dateStamp}T${HH}${MM}${SS}Z`;
  return { amzDate, dateStamp };
}

function signSigV4({
  method,
  path,
  host,
  region,
  service,
  payload,
  creds
}: {
  method: string;
  path: string;
  host: string;
  region: string;
  service: string;
  payload: string;
  creds: AwsCreds;
}) {
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const canonicalUri = path;             // ex: /model/<encoded-arn>/invoke
  const canonicalQuerystring = "";       // POST sem query
  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n` +
    (creds.sessionToken ? `x-amz-security-token:${creds.sessionToken}\n` : "");
  const signedHeaders =
    `content-type;host;x-amz-date` + (creds.sessionToken ? `;x-amz-security-token` : "");

  const payloadHash = sha256Hex(payload);
  const canonicalRequest =
    `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign =
    `${algorithm}\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmac("AWS4" + creds.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorizationHeader =
    `${algorithm} Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "host": host,
    "x-amz-date": amzDate,
    "authorization": authorizationHeader
  };
  if (creds.sessionToken) headers["x-amz-security-token"] = creds.sessionToken;

  return { headers };
}

// ------------------------- Invocação do Haiku -------------------------
type Msg = { role: "user" | "assistant"; content: string };

export async function invokeHaiku({ message, history = [] as Msg[] }) {
  if (!MODEL_ID) throw new Error("BEDROCK_INFERENCE_PROFILE_ARN não definido.");
  const payload = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1000,
    temperature: 0.2,
    top_p: 0.9,
    messages: [
      ...history.map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] })),
      { role: "user", content: [{ type: "text", text: message }] }
    ]
  });

  const creds = await getAwsCredentials();
  const { headers } = signSigV4({
    method: "POST",
    path: `/model/${MODEL_ID}/invoke`,
    host: HOST,
    region: REGION,
    service: "bedrock",
    payload,
    creds
  });

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: payload,
    // keepalive: true  // opcional
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Bedrock HTTP ${res.status}: ${errText || res.statusText}`);
  }

  const json = await res.json();
  const reply = json?.content?.[0]?.text?.toString().trim() ?? "[sem texto]";
  return reply;
}
