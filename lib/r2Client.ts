import { S3Client } from "@aws-sdk/client-s3";

/**
 * Get R2 S3-compatible client for server-side operations
 */
function getR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    const missingVars = [];
    if (!endpoint) missingVars.push("R2_ENDPOINT");
    if (!accessKeyId) missingVars.push("R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missingVars.push("R2_SECRET_ACCESS_KEY");

    console.error("[r2Client] Missing environment variables:", missingVars);
    throw new Error(
      `Missing R2 environment variables: ${missingVars.join(", ")}. Please ensure these are set in your .env file.`
    );
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Get the R2 bucket name from environment
 */
function getR2BucketName(): string {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("Missing R2_BUCKET_NAME environment variable.");
  }
  return bucketName;
}

/**
 * Generate public URL for an object in R2
 * Requires R2_PUBLIC_BASE_URL to be set (public bucket URL or custom domain)
 * 
 * To get R2_PUBLIC_BASE_URL:
 * 1. Go to Cloudflare Dashboard → R2 → your bucket
 * 2. Settings → Public access → Enable "Allow public access"
 * 3. Copy the public URL (e.g., https://pub-xxx.r2.dev)
 */
function getR2PublicUrl(key: string): string {
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  
  if (!publicBaseUrl) {
    console.error("[r2Client] Missing R2_PUBLIC_BASE_URL environment variable.");
    console.error("[r2Client] To fix: Enable public access on your R2 bucket and set R2_PUBLIC_BASE_URL");
    throw new Error(
      "Missing R2_PUBLIC_BASE_URL environment variable. Please enable public access on your R2 bucket and set the public URL."
    );
  }
  
  // Use public bucket URL or custom domain
  // e.g., https://pub-xxx.r2.dev/roomId/fileId.png
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

export { getR2Client, getR2BucketName, getR2PublicUrl };

