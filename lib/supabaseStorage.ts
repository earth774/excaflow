import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "excalidraw-files";

/**
 * Get Supabase client for server-side operations with service role key
 * This has admin privileges and can bypass RLS policies
 */
function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const missingVars = [];
    if (!supabaseUrl) missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!serviceRoleKey) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");
    
    console.error("[supabaseStorage] Missing environment variables:", missingVars);
    throw new Error(
      `Missing Supabase environment variables: ${missingVars.join(", ")}. Please ensure these are set in your .env file.`
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Ensure the storage bucket exists, create it if it doesn't
 */
async function ensureBucketExists(): Promise<void> {
  const supabase = getSupabaseAdminClient();
  
  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error("Error listing buckets:", listError);
    throw new Error(`Failed to check buckets: ${listError.message}`);
  }

  const bucketExists = buckets?.some((bucket) => bucket.name === STORAGE_BUCKET);
  
  if (!bucketExists) {
    // Create the bucket if it doesn't exist
    const { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
      public: true, // Make bucket public so files can be accessed via public URL
      fileSizeLimit: 10485760, // 10MB limit
    });

    if (createError) {
      console.error("Error creating bucket:", createError);
      throw new Error(`Failed to create bucket: ${createError.message}`);
    }
    
    console.log(`Created storage bucket: ${STORAGE_BUCKET}`);
  }
}

/**
 * Upload a file to Supabase Storage for a room
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
    console.log("[supabaseStorage] Starting upload:", {
      roomId,
      fileId,
      mimeType,
    });

    // Ensure bucket exists before uploading
    await ensureBucketExists();
    console.log("[supabaseStorage] Bucket verified/created");

    // Extract base64 data from data URL
    const base64Data = dataURL.includes(",") ? dataURL.split(",")[1] : dataURL;
    const buffer = Buffer.from(base64Data, "base64");

    console.log("[supabaseStorage] Buffer created:", {
      bufferLength: buffer.length,
      base64Length: base64Data.length,
    });

    // Determine file extension from MIME type
    // Handle common MIME types and map to proper extensions
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
    
    const extension = mimeToExtension[mimeType] || mimeType.split("/")[1] || "png";
    const fileName = `${roomId}/${fileId}.${extension}`;

    console.log("[supabaseStorage] File name:", fileName);

    const supabase = getSupabaseAdminClient();

    // Upload file to storage
    console.log("[supabaseStorage] Uploading to bucket:", STORAGE_BUCKET);
    const { error, data } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true, // Replace if exists
      });

    if (error) {
      console.error("[supabaseStorage] Error uploading file:", error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    console.log("[supabaseStorage] Upload successful:", data);

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);

    console.log("[supabaseStorage] Public URL:", publicUrl);

    return publicUrl;
  } catch (error) {
    console.error("[supabaseStorage] Error in uploadRoomFileToStorage:", error);
    throw error;
  }
}

/**
 * Delete a file from Supabase Storage
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
    const extension = mimeType.split("/")[1] || "png";
    const fileName = `${roomId}/${fileId}.${extension}`;

    const supabase = getSupabaseAdminClient();

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([fileName]);

    if (error) {
      console.error("Error deleting file from Supabase Storage:", error);
      // Don't throw - file might not exist
    }
  } catch (error) {
    console.error("Error in deleteRoomFileFromStorage:", error);
  }
}

/**
 * Delete all files in a room's folder from Supabase Storage
 * @param roomId - The room ID
 */
export async function deleteRoomFolder(roomId: string): Promise<void> {
  try {
    console.log(`[supabaseStorage] Attempting to delete folder for room: ${roomId}`);
    const supabase = getSupabaseAdminClient();

    // 1. List all files in the folder
    const { data: files, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(roomId);

    if (listError) {
      console.error("[supabaseStorage] Error listing files for deletion:", listError);
      return;
    }

    if (!files || files.length === 0) {
      console.log(`[supabaseStorage] No files found for room ${roomId}`);
      return;
    }

    console.log(`[supabaseStorage] Found ${files.length} files to delete for room ${roomId}`);

    // 2. Delete all files found
    // The list returns file names relative to the folder, so we need to prepend the folder path
    const filesToDelete = files.map((file) => `${roomId}/${file.name}`);
    
    const { error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(filesToDelete);

    if (deleteError) {
      console.error("[supabaseStorage] Error deleting files:", deleteError);
    } else {
      console.log(`[supabaseStorage] Successfully deleted ${files.length} files for room ${roomId}`);
    }
  } catch (error) {
    console.error("[supabaseStorage] Error in deleteRoomFolder:", error);
    // Don't throw - deletion is best effort
  }
}

