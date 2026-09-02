import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env } from "@/server/env";

export function spacesReady() {
  return Boolean(env.spacesEndpoint && env.spacesBucket && env.spacesKey && env.spacesSecret);
}

function spacesEndpointHost() {
  const raw = env.spacesEndpoint!.replace(/\/$/, "");
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  let host = url.host;
  const prefix = `${env.spacesBucket}.`;
  if (host.startsWith(prefix)) host = host.slice(prefix.length);
  return { origin: `${url.protocol}//${host}`, host };
}

function client() {
  const { origin } = spacesEndpointHost();
  return new S3Client({
    region: env.spacesRegion,
    endpoint: origin,
    credentials: {
      accessKeyId: env.spacesKey!,
      secretAccessKey: env.spacesSecret!,
    },
    forcePathStyle: false,
  });
}

function publicUrl(key: string) {
  if (env.spacesCdnBase) {
    return `${env.spacesCdnBase.replace(/\/$/, "")}/${key}`;
  }
  const { host } = spacesEndpointHost();
  return `https://${env.spacesBucket}.${host}/${key}`;
}

async function putLocal(bytes: Buffer, key: string) {
  const dir = path.join(process.cwd(), "data", "uploads", path.dirname(key));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), "data", "uploads", key), bytes);
  return { url: `/api/media/${key}`, key };
}

async function putRemoteOrLocal(bytes: Buffer, key: string, contentType: string) {
  if (spacesReady()) {
    try {
      await client().send(
        new PutObjectCommand({
          Bucket: env.spacesBucket,
          Key: key,
          Body: bytes,
          ACL: "public-read",
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      return { url: publicUrl(key), key };
    } catch (err) {
      console.error("[storage] Spaces put failed; using local copy");
      void err;
    }
  }
  return putLocal(bytes, key);
}

export async function readLocalUpload(key: string): Promise<Buffer | null> {
  const relative = key.replace(/^\/+/, "");
  if (!relative || relative.includes("..")) return null;
  try {
    return await readFile(path.join(process.cwd(), "data", "uploads", relative));
  } catch {
    return null;
  }
}

export async function ingestImage(input: {
  bytes: Buffer;
  key: string;
}): Promise<{ url: string; key: string }> {
  let processed: Buffer;
  try {
    processed = await sharp(input.bytes)
      .rotate()
      .resize(1024, 1024, { fit: "cover" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    processed = input.bytes;
  }
  const key = input.key.replace(/\.svg$/i, ".jpg");
  return putRemoteOrLocal(processed, key, "image/jpeg");
}

/** Pump metadata must be public HTTPS. Never fall back to /api/media. */
export async function putPublicJson(key: string, body: unknown): Promise<{ url: string; key: string }> {
  if (!spacesReady()) {
    throw new Error("Token metadata needs Spaces. Local files are not public to Pump.");
  }
  const bytes = Buffer.from(`${JSON.stringify(body, null, 2)}\n`, "utf8");
  await client().send(
    new PutObjectCommand({
      Bucket: env.spacesBucket,
      Key: key,
      Body: bytes,
      ACL: "public-read",
      ContentType: "application/json",
      CacheControl: "public, max-age=60",
    }),
  );
  return { url: publicUrl(key), key };
}
