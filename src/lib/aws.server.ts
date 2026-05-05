/**
 * MERKABAH · AWS server helper
 *
 * Zero-dependency AWS SigV4 signer for the few high-leverage AWS calls the
 * Operator needs from the constellation. Starts with STS GetCallerIdentity
 * so we can verify the AWS console is alive and report the account ID.
 *
 * No AWS SDK — keeps the Worker bundle small and avoids native-dep failures
 * in the edge runtime. Add new endpoints by following the same SigV4 recipe.
 */
import { createHash, createHmac } from "crypto";

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export type AwsCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
};

export function readAwsCreds(): AwsCreds | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!accessKeyId || !secretAccessKey) return null;
  return {
    accessKeyId,
    secretAccessKey,
    region,
    sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
  };
}

/**
 * Sign and send a SigV4 request to a global/regional AWS service.
 */
export async function awsSignedFetch(opts: {
  service: string;
  host: string;
  region?: string;
  method?: "GET" | "POST";
  path?: string;
  query?: Record<string, string>;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<Response> {
  const creds = readAwsCreds();
  if (!creds) throw new Error("AWS credentials missing (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)");
  const region = opts.region ?? creds.region;
  const method = opts.method ?? "POST";
  const path = opts.path ?? "/";
  const body = opts.body ?? "";
  const queryStr = opts.query
    ? Object.keys(opts.query).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(opts.query![k])}`).join("&")
    : "";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const baseHeaders: Record<string, string> = {
    host: opts.host,
    "x-amz-date": amzDate,
    ...(creds.sessionToken ? { "x-amz-security-token": creds.sessionToken } : {}),
    ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded; charset=utf-8" } : {}),
    ...(opts.headers ?? {}),
  };

  const signedHeaderNames = Object.keys(baseHeaders).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${baseHeaders[h].trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const payloadHash = sha256Hex(body);

  const canonicalRequest = [method, path, queryStr, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${opts.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac("AWS4" + creds.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, opts.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${opts.host}${path}${queryStr ? `?${queryStr}` : ""}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  try {
    return await fetch(url, {
      method,
      headers: { ...baseHeaders, Authorization: authHeader },
      body: method === "POST" ? body : undefined,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * STS GetCallerIdentity — verifies AWS keys & returns account id, ARN, user id.
 */
export async function awsWhoAmI(): Promise<{
  ok: boolean;
  account?: string;
  arn?: string;
  userId?: string;
  region?: string;
  error?: string;
}> {
  try {
    const creds = readAwsCreds();
    if (!creds) return { ok: false, error: "AWS credentials not configured" };
    const res = await awsSignedFetch({
      service: "sts",
      host: "sts.amazonaws.com",
      region: "us-east-1",
      method: "POST",
      body: "Action=GetCallerIdentity&Version=2011-06-15",
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `STS ${res.status}: ${text.slice(0, 200)}` };
    const account = text.match(/<Account>([^<]+)<\/Account>/)?.[1];
    const arn = text.match(/<Arn>([^<]+)<\/Arn>/)?.[1];
    const userId = text.match(/<UserId>([^<]+)<\/UserId>/)?.[1];
    return { ok: true, account, arn, userId, region: creds.region };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
