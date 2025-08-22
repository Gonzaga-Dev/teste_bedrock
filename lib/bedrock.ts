// lib/bedrock.ts
// Chamada ao Bedrock (Claude Haiku via Inference Profile) sem SDK, com SigV4 manual.

import crypto from "crypto";
import http from "http";
import https from "https";

const REGION = process.env.BEDROCK_REGION || "us-east-1";
const MODEL_ID = encodeURIComponent(process.env.BEDROCK_INFERENCE_PROFILE_ARN || "");
const SERVICE = "bedrock";
const HOST = `bedrock-runtime.${REGION}.amazonaws.com`;
const ENDPOINT = `https://${HOST}/model/${MODEL_ID}/invoke`;

type AwsCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: string;
};

type Msg = { role: "user" | "assistant"; content: string };

type InvokeArgs = {
  message: string;
  history?: Msg[];
};

function httpGetJson(url: string): Promise<any> {
  const lib = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    lib
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function getAwsCredentials(): Promise<AwsCreds> {
  // 1) ENV (útil localmente)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    };
  }
  // 2) Credenciais do container (execution role no Amplify)
  const rel = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  const full = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  const url = rel ? `http://169.254.170.2${rel}` : full;
  if (!url) throw new Error("Credenciais AWS não encontradas no ambiente/role.");
  const json = await httpGetJson(url);
  return {
    accessKeyId: json.AccessKeyId,
    secretAccessKey: json.SecretAccessKey,
    sessionToken: json.Token,
    expiration: json.Expiration,
  };
}

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

function signSigV4(params: {
  method: string;
  path: string;
  host: string;
  region: string;
  service: string;
  payload: string;
  creds: AwsCreds;
}) {
  const { method, path, host, region, service, payload, creds } = params;
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const canonicalUri = path; // /model/<encoded-arn>/invoke
  const canonicalQuerystring = "";
  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n` +
    (creds.sessionToken ? `x-amz-security-token:${creds.sessionToken}\n` : "");
  const signedHeaders =
    `content-type;host;x-amz-date` + (creds.sessionToken ? `;x-amz-security-token` : "");
  const payloadHash = sha256Hex(payload);

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + creds.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorizationHeader = `${algorithm} Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": amzDate,
    authorization: authorizationHeader,
  };
  if (creds.sessionToken) headers["x-amz-security-token"] = creds.sessionToken;

  return { headers };
}

export async function invokeHaiku({ message, history = [] }: InvokeArgs): Promise<string> {
  if (!MODEL_ID) throw new Error("BEDROCK_INFERENCE_PROFILE_ARN não definido.");
  const payload = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1000,
    temperature: 0.2,
    top_p: 0.9,
    messages: [
      ...history.map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] })),
      { role: "user", content: [{ type: "text", text: message }] },
    ],
  });

  const creds = await getAwsCredentials();
  const { headers } = signSigV4({
    method: "POST",
    path: `/model/${MODEL_ID}/invoke`,
    host: HOST,
    region: REGION,
    service: SERVICE,
    payload,
    creds,
  });

  const res = await fetch(ENDPOINT, { method: "POST", headers, body: payload });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Bedrock HTTP ${res.status}: ${errText || res.statusText}`);
  }

  const json = (await res.json()) as any;
  return json?.content?.[0]?.text?.toString().trim() ?? "[sem texto]";
}
