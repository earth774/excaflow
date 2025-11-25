import {
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getR2Client, getR2BucketName, getR2PublicUrl } from "./r2Client";

/**
 * MIME type to file extension mapping
 */
const mimeToExtension: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
};

/**
 * Upload a file to R2 Storage for a room
 * @param roomId - The room ID
 * @param fileId - The file ID (from Excalidraw)
 * @param dataURL - The data URL (base64) of the file
 * @param mimeType - The MIME type of the file
 * @returns The public URL of the uploaded file
 */
export async function uploadRoomFileToStorage(
  roomId: string,
  fileId: string,
  dataURL: string,
  mimeType: string
): Promise<string> {
  try {
    console.log("[r2Storage] Starting upload:", {
      roomId,
      fileId,
      mimeType,
    });

    const r2Client = getR2Client();
    const bucketName = getR2BucketName();

    // Extract base64 data from data URL
    const base64Data = dataURL.includes(",") ? dataURL.split(",")[1] : dataURL;
    const buffer = Buffer.from(base64Data, "base64");

    console.log("[r2Storage] Buffer created:", {
      bufferLength: buffer.length,
      base64Length: base64Data.length,
    });

    // Determine file extension from MIME type
    const extension = mimeToExtension[mimeType] || mimeType.split("/")[1] || "png";
    const key = `${roomId}/${fileId}.${extension}`;

    console.log("[r2Storage] Object key:", key);

    // Upload file to R2
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await r2Client.send(command);

    console.log("[r2Storage] Upload successful");

    // Get public URL
    const publicUrl = getR2PublicUrl(key);

    console.log("[r2Storage] Public URL:", publicUrl);

    return publicUrl;
  } catch (error) {
    console.error("[r2Storage] Error in uploadRoomFileToStorage:", error);
    throw error;
  }
}

/**
 * Delete a file from R2 Storage
 * @param roomId - The room ID
 * @param fileId - The file ID (from Excalidraw)
 * @param mimeType - The MIME type (to determine extension)
 */
export async function deleteRoomFileFromStorage(
  roomId: string,
  fileId: string,
  mimeType: string
): Promise<void> {
  try {
    const extension = mimeToExtension[mimeType] || mimeType.split("/")[1] || "png";
    const key = `${roomId}/${fileId}.${extension}`;

    console.log("[r2Storage] Deleting file:", key);

    const r2Client = getR2Client();
    const bucketName = getR2BucketName();

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await r2Client.send(command);

    console.log("[r2Storage] File deleted successfully:", key);
  } catch (error) {
    console.error("[r2Storage] Error in deleteRoomFileFromStorage:", error);
    // Don't throw - file might not exist
  }
}

/**
 * Delete all files in a room's folder from R2 Storage
 * @param roomId - The room ID
 */
export async function deleteRoomFolder(roomId: string): Promise<void> {
  try {
    console.log(`[r2Storage] Attempting to delete folder for room: ${roomId}`);

    const r2Client = getR2Client();
    const bucketName = getR2BucketName();

    // 1. List all files in the folder
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${roomId}/`,
    });

    const listResult = await r2Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`[r2Storage] No files found for room ${roomId}`);
      return;
    }

    console.log(`[r2Storage] Found ${listResult.Contents.length} files to delete for room ${roomId}`);

    // 2. Delete all files found (batch delete)
    const objectsToDelete = listResult.Contents
      .filter((obj) => obj.Key) // Filter out any undefined keys
      .map((obj) => ({ Key: obj.Key! }));

    if (objectsToDelete.length === 0) {
      console.log(`[r2Storage] No valid keys to delete for room ${roomId}`);
      return;
    }

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: objectsToDelete,
        Quiet: true,
      },
    });

    await r2Client.send(deleteCommand);

    console.log(`[r2Storage] Successfully deleted ${objectsToDelete.length} files for room ${roomId}`);
  } catch (error) {
    console.error("[r2Storage] Error in deleteRoomFolder:", error);
    // Don't throw - deletion is best effort
  }
}

