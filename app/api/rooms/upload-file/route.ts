import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/supabaseServer";
import { uploadRoomFileToStorage } from "@/lib/supabaseStorage";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { roomId, fileId, dataURL, mimeType } = body;

    console.log("[upload-file] Received upload request:", {
      roomId,
      fileId,
      mimeType,
      dataURLLength: dataURL?.length || 0,
      dataURLPrefix: dataURL?.substring(0, 50) || "missing",
    });

    // Validate required fields
    if (!roomId || !fileId || !dataURL || !mimeType) {
      console.error("[upload-file] Missing required fields:", {
        hasRoomId: !!roomId,
        hasFileId: !!fileId,
        hasDataURL: !!dataURL,
        hasMimeType: !!mimeType,
      });
      return NextResponse.json(
        { error: "Missing required fields: roomId, fileId, dataURL, mimeType" },
        { status: 400 }
      );
    }

    // Validate dataURL format
    if (!dataURL.startsWith("data:")) {
      console.error("[upload-file] Invalid dataURL format:", {
        dataURLPrefix: dataURL.substring(0, 50),
      });
      return NextResponse.json(
        { error: "Invalid dataURL format" },
        { status: 400 }
      );
    }

    // Check if room exists and user owns it (if room exists in DB)
    // Note: We allow uploads for local-only rooms that don't exist in DB yet
    const room = await prisma.room.findFirst({
      where: {
        id: roomId,
        ownerId: userId,
      },
    });

    if (room) {
      console.log("[upload-file] Room found in DB, verifying ownership");
    } else {
      console.log("[upload-file] Room not in DB yet (local-only), allowing upload anyway");
      // Allow upload for local-only rooms - roomId is just used as folder path in storage
    }

    // Estimate file size from base64 data
    const base64Data = dataURL.includes(",") ? dataURL.split(",")[1] : dataURL;
    const estimatedSize = (base64Data.length * 3) / 4; // Base64 is ~33% larger than binary
    
    console.log("[upload-file] File size estimation:", {
      base64Length: base64Data.length,
      estimatedSizeBytes: estimatedSize,
      estimatedSizeMB: (estimatedSize / 1024 / 1024).toFixed(2),
    });
    
    // Limit file size to 10MB (reasonable limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (estimatedSize > MAX_FILE_SIZE) {
      console.error("[upload-file] File too large:", {
        estimatedSize,
        maxSize: MAX_FILE_SIZE,
      });
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Upload file to Supabase Storage
    console.log("[upload-file] Starting upload to Supabase Storage...");
    const publicUrl = await uploadRoomFileToStorage(
      roomId,
      fileId,
      dataURL,
      mimeType
    );

    console.log("[upload-file] Upload successful:", {
      fileId,
      publicUrl,
    });

    return NextResponse.json({
      fileId,
      url: publicUrl,
      success: true,
    });
  } catch (error) {
    console.error("[upload-file] Error uploading file:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to upload file";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

