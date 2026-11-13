import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";

export type CloudinaryConfig = {
  apiKey: string;
  apiSecret: string;
  cloudName: string;
};

export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
  resourceType: string;
  bytes: number;
};

export function getCloudinaryConfig(): CloudinaryConfig | null {
  const urlEnv = process.env.CLOUDINARY_URL?.trim();
  if (urlEnv) {
    const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(urlEnv);
    if (match) {
      return {
        apiKey: match[1],
        apiSecret: match[2],
        cloudName: match[3],
      };
    }
  }

  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();

  if (apiKey && apiSecret && cloudName) {
    return { apiKey, apiSecret, cloudName };
  }

  return null;
}

export function isCloudinaryEnabled(): boolean {
  return getCloudinaryConfig() !== null;
}

function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string): string {
  const sortedKeys = Object.keys(params).sort();
  const serialized = sortedKeys
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${serialized}${apiSecret}`).digest("hex");
}

export async function uploadToCloudinary(options: {
  filePath: string;
  originalName: string;
  mediaType: string;
  folder?: string;
  publicId?: string;
}): Promise<CloudinaryUploadResult> {
  const config = getCloudinaryConfig();
  if (!config) {
    throw new Error("Cloudinary credentials are not configured in environment (CLOUDINARY_URL).");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = options.folder ?? "printly_uploads";
  const cleanPublicId = (options.publicId ?? `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  const paramsToSign: Record<string, string | number> = {
    folder,
    public_id: cleanPublicId,
    timestamp,
  };

  const signature = signCloudinaryParams(paramsToSign, config.apiSecret);
  const buffer = await readFile(options.filePath);

  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: options.mediaType }), options.originalName);
  formData.append("api_key", config.apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("folder", folder);
  formData.append("public_id", cleanPublicId);
  formData.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`;
  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  const body = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    resource_type?: string;
    bytes?: number;
    error?: { message?: string };
  };

  if (!response.ok || !body.secure_url || !body.public_id) {
    const errorMsg = body.error?.message ?? `Upload failed with HTTP ${response.status}`;
    throw new Error(`Cloudinary error: ${errorMsg}`);
  }

  return {
    secureUrl: body.secure_url,
    publicId: body.public_id,
    resourceType: body.resource_type ?? "auto",
    bytes: body.bytes ?? buffer.length,
  };
}

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: string = "image",
): Promise<boolean> {
  const config = getCloudinaryConfig();
  if (!config || !publicId) return false;

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign: Record<string, string | number> = {
      public_id: publicId,
      timestamp,
    };
    const signature = signCloudinaryParams(paramsToSign, config.apiSecret);

    const formData = new FormData();
    formData.append("public_id", publicId);
    formData.append("timestamp", String(timestamp));
    formData.append("api_key", config.apiKey);
    formData.append("signature", signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/destroy`;
    const response = await fetch(endpoint, { method: "POST", body: formData });
    const data = (await response.json()) as { result?: string };
    return data.result === "ok";
  } catch (error) {
    console.warn(`[Cloudinary] Could not delete asset ${publicId}:`, error);
    return false;
  }
}

export async function pipeCloudinaryStream(
  secureUrl: string,
  targetResponse: { setHeader: (name: string, value: string) => void; write: (chunk: unknown) => boolean; end: () => void },
): Promise<void> {
  const response = await fetch(secureUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch file from Cloudinary (HTTP ${response.status})`);
  }

  // @ts-expect-error Readable.fromWeb works in Node 18+
  const stream = Readable.fromWeb(response.body);
  return new Promise((resolve, reject) => {
    stream.on("error", reject);
    // @ts-expect-error Express response
    stream.pipe(targetResponse);
    stream.on("end", resolve);
  });
}

