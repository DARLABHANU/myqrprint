import { createHash } from "node:crypto";
import nodemailer from "nodemailer";

type AccessTokenCache = { token: string; expiresAt: number; fingerprint: string };
let cachedAccessToken: AccessTokenCache | undefined;
let tokenRefreshInFlight: Promise<string> | undefined;

function gmailApiConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN &&
      (process.env.EMAIL_FROM || process.env.SMTP_FROM),
  );
}

function senderAddress(): string {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || "";
}

export function isMailConfigured(): boolean {
  return gmailApiConfigured() || Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function requireSafeAddress(value: string): string {
  const address = value.trim();
  const emailPattern = "[^<>\\s]+@[^<>\\s]+\\.[^<>\\s]+";
  const isAddress = new RegExp(`^(?:[^<>]*<${emailPattern}>|${emailPattern})$`).test(address);
  if (/[\r\n]/.test(value) || !isAddress) {
    throw new Error("A valid email address is required.");
  }
  return value.trim();
}

function encodeHeader(value: string): string {
  const normalized = value.replace(/[\r\n]/g, " ");
  return `=?UTF-8?B?${Buffer.from(normalized, "utf8").toString("base64")}?=`;
}

function createRawMessage(to: string, subject: string, text: string): string {
  const body = Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const mime = [
    `From: ${requireSafeAddress(senderAddress())}`,
    `To: ${requireSafeAddress(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

async function gmailRequest(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("Gmail email delivery is temporarily unavailable.");
  }
}

async function getGmailAccessToken(forceRefresh = false): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID ?? "";
  const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? "";
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN ?? "";
  const fingerprint = createHash("sha256").update(`${clientId}\0${clientSecret}\0${refreshToken}`).digest("hex");

  if (!forceRefresh && cachedAccessToken?.fingerprint === fingerprint && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  if (tokenRefreshInFlight) return tokenRefreshInFlight;

  tokenRefreshInFlight = (async () => {
    const response = await gmailRequest("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
    });
    const result = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
    if (!response.ok || !result.access_token) {
      throw new Error("Gmail authorization failed. Check the Gmail OAuth credentials in the server configuration.");
    }
    cachedAccessToken = {
      token: result.access_token,
      expiresAt: Date.now() + (Number(result.expires_in) || 3600) * 1000,
      fingerprint,
    };
    return result.access_token;
  })().finally(() => {
    tokenRefreshInFlight = undefined;
  });

  return tokenRefreshInFlight;
}

async function sendWithGmailApi(to: string, subject: string, text: string): Promise<void> {
  const raw = createRawMessage(to, subject, text);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await getGmailAccessToken(attempt === 1);
    const response = await gmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    const result = await response.json().catch(() => ({})) as { id?: string };
    if (response.status === 401 && attempt === 0) {
      cachedAccessToken = undefined;
      continue;
    }
    if (!response.ok || !result.id) throw new Error("Gmail could not send the account email. Check the OAuth sender and Gmail API access.");
    return;
  }
}

export async function sendAccountEmail(to: string, subject: string, text: string): Promise<void> {
  if (gmailApiConfigured()) {
    await sendWithGmailApi(to, subject, text);
    return;
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    throw new Error("Configure Gmail OAuth or SMTP to send account emails.");
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true",
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
