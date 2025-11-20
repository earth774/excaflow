"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  loadLocalRoom,
  updateLocalRoomScene,
  saveLocalRoom,
} from "@/lib/storage";
import { authenticatedFetch } from "@/lib/apiClient";
import type { ExcalidrawScene, LocalRoom, RoomStatus } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sanitizeAppState = (appState: any = {}) => {
  const cleanAppState = { ...appState };
  delete cleanAppState.collaborators;
  delete cleanAppState.socketId;
  return cleanAppState;
};

// Sanitize files to ensure dataURLs are valid (base64 strings or URLs)
// Accepts both data: URLs (base64) and http/https/blob URLs (from Supabase Storage)
// This function never throws - it always returns a valid object, skipping invalid files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sanitizeFiles = (files: any = {}): any => {
  try {
    if (!files || typeof files !== "object") {
      return {};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sanitized: any = {};
    
    for (const [fileId, file] of Object.entries(files)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileData = file as any;
      
      if (!fileData || typeof fileData !== "object") {
        continue;
      }

      // Copy file properties
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sanitizedFile: any = { ...fileData };

      // Validate and sanitize dataURL if present
      let hasValidDataURL = false;
      
      if (sanitizedFile.dataURL && typeof sanitizedFile.dataURL === "string") {
        const dataURL = String(sanitizedFile.dataURL);
        
        // Check if it's a data URL (base64)
        if (dataURL.startsWith("data:")) {
          try {
            // Extract the base64 part after the comma
            const base64Index = dataURL.indexOf(",");
            if (base64Index !== -1 && base64Index < dataURL.length) {
              const base64Part = dataURL.substring(base64Index + 1);
              
              if (base64Part && typeof base64Part === "string" && base64Part.length > 0) {
                // Remove any whitespace and newlines
                const cleanBase64 = base64Part.replace(/\s/g, "").replace(/\n/g, "").replace(/\r/g, "");
                
                // Validate base64 characters and length (must be multiple of 4 after padding)
                const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
                if (cleanBase64 && cleanBase64.length > 0 && base64Regex.test(cleanBase64)) {
                  // Check if length is valid (base64 strings should be multiple of 4, or have padding)
                  const paddingLength = (cleanBase64.match(/=/g) || []).length;
                  const baseLength = cleanBase64.length - paddingLength;
                  
                  // Base64 length should be valid (accounting for padding)
                  if (baseLength % 4 === 0 || (baseLength % 4 === 3 && paddingLength === 1) || (baseLength % 4 === 2 && paddingLength === 2)) {
                    // Try to decode to ensure it's valid
                    try {
                      // Validate by attempting to decode (we don't need the result)
                      atob(cleanBase64);
                      // If successful, keep the cleaned version
                      sanitizedFile.dataURL = dataURL.substring(0, base64Index + 1) + cleanBase64;
                      hasValidDataURL = true;
                    } catch (decodeError) {
                      // Invalid base64 - skip this file but don't crash
                      console.warn(`[sanitizeFiles] Invalid base64 in file ${fileId}, skipping file:`, decodeError instanceof Error ? decodeError.message : String(decodeError));
                      // Don't set hasValidDataURL - file will be skipped
                    }
                  } else {
                    // Invalid base64 length - skip this file
                    console.warn(`[sanitizeFiles] Invalid base64 length in file ${fileId}, skipping file`);
                  }
                } else {
                  // Invalid base64 format - skip this file
                  console.warn(`[sanitizeFiles] Invalid base64 format in file ${fileId}, skipping file`);
                }
              } else {
                // Invalid base64 part - skip this file
                console.warn(`[sanitizeFiles] Empty or invalid base64 part in file ${fileId}, skipping file`);
              }
            } else {
              // Invalid data URL format - skip this file
              console.warn(`[sanitizeFiles] Invalid data URL format in file ${fileId}, skipping file`);
            }
          } catch (error) {
            // Error validating - skip this file but don't crash
            console.warn(`[sanitizeFiles] Error validating dataURL in file ${fileId}:`, error instanceof Error ? error.message : String(error));
            // Don't set hasValidDataURL - file will be skipped
          }
        } 
        // Check if it's a URL (http/https/blob) - from Supabase Storage or other sources
        else if (
          dataURL.startsWith("http://") ||
          dataURL.startsWith("https://") ||
          dataURL.startsWith("blob:")
        ) {
          // Valid URL - accept it as-is
          hasValidDataURL = true;
        } else {
          // Not a recognized format - skip this file
          console.warn(`File ${fileId} has invalid dataURL format, skipping file`);
        }
      } else {
        // No dataURL - skip this file (Excalidraw requires dataURL)
        console.warn(`File ${fileId} has no dataURL, skipping file`);
      }

      // Only include files with valid dataURLs
      if (hasValidDataURL) {
        sanitized[fileId] = sanitizedFile;
      }
    }

    return sanitized;
  } catch (error) {
    // If anything goes wrong, return empty object and log the error
    console.error("[sanitizeFiles] Unexpected error sanitizing files:", error instanceof Error ? error.message : String(error));
    return {};
  }
};

// Helper function to convert blob URLs or other URLs to base64 data URL
// This ensures we have base64 data for Excalidraw when needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureBase64DataURL(file: any): Promise<string | null> {
  if (!file || !file.dataURL || typeof file.dataURL !== "string") {
    return null;
  }

  const dataURL = file.dataURL;

  // If it's already a base64 data URL, return it
  if (dataURL.startsWith("data:")) {
    return dataURL;
  }

  // If it's a blob URL or http/https URL, convert to base64
  if (dataURL.startsWith("blob:") || dataURL.startsWith("http://") || dataURL.startsWith("https://")) {
    try {
      const response = await fetch(dataURL);
      if (!response.ok) {
        console.warn(`[ensureBase64DataURL] Failed to fetch ${dataURL}: ${response.status}`);
        return null;
      }
      const blob = await response.blob();
      const reader = new FileReader();
      return await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("Failed to convert blob to base64"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error(`[ensureBase64DataURL] Error converting ${dataURL} to base64:`, error);
      return null;
    }
  }

  // Unknown format, return null
  return null;
}

// Create persistable files object by removing base64 data URLs
// Keeps metadata and Supabase URLs, but removes large base64 strings
// This prevents localStorage quota issues
// Flow: Excalidraw creates files with base64 → upload to Supabase → store URL in scene → load converts URL back to base64
// When saving to localStorage, we remove base64 data URLs (data:) but keep URLs (http/https/blob)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makePersistableFiles = (files: any = {}): any => {
  if (!files || typeof files !== "object") {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persistable: any = {};
  
  for (const [fileId, file] of Object.entries(files)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileData = file as any;
    
    if (!fileData || typeof fileData !== "object") {
      continue;
    }

    // Copy all file properties except dataURL (we'll handle it separately)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persistableFile: any = {};
    for (const [key, value] of Object.entries(fileData)) {
      if (key !== "dataURL") {
        persistableFile[key] = value;
      }
    }

    // Priority: Use supabaseUrl if available (file already uploaded)
    // Otherwise, use dataURL if it's a URL (not base64)
    // Remove base64 data URLs to save localStorage space
    if (fileData.supabaseUrl && typeof fileData.supabaseUrl === "string") {
      // File already uploaded to Supabase - use the URL
      persistableFile.dataURL = fileData.supabaseUrl;
      persistableFile.supabaseUrl = fileData.supabaseUrl;
    } else if (fileData.dataURL && typeof fileData.dataURL === "string") {
      const dataURL = String(fileData.dataURL);
      if (
        dataURL.startsWith("http://") ||
        dataURL.startsWith("https://") ||
        dataURL.startsWith("blob:")
      ) {
        // Keep URL from Supabase Storage or blob URL
        persistableFile.dataURL = dataURL;
      }
      // If it's a data: URL (base64), don't include it - it will be uploaded separately
      // The base64 will be removed, and when uploaded, supabaseUrl will be set
    }

    persistable[fileId] = persistableFile;
  }

  return persistable;
};

// Dynamic import Excalidraw with SSR disabled
const Excalidraw = dynamic(
  async () => {
    const excalidrawModule = await import("@excalidraw/excalidraw");
    return { default: excalidrawModule.Excalidraw };
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg">กำลังโหลด Excalidraw...</div>
      </div>
    ),
  }
);

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [localRoom, setLocalRoom] = useState<LocalRoom | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    status: RoomStatus;
    needsSync: boolean;
    lastSyncedAt: string | null;
    dbExists: boolean;
    isInSync: boolean | null; // null = not checked, true = in sync, false = out of sync
    serverUpdatedAt: string | null;
    syncAction: "sync" | "pull" | "push" | null; // sync = create new, pull = download from server, push = upload to server
  }>({
    status: "local-only",
    needsSync: false,
    lastSyncedAt: null,
    dbExists: false,
    isInSync: null,
    serverUpdatedAt: null,
    syncAction: null,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [initialScene, setInitialScene] = useState<ExcalidrawScene | null>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{
    localUpdatedAt: string;
    serverUpdatedAt: string;
  } | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAIPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Map<string, string>>(new Map());
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set());
  
  // Track current initialScene files to detect changes without causing re-renders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialSceneFilesRef = useRef<Record<string, any>>({});

  // Track uploaded file IDs to avoid duplicate uploads
  const uploadedFileIdsRef = useRef<Set<string>>(new Set());
  // Track files currently being uploaded to avoid concurrent uploads
  const uploadingFileIdsRef = useRef<Set<string>>(new Set());

  const prepareInitialScene = useCallback(
    async (room: LocalRoom): Promise<ExcalidrawScene> => {
      const scene = room?.scene || {};
      const filesBeforeSanitize = scene.files || {};
      
      // Convert URLs (from Supabase Storage) to base64 for Excalidraw to display
      // Flow: Files stored with Supabase URL → convert to base64 when loading → Excalidraw displays
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filesWithBase64: any = {};
      for (const [fileId, file] of Object.entries(filesBeforeSanitize)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileData = file as any;
        if (!fileData || typeof fileData !== "object") {
          continue;
        }
        
        // If file has URL (http/https/blob) but not base64, convert URL to base64
        // Excalidraw requires base64 data URLs to display images
        if (fileData.dataURL && typeof fileData.dataURL === "string") {
          const dataURL = String(fileData.dataURL);
          
          // If it's already a base64 data URL, use it as-is
          if (dataURL.startsWith("data:")) {
            filesWithBase64[fileId] = fileData;
            continue;
          }
          
          // If it's a URL (http/https/blob), convert to base64
          if (
            dataURL.startsWith("http://") ||
            dataURL.startsWith("https://") ||
            dataURL.startsWith("blob:")
          ) {
            try {
              console.log(`[prepareInitialScene] Converting URL to base64 for ${fileId}`);
              const base64DataURL = await ensureBase64DataURL(fileData);
              
              if (base64DataURL) {
                // Use base64 for display, keep URL for reference
                filesWithBase64[fileId] = {
                  ...fileData,
                  dataURL: base64DataURL,
                  supabaseUrl: fileData.supabaseUrl || dataURL,
                };
                console.log(`[prepareInitialScene] Converted URL to base64 for ${fileId}`);
                continue;
              } else {
                console.warn(`[prepareInitialScene] Failed to convert URL to base64 for ${fileId}, keeping URL`);
                // Keep URL as fallback (Excalidraw might handle it)
                filesWithBase64[fileId] = fileData;
                continue;
              }
            } catch (error) {
              console.error(`[prepareInitialScene] Error converting URL to base64 for ${fileId}:`, error);
              // Keep file as-is on error
              filesWithBase64[fileId] = fileData;
              continue;
            }
          }
        }
        
        // Keep file as-is (no dataURL or unknown format)
        filesWithBase64[fileId] = fileData;
      }
      
      const sanitizedFiles = sanitizeFiles(filesWithBase64);
      
      console.log("[prepareInitialScene] Preparing scene:", {
        roomId: room.id,
        filesBeforeSanitizeCount: Object.keys(filesBeforeSanitize).length,
        filesAfterSanitizeCount: Object.keys(sanitizedFiles).length,
        fileIdsBefore: Object.keys(filesBeforeSanitize),
        fileIdsAfter: Object.keys(sanitizedFiles),
      });
      
      return {
        elements: Array.isArray(scene.elements) ? scene.elements : [],
        appState: sanitizeAppState(scene.appState || {}),
        files: sanitizedFiles,
      };
    },
    []
  );

  // Initialize uploaded file IDs from room scene (files with URLs are already uploaded)
  const initializeUploadedFiles = useCallback((room: LocalRoom | null) => {
    if (!room || !room.scene.files) {
      return;
    }

    const uploadedIds = new Set<string>();
    for (const [fileId, file] of Object.entries(room.scene.files)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileData = file as any;
      if (
        fileData &&
        fileData.dataURL &&
        typeof fileData.dataURL === "string" &&
        (fileData.dataURL.startsWith("http://") ||
          fileData.dataURL.startsWith("https://") ||
          fileData.dataURL.startsWith("blob:"))
      ) {
        // File has a URL (from Supabase), mark as uploaded
        uploadedIds.add(fileId);
      }
    }
    uploadedFileIdsRef.current = uploadedIds;
  }, []);

  // Load room: first from DB, then check localStorage for drafts
  useEffect(() => {
    setIsClient(true);
    
    const loadRoom = async () => {
      try {
        // First, try to load from database (allow read access even without login)
        // Try authenticated first, fallback to regular fetch if no session
        let dbResponse: Response;
        try {
          dbResponse = await authenticatedFetch(`/api/rooms/${roomId}`);
        } catch {
          // If authenticated fetch fails (no session), try regular fetch
          dbResponse = await fetch(`/api/rooms/${roomId}`);
        }
        
        if (dbResponse.ok) {
          const dbRoom = await dbResponse.json();
          const dbUpdatedAt = new Date(dbRoom.updatedAt).toISOString();
          
          // Set ownership status
          setIsOwner(dbRoom.isOwner === true);
          
          // Check localStorage for draft (only if owner)
          const localDraft = dbRoom.isOwner ? loadLocalRoom(roomId) : null;
          
          if (localDraft) {
            const localUpdatedAt = new Date(localDraft.updatedAt).toISOString();
            
            // Compare timestamps
            if (localUpdatedAt !== dbUpdatedAt) {
              // Conflict detected - show dialog when user clicks "ตรวจสอบ"
              setConflictInfo({
                localUpdatedAt: localUpdatedAt,
                serverUpdatedAt: dbUpdatedAt,
              });
              
              // Use local draft for now, but mark as needing sync
              setLocalRoom(localDraft);
              prepareInitialScene(localDraft).then((scene) => {
                setInitialScene(scene);
                initialSceneFilesRef.current = scene.files || {}; // Update ref
              });
              initializeUploadedFiles(localDraft);
              setSyncStatus({
                status: localDraft.status,
                needsSync: true,
                lastSyncedAt: localDraft.lastSyncedAt,
                dbExists: true,
                isInSync: false,
                serverUpdatedAt: dbUpdatedAt,
                syncAction: null, // Will be determined when user checks
              });
            } else {
              // In sync - merge files from localDraft and DB
              // Local files might have newer uploads that haven't been synced yet
              const dbFiles = sanitizeFiles(dbRoom.scene?.files || {});
              const localFiles = localDraft?.scene?.files || {};
              
              // Merge files: prefer local files (they might have Supabase URLs from recent uploads)
              // but also include any files from DB that aren't in local
              const mergedFiles = {
                ...dbFiles,
                ...localFiles, // Local files override DB files (they're more recent)
              };
              
              console.log("[loadRoom] Merging files for synced room:", {
                roomId: dbRoom.id,
                dbFilesCount: Object.keys(dbFiles).length,
                localFilesCount: Object.keys(localFiles).length,
                mergedFilesCount: Object.keys(mergedFiles).length,
                dbFileIds: Object.keys(dbFiles),
                localFileIds: Object.keys(localFiles),
                mergedFileIds: Object.keys(mergedFiles),
              });
              
              const roomToUse = localDraft ? {
                ...localDraft,
                // Keep local files but ensure other scene data is from DB if more recent
                scene: {
                  ...localDraft.scene,
                  files: mergedFiles,
                  elements: dbRoom.scene?.elements || localDraft.scene.elements || [],
                  appState: sanitizeAppState(dbRoom.scene?.appState || localDraft.scene.appState || {}),
                },
              } : {
                id: dbRoom.id,
                title: dbRoom.title,
                description: dbRoom.description || undefined,
                scene: {
                  elements: dbRoom.scene?.elements || [],
                  appState: sanitizeAppState(dbRoom.scene?.appState || {}),
                  files: mergedFiles,
                },
                createdAt: new Date(dbRoom.createdAt).toISOString(),
                updatedAt: dbUpdatedAt,
                lastSyncedAt: dbRoom.lastSyncedAt
                  ? new Date(dbRoom.lastSyncedAt).toISOString()
                  : null,
                status: "synced" as RoomStatus,
              };
              
              // Always save merged room to localStorage
              saveLocalRoom(roomToUse);
              
              setLocalRoom(roomToUse);
              prepareInitialScene(roomToUse).then((scene) => {
                setInitialScene(scene);
              });
              initializeUploadedFiles(roomToUse);
              setSyncStatus({
                status: "synced",
                needsSync: false,
                lastSyncedAt: roomToUse.lastSyncedAt,
                dbExists: true,
                isInSync: true,
                serverUpdatedAt: dbUpdatedAt,
                syncAction: null,
              });
            }
          } else {
            // No local draft - use DB data and save to localStorage
            const roomToUse: LocalRoom = {
              id: dbRoom.id,
              title: dbRoom.title,
              description: dbRoom.description || undefined,
              scene: {
                elements: dbRoom.scene?.elements || [],
                appState: sanitizeAppState(dbRoom.scene?.appState || {}),
                files: sanitizeFiles(dbRoom.scene?.files || {}),
              },
              createdAt: new Date(dbRoom.createdAt).toISOString(),
              updatedAt: dbUpdatedAt,
              lastSyncedAt: dbRoom.lastSyncedAt
                ? new Date(dbRoom.lastSyncedAt).toISOString()
                : null,
              status: "synced",
            };
            
            saveLocalRoom(roomToUse);
            setLocalRoom(roomToUse);
            prepareInitialScene(roomToUse).then((scene) => {
              setInitialScene(scene);
              initialSceneFilesRef.current = scene.files || {}; // Update ref
            });
            initializeUploadedFiles(roomToUse);
            setSyncStatus({
              status: "synced",
              needsSync: false,
              lastSyncedAt: roomToUse.lastSyncedAt,
              dbExists: true,
              isInSync: true,
              serverUpdatedAt: dbUpdatedAt,
              syncAction: null,
            });
          }
        } else if (dbResponse.status === 404) {
          // Room doesn't exist in DB - check localStorage
          const localDraft = loadLocalRoom(roomId);
          
          if (localDraft) {
            setLocalRoom(localDraft);
            prepareInitialScene(localDraft).then((scene) => {
              setInitialScene(scene);
            });
            initializeUploadedFiles(localDraft);
            setSyncStatus({
              status: "local-only",
              needsSync: true,
              lastSyncedAt: localDraft.lastSyncedAt,
              dbExists: false,
              isInSync: null,
              serverUpdatedAt: null,
              syncAction: "sync",
            });
          } else {
            // Room doesn't exist anywhere - redirect to home
            window.location.href = "/";
          }
        } else {
          throw new Error("Failed to load room");
        }
      } catch (error) {
        console.error("Error loading room:", error);
        // Fallback to localStorage if API fails
        const localDraft = loadLocalRoom(roomId);
        if (localDraft) {
          setLocalRoom(localDraft);
          prepareInitialScene(localDraft).then((scene) => {
            setInitialScene(scene);
          });
          initializeUploadedFiles(localDraft);
          setSyncStatus({
            status: localDraft.status,
            needsSync: localDraft.status === "local-only",
            lastSyncedAt: localDraft.lastSyncedAt,
            dbExists: false,
            isInSync: null,
            serverUpdatedAt: null,
            syncAction: localDraft.status === "local-only" ? "sync" : null,
          });
        }
      }
    };
    
    loadRoom();

    // Load Excalidraw CSS dynamically
    if (!document.querySelector('link[href="/excalidraw.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/excalidraw.css";
      document.head.appendChild(link);
    }
  }, [roomId, prepareInitialScene, initializeUploadedFiles]);



  // Use ref to track debounce timeout and prevent infinite loops
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");

  // Upload file to Supabase Storage
  // Flow: Excalidraw creates files with base64 → upload to Supabase → store URL in scene → load converts URL back to base64
  // This keeps localStorage small (URLs instead of large base64 strings) while ensuring Excalidraw can display images
  const uploadFileToSupabase = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (fileId: string, file: any, roomId: string) => {
      // Skip if already uploaded or currently uploading
      if (
        uploadedFileIdsRef.current.has(fileId) ||
        uploadingFileIdsRef.current.has(fileId)
      ) {
        console.log(`[uploadFileToSupabase] Skipping ${fileId} - already uploaded or uploading`);
        return;
      }

      // Skip if not a base64 data URL
      if (
        !file.dataURL ||
        typeof file.dataURL !== "string" ||
        !file.dataURL.startsWith("data:")
      ) {
        console.log(`[uploadFileToSupabase] Skipping ${fileId} - not a base64 data URL:`, {
          hasDataURL: !!file.dataURL,
          dataURLType: typeof file.dataURL,
          dataURLPrefix: file.dataURL?.substring(0, 20),
        });
        return;
      }

      // Skip if no mimeType
      if (!file.mimeType) {
        console.warn(`[uploadFileToSupabase] File ${fileId} missing mimeType, skipping upload`);
        return;
      }

      console.log(`[uploadFileToSupabase] Starting upload for file ${fileId}:`, {
        roomId,
        fileId,
        mimeType: file.mimeType,
        dataURLLength: file.dataURL.length,
        dataURLPrefix: file.dataURL.substring(0, 50),
      });

      uploadingFileIdsRef.current.add(fileId);
      setUploadingFiles((prev) => new Set(prev).add(fileId));
      setUploadErrors((prev) => {
        const next = new Map(prev);
        next.delete(fileId);
        return next;
      });

      try {
        const response = await authenticatedFetch("/api/rooms/upload-file", {
          method: "POST",
          body: JSON.stringify({
            roomId,
            fileId,
            dataURL: file.dataURL,
            mimeType: file.mimeType,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || "Failed to upload file";
          console.error(`[uploadFileToSupabase] Upload failed for ${fileId}:`, {
            status: response.status,
            error: errorMessage,
          });
          throw new Error(errorMessage);
        }

        const { url } = await response.json();
        console.log(`[uploadFileToSupabase] Upload successful for ${fileId}:`, {
          url,
        });

        // Update local room scene with Supabase URL converted to base64
        // IMPORTANT: Excalidraw needs base64 data URL to display images immediately
        // We convert URL to base64 here so Excalidraw can show the image right away
        // The URL is stored separately in supabaseUrl for persistence (will be used when saving to localStorage)
        const currentRoom = loadLocalRoom(roomId);
        if (currentRoom) {
          console.log(`[uploadFileToSupabase] Converting Supabase URL to base64 for ${fileId}`);
          
          // Convert Supabase URL to base64 data URL for Excalidraw to display immediately
          let base64DataURL: string | null = null;
          try {
            const imageResponse = await fetch(url);
            if (imageResponse.ok) {
              const blob = await imageResponse.blob();
              const reader = new FileReader();
              base64DataURL = await new Promise<string>((resolve, reject) => {
                reader.onloadend = () => {
                  if (typeof reader.result === "string") {
                    resolve(reader.result);
                  } else {
                    reject(new Error("Failed to convert blob to base64"));
                  }
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              console.log(`[uploadFileToSupabase] Converted URL to base64 for ${fileId}`);
            } else {
              console.warn(`[uploadFileToSupabase] Failed to fetch image from URL: ${url}`);
              throw new Error(`Failed to fetch image: ${imageResponse.status}`);
            }
          } catch (error) {
            console.error(`[uploadFileToSupabase] Error converting URL to base64 for ${fileId}:`, error);
            throw error; // Re-throw to be caught by outer catch block
          }

          if (!base64DataURL) {
            throw new Error("Failed to convert URL to base64");
          }
          
          const updatedFiles = {
            ...currentRoom.scene.files,
            [fileId]: {
              ...currentRoom.scene.files?.[fileId],
              // Store base64 data URL for Excalidraw to display immediately
              dataURL: base64DataURL,
              // Store Supabase URL separately for persistence (will be used when saving to localStorage)
              supabaseUrl: url,
            },
          };

          console.log(`[uploadFileToSupabase] Files before update:`, {
            fileIds: Object.keys(currentRoom.scene.files || {}),
            targetFileId: fileId,
            targetFileBefore: currentRoom.scene.files?.[fileId] ? {
              hasDataURL: !!currentRoom.scene.files[fileId].dataURL,
              dataURLType: typeof currentRoom.scene.files[fileId].dataURL,
            } : "not found",
          });

          updateLocalRoomScene(roomId, {
            ...currentRoom.scene,
            files: updatedFiles,
          });

          // Verify the update
          const updatedRoom = loadLocalRoom(roomId);
          if (updatedRoom && updatedRoom.scene.files?.[fileId]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updatedFile = updatedRoom.scene.files[fileId] as any;
            console.log(`[uploadFileToSupabase] Files after update:`, {
              fileIds: Object.keys(updatedRoom.scene.files || {}),
              targetFileId: fileId,
              targetFileAfter: {
                hasDataURL: !!updatedFile.dataURL,
                dataURL: updatedFile.dataURL?.substring(0, 50),
                isURL: updatedFile.dataURL?.startsWith("http"),
              },
            });

            // Update localRoom state and initialScene to reflect the change
            // This ensures Excalidraw shows the uploaded file immediately
            setLocalRoom(updatedRoom);
            prepareInitialScene(updatedRoom).then((newScene) => {
              setInitialScene(newScene);
              initialSceneFilesRef.current = newScene.files || {}; // Update ref
              console.log(`[uploadFileToSupabase] Updated initialScene with uploaded file ${fileId}`);
            });
          } else {
            console.error(`[uploadFileToSupabase] Failed to verify update for ${fileId}`);
          }

          // Mark as uploaded
          uploadedFileIdsRef.current.add(fileId);
          setUploadedFiles((prev) => new Set(prev).add(fileId));
          setUploadingFiles((prev) => {
            const next = new Set(prev);
            next.delete(fileId);
            return next;
          });
          console.log(`[uploadFileToSupabase] Marked ${fileId} as uploaded`);
        } else {
          console.error(`[uploadFileToSupabase] Room not found in localStorage: ${roomId}`);
          throw new Error("Room not found in localStorage");
        }
      } catch (error) {
        console.error(`[uploadFileToSupabase] Error uploading file ${fileId}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Failed to upload file";
        setUploadErrors((prev) => {
          const next = new Map(prev);
          next.set(fileId, errorMessage);
          return next;
        });
        setUploadingFiles((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
        // Show user-friendly error (non-blocking)
        // Don't block the UI - user can continue working
      } finally {
        uploadingFileIdsRef.current.delete(fileId);
      }
    },
    [prepareInitialScene]
  );

  // Auto-save to localStorage with debounce to prevent infinite loops
  const handleChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (elements: readonly any[], appState: any, files: any) => {
      // Don't save if not owner (read-only mode)
      if (!isOwner) {
        return;
      }
      
      // Clean appState before saving - remove runtime-only properties
      const cleanAppState = sanitizeAppState(appState);

      // Create persistable files (without base64 data URLs) for localStorage
      // This prevents localStorage quota issues
      const persistableFiles = makePersistableFiles(files);

      // Log files info for debugging
      if (files && Object.keys(files).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const firstFile = Object.values(files)[0] as any;
        console.log("Files detected:", {
          count: Object.keys(files).length,
          keys: Object.keys(files),
          sampleFile: firstFile ? {
            id: firstFile?.id,
            mimeType: firstFile?.mimeType,
            dataURL: firstFile?.dataURL ? (firstFile.dataURL.startsWith("data:") ? "base64" : "url") : "missing",
          } : null,
        });
      }

      // Create a hash of the current state to avoid saving if nothing changed
      // Include element positions and IDs to detect moves, not just counts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elementsHash = elements.map((el: any) => ({
        id: el.id,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        angle: el.angle,
        type: el.type,
      }));
      
      const currentStateHash = JSON.stringify({
        elements: elementsHash,
        elementsCount: elements.length,
        appStateKeys: Object.keys(cleanAppState).length,
        filesCount: Object.keys(persistableFiles).length,
      });

      // Skip if state hasn't changed
      if (currentStateHash === lastSavedRef.current) {
        return;
      }

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce the save operation to prevent excessive updates
      saveTimeoutRef.current = setTimeout(() => {
        try {
          // Merge persistableFiles with files that are currently being uploaded
          // This ensures files being uploaded aren't lost from localStorage
          const filesToSave = { ...persistableFiles };
          
          // Keep files that are currently being uploaded (even if they have base64)
          // This prevents race conditions where handleChange removes the file
          // before upload completes
          if (files && typeof files === "object") {
            for (const [fileId, file] of Object.entries(files)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fileData = file as any;
              if (
                uploadingFileIdsRef.current.has(fileId) &&
                fileData &&
                fileData.dataURL &&
                typeof fileData.dataURL === "string"
              ) {
                // File is being uploaded - keep it in localStorage temporarily
                // but use persistable version (without base64) if available
                if (!filesToSave[fileId]) {
                  // Create persistable version without base64
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const persistableFile: any = {};
                  for (const [key, value] of Object.entries(fileData)) {
                    if (key !== "dataURL") {
                      persistableFile[key] = value;
                    }
                  }
                  filesToSave[fileId] = persistableFile;
                }
              }
            }
          }

          // Update local room scene immediately (auto-save)
          // Use filesToSave which includes files being uploaded (persistable, without base64)
          updateLocalRoomScene(roomId, {
            elements,
            appState: cleanAppState,
            files: filesToSave,
          });

          // IMPORTANT: Update localRoom state to reflect the latest changes
          // This ensures handlePush will use the most recent scene data
          // Flow: Excalidraw → handleChange → update localStorage → update state → handlePush uses latest
          const updatedLocalRoom = loadLocalRoom(roomId);
          if (updatedLocalRoom) {
            setLocalRoom(updatedLocalRoom);
          }

          // IMPORTANT: Update initialScene with files that have base64 for Excalidraw to display
          // Excalidraw needs base64 data URLs to show images, so we keep them in memory
          // But we save URLs to localStorage to save space
          // This ensures Excalidraw can display images immediately while localStorage stays small
          // Only update if files actually changed to avoid unnecessary re-renders and page refreshes
          if (files && typeof files === "object" && Object.keys(files).length > 0) {
            const sanitizedFiles = sanitizeFiles(files);
            // Check if files actually changed (compare file IDs using ref to avoid dependency issues)
            const currentFileIds = Object.keys(initialSceneFilesRef.current || {}).sort().join(",");
            const newFileIds = Object.keys(sanitizedFiles).sort().join(",");
            
            // Only update if file IDs actually changed (not just because files exist)
            // This prevents unnecessary re-renders that cause page refreshes
            if (currentFileIds !== newFileIds) {
              // Create a scene with files that have base64 (for Excalidraw display)
              const sceneWithBase64: ExcalidrawScene = {
                elements,
                appState: cleanAppState,
                files: sanitizedFiles, // Use sanitized files with base64
              };
              setInitialScene(sceneWithBase64);
              initialSceneFilesRef.current = sanitizedFiles; // Update ref
            }
          } else if (files && typeof files === "object" && Object.keys(files).length === 0) {
            // If files were removed (empty object), update to reflect that
            const currentFileIds = Object.keys(initialSceneFilesRef.current || {}).sort().join(",");
            if (currentFileIds !== "") {
              const sceneWithBase64: ExcalidrawScene = {
                elements,
                appState: cleanAppState,
                files: {}, // No files
              };
              setInitialScene(sceneWithBase64);
              initialSceneFilesRef.current = {}; // Update ref
            }
          }

          lastSavedRef.current = currentStateHash;

          // Update sync status only if it was previously synced (to avoid unnecessary updates)
          setSyncStatus((prev) => {
            if (prev.isInSync === true) {
              return {
                ...prev,
                isInSync: false,
                needsSync: true,
                syncAction: prev.dbExists ? "push" : "sync",
              };
            }
            return prev;
          });

          // Upload files with base64 data URLs to Supabase Storage (async, non-blocking)
          // Excalidraw typically provides base64 data URLs when files are added via drag & drop
          // If we get blob URLs, we convert them to base64 first before uploading
          if (files && typeof files === "object") {
            for (const [fileId, file] of Object.entries(files)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fileData = file as any;
              if (!fileData || !fileData.dataURL || typeof fileData.dataURL !== "string") {
                continue;
              }

              const dataURL = fileData.dataURL;

              // If it's already a base64 data URL, upload directly
              if (dataURL.startsWith("data:")) {
                // Upload asynchronously (don't await - non-blocking)
                uploadFileToSupabase(fileId, fileData, roomId).catch((error) => {
                  console.error(`Failed to upload file ${fileId}:`, error);
                });
              } else if (dataURL.startsWith("blob:")) {
                // Convert blob URL to base64, then upload
                // This handles cases where Excalidraw might provide blob URLs
                ensureBase64DataURL(fileData)
                  .then((base64DataURL) => {
                    if (base64DataURL) {
                      const fileWithBase64 = {
                        ...fileData,
                        dataURL: base64DataURL,
                      };
                      return uploadFileToSupabase(fileId, fileWithBase64, roomId);
                    }
                  })
                  .catch((error) => {
                    console.error(`Failed to convert blob URL to base64 for file ${fileId}:`, error);
                  });
              }
              // If it's already an http/https URL (from Supabase), skip upload (already uploaded)
            }
          }
        } catch (error) {
          console.error("Error saving to localStorage:", error);
          // Check if it's a quota exceeded error
          if (error instanceof DOMException && error.code === 22) {
            console.error("localStorage quota exceeded! Consider uploading files to Supabase.");
          }
        }
      }, 300); // 300ms debounce
    },
    [roomId, isOwner, uploadFileToSupabase]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Push: Upload local data to server
  // IMPORTANT: Always use the latest room data from localStorage to ensure we push the most recent changes
  // Flow: Excalidraw → handleChange → update localStorage → update state → handlePush loads latest → push to server
  const handlePush = async () => {
    if (isSyncing || !localRoom || !isOwner) return; // Only owners can push

    setIsSyncing(true);
    try {
      // Load the latest room data from localStorage to ensure we have the most recent scene
      // This handles edge cases where state might not be updated yet
      const roomForPush = loadLocalRoom(localRoom.id) ?? localRoom;
      
      console.log("[handlePush] Using room data:", {
        fromState: localRoom.id === roomForPush.id,
        stateUpdatedAt: localRoom.updatedAt,
        localStorageUpdatedAt: roomForPush.updatedAt,
        elementsCount: roomForPush.scene.elements?.length || 0,
        filesCount: Object.keys(roomForPush.scene.files || {}).length,
      });

      // Sanitize scene before syncing
      const sceneToSync: ExcalidrawScene = {
        elements: roomForPush.scene.elements || [],
        appState: sanitizeAppState(roomForPush.scene.appState || {}),
        files: sanitizeFiles(roomForPush.scene.files || {}),
      };

      console.log("[handlePush] Pushing room to server:", {
        roomId: localRoom.id,
        filesCount: Object.keys(sceneToSync.files || {}).length,
        fileIds: Object.keys(sceneToSync.files || {}),
        sampleFile: sceneToSync.files && Object.keys(sceneToSync.files).length > 0
          ? (() => {
              const firstFileId = Object.keys(sceneToSync.files)[0];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const firstFile = (sceneToSync.files as any)[firstFileId];
              return {
                fileId: firstFileId,
                hasDataURL: !!firstFile?.dataURL,
                dataURLType: typeof firstFile?.dataURL,
                dataURLPrefix: firstFile?.dataURL?.substring(0, 50),
                isURL: firstFile?.dataURL?.startsWith("http"),
              };
            })()
          : null,
      });

      const response = await authenticatedFetch("/api/rooms/sync", {
        method: "POST",
        body: JSON.stringify({
          id: roomForPush.id,
          title: roomForPush.title,
          description: roomForPush.description,
          scene: sceneToSync,
          updatedAt: roomForPush.updatedAt, // Use latest timestamp from localStorage
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to push room");
      }

      const syncedRoom = await response.json();

      // Sanitize scene from server response before saving
      const sanitizedSyncedScene: ExcalidrawScene = {
        elements: syncedRoom.scene?.elements || [],
        appState: sanitizeAppState(syncedRoom.scene?.appState || {}),
        files: sanitizeFiles(syncedRoom.scene?.files || {}),
      };

      // Update localStorage with synced data
      // Use roomForPush as base to preserve any metadata that might have changed locally
      const updatedRoom: LocalRoom = {
        ...roomForPush,
        scene: sanitizedSyncedScene,
        updatedAt: new Date(syncedRoom.updatedAt).toISOString(),
        lastSyncedAt: syncedRoom.lastSyncedAt
          ? new Date(syncedRoom.lastSyncedAt).toISOString()
          : new Date().toISOString(),
        status: "synced",
      };
      saveLocalRoom(updatedRoom);

      setLocalRoom(updatedRoom);
      
      // Update initialScene to reflect synced data (with URLs converted to base64 for Excalidraw)
      prepareInitialScene(updatedRoom).then((scene) => {
        setInitialScene(scene);
        initialSceneFilesRef.current = scene.files || {}; // Update ref
      });
      
      setSyncStatus({
        status: "synced",
        needsSync: false,
        lastSyncedAt: updatedRoom.lastSyncedAt,
        dbExists: true,
        isInSync: true,
        serverUpdatedAt: new Date(syncedRoom.updatedAt).toISOString(),
        syncAction: null,
      });
      setShowConflictDialog(false);
      setConflictInfo(null);
      
      // Refresh page after successful push
      window.location.reload();
    } catch (error) {
      console.error("Error pushing room:", error);
      alert("ไม่สามารถ push ห้องได้ กรุณาลองอีกครั้ง");
    } finally {
      setIsSyncing(false);
    }
  };

  // Check sync status by comparing with server
  const handleCheckSync = async () => {
    if (isSyncing || !localRoom || !isOwner) return; // Only owners can check sync

    setIsSyncing(true);
    try {
      const response = await authenticatedFetch(`/api/rooms/${roomId}`);

      if (response.status === 404) {
        // Room doesn't exist in DB
        setSyncStatus((prev) => ({
          ...prev,
          dbExists: false,
          needsSync: true,
          isInSync: false,
          serverUpdatedAt: null,
          syncAction: "sync",
        }));
        setIsSyncing(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch room from server");
      }

      const dbRoom = await response.json();
      const dbUpdatedAt = new Date(dbRoom.updatedAt).toISOString();
      const localUpdatedAt = new Date(localRoom.updatedAt).toISOString();

      // Compare timestamps
      if (localUpdatedAt !== dbUpdatedAt) {
        // Conflict detected - show dialog
        setConflictInfo({
          localUpdatedAt,
          serverUpdatedAt: dbUpdatedAt,
        });
        setShowConflictDialog(true);
        setSyncStatus({
          status: localRoom.status,
          needsSync: true,
          lastSyncedAt: localRoom.lastSyncedAt,
          dbExists: true,
          isInSync: false,
          serverUpdatedAt: dbUpdatedAt,
          syncAction: null, // User will choose
        });
      } else {
        // In sync
        setSyncStatus({
          status: localRoom.status,
          needsSync: false,
          lastSyncedAt: localRoom.lastSyncedAt,
          dbExists: true,
          isInSync: true,
          serverUpdatedAt: dbUpdatedAt,
          syncAction: null,
        });
        alert("ข้อมูลตรงกันแล้ว");
      }
    } catch (error) {
      console.error("Error checking sync status:", error);
      alert("ไม่สามารถตรวจสอบสถานะ sync ได้ กรุณาลองอีกครั้ง");
    } finally {
      setIsSyncing(false);
    }
  };

  // Pull: Download data from server to local
  const handlePull = async () => {
    if (isSyncing || !localRoom || !isOwner) return; // Only owners can pull

    setIsSyncing(true);
    try {
      const response = await authenticatedFetch(`/api/rooms/${roomId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch room from server");
      }

      const dbRoom = await response.json();
      const dbUpdatedAt = new Date(dbRoom.updatedAt).toISOString();

      // Sanitize scene data from server before saving
      const sanitizedScene: ExcalidrawScene = {
        elements: dbRoom.scene?.elements || [],
        appState: sanitizeAppState(dbRoom.scene?.appState || {}),
        files: sanitizeFiles(dbRoom.scene?.files || {}),
      };

      // Update local room with server data
      const updatedLocalRoom: LocalRoom = {
        id: dbRoom.id,
        title: dbRoom.title,
        description: dbRoom.description || undefined,
        scene: sanitizedScene,
        createdAt: localRoom?.createdAt || new Date(dbRoom.createdAt).toISOString(),
        updatedAt: dbUpdatedAt,
        lastSyncedAt: dbRoom.lastSyncedAt
          ? new Date(dbRoom.lastSyncedAt).toISOString()
          : new Date().toISOString(),
        status: "synced",
      };

      // Save to localStorage
      saveLocalRoom(updatedLocalRoom);

      setLocalRoom(updatedLocalRoom);
      prepareInitialScene(updatedLocalRoom).then((scene) => {
        setInitialScene(scene);
        initialSceneFilesRef.current = scene.files || {}; // Update ref
      });
      setSyncStatus({
        status: "synced",
        needsSync: false,
        lastSyncedAt: updatedLocalRoom.lastSyncedAt,
        dbExists: true,
        isInSync: true,
        serverUpdatedAt: dbUpdatedAt,
        syncAction: null,
      });
      setShowConflictDialog(false);
      setConflictInfo(null);
      
      // Refresh page after successful pull
      window.location.reload();
    } catch (error) {
      console.error("Error pulling room:", error);
      alert("ไม่สามารถ pull ห้องได้ กรุณาลองอีกครั้ง");
    } finally {
      setIsSyncing(false);
    }
  };

  // AI Generate Diagram
  const handleAIGenerate = async () => {
    if (isGenerating || !localRoom || !isOwner || !aiPrompt.trim()) return;

    setIsGenerating(true);
    setAIError(null);

    try {
      const response = await authenticatedFetch("/api/ai/generate-diagram", {
        method: "POST",
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          roomId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate diagram");
      }

      const data = await response.json();
      const newElements = data.elements || [];

      if (!Array.isArray(newElements) || newElements.length === 0) {
        throw new Error("No elements generated");
      }

      // Merge new elements with existing ones
      const currentElements = localRoom.scene.elements || [];
      const mergedElements = [...currentElements, ...newElements];

      // Save to localStorage
      const updatedScene: ExcalidrawScene = {
        ...localRoom.scene,
        elements: mergedElements,
      };
      updateLocalRoomScene(roomId, updatedScene);

      // Close modal and reset prompt
      setShowAIModal(false);
      setAIPrompt("");
      
      // Show success message
      alert(`สร้างไดอะแกรมสำเร็จ! เพิ่ม ${newElements.length} elements`);

      // Refresh page to avoid infinite loop
      // This is the safest way to prevent React update depth issues
      // The page will reload with the new elements from localStorage
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (error: unknown) {
      console.error("Error generating diagram:", error);
      const errorMessage = error instanceof Error ? error.message : "ไม่สามารถสร้างไดอะแกรมได้ กรุณาลองอีกครั้ง";
      setAIError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };


  if (!isClient || !localRoom || !initialScene) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 overflow-hidden flex flex-col shadow-lg`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              ห้องวาดภาพ
            </h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              aria-label="ปิด sidebar"
            >
              <svg
                className="w-5 h-5 text-gray-600 dark:text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Room Name */}
          {localRoom && (
            <div className="mb-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                ชื่อห้อง
              </div>
              <div className="text-base font-medium text-gray-800 dark:text-white truncate">
                {localRoom.title}
              </div>
              {!isOwner && (
                <div className="mt-2 px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs rounded">
                  โหมดอ่านอย่างเดียว (Read Only)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* Sync Status - Only show for owners */}
          {isOwner && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                สถานะ Sync
              </div>
              <div className="space-y-2">
                {syncStatus.status === "local-only" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-600 dark:text-yellow-400 text-lg">
                      ⚠️
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Local only
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400 text-lg">
                      ✅
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Synced
                    </span>
                  </div>
                )}
                
                {/* Sync Comparison Status */}
                {syncStatus.dbExists && syncStatus.isInSync !== null && (
                  <div className="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700">
                    {syncStatus.isInSync ? (
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 dark:text-green-400 text-sm">
                          ✓
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                          Local กับ Server เท่ากัน
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-600 dark:text-yellow-400 text-sm">
                            ⚠
                          </span>
                          <span className="text-xs text-gray-600 dark:text-gray-300">
                            Local กับ Server ต่างกัน
                          </span>
                        </div>
                        {syncStatus.serverUpdatedAt && localRoom && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 pl-4">
                            <div>Local: {new Date(localRoom.updatedAt).toLocaleString("th-TH", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}</div>
                            <div>Server: {new Date(syncStatus.serverUpdatedAt).toLocaleString("th-TH", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {syncStatus.lastSyncedAt && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Sync ล่าสุด:{" "}
                    {new Date(syncStatus.lastSyncedAt).toLocaleString("th-TH", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
                
                {/* Check Sync Button */}
                <button
                  onClick={handleCheckSync}
                  disabled={isSyncing}
                  className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors text-sm mt-2"
                >
                  {isSyncing ? "กำลังตรวจสอบ..." : "ตรวจสอบ Sync"}
                </button>

                {/* Sync/Pull/Push Buttons */}
                {syncStatus.syncAction === "sync" && syncStatus.dbExists !== null && (
                  <button
                    onClick={handlePush}
                    disabled={isSyncing}
                    className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium rounded-lg transition-colors text-sm mt-2"
                  >
                    {isSyncing ? "กำลัง sync..." : "Sync (สร้างใหม่)"}
                  </button>
                )}
                {syncStatus.syncAction === "pull" && (
                  <button
                    onClick={handlePull}
                    disabled={isSyncing}
                    className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-medium rounded-lg transition-colors text-sm mt-2"
                  >
                    {isSyncing ? "กำลัง pull..." : "Pull (ดึงจาก Server)"}
                  </button>
                )}
                {syncStatus.syncAction === "push" && (
                  <button
                    onClick={handlePush}
                    disabled={isSyncing}
                    className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg transition-colors text-sm mt-2"
                  >
                    {isSyncing ? "กำลัง push..." : "Push (อัปโหลดขึ้น Server)"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Auto-save Status - Only show for owners */}
          {isOwner && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                สถานะการบันทึก
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400 text-lg">
                  ✅
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  บันทึกอัตโนมัติลง LocalStorage
                </span>
              </div>
            </div>
          )}

          {/* File Upload Status - Only show for owners */}
          {isOwner && (uploadingFiles.size > 0 || uploadErrors.size > 0 || uploadedFiles.size > 0) && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                สถานะการอัพโหลดไฟล์
              </div>
              <div className="space-y-2">
                {uploadingFiles.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600 dark:text-blue-400 text-sm">
                      ⏳
                    </span>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      กำลังอัพโหลด {uploadingFiles.size} ไฟล์...
                    </span>
                  </div>
                )}
                {uploadedFiles.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400 text-sm">
                      ✅
                    </span>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      อัพโหลดสำเร็จ {uploadedFiles.size} ไฟล์
                    </span>
                  </div>
                )}
                {uploadErrors.size > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-red-600 dark:text-red-400 text-sm">
                        ❌
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        อัพโหลดล้มเหลว {uploadErrors.size} ไฟล์
                      </span>
                    </div>
                    {Array.from(uploadErrors.entries()).slice(0, 3).map(([fileId, error]) => (
                      <div key={fileId} className="text-xs text-red-600 dark:text-red-400 pl-4 truncate" title={error}>
                        {fileId.substring(0, 8)}...: {error.substring(0, 30)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Last Updated Time */}
          {localRoom && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                อัปเดตล่าสุด
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {new Date(localRoom.updatedAt).toLocaleString("th-TH", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          )}

          {/* AI Generate Button - Only show for owners */}
          {isOwner && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowAIModal(true)}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                AI Generate Diagram
              </button>
            </div>
          )}

          {/* Back Button */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <Link
              href="/"
              className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              กลับไปหน้าหลัก
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Toggle Sidebar Button */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-10 p-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shadow-md transition-colors"
            aria-label="เปิด sidebar"
          >
            <svg
              className="w-5 h-5 text-gray-600 dark:text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}

        {/* Excalidraw Canvas */}
        <div className="flex-1 relative w-full h-full overflow-hidden">
          {isClient && initialScene && (
            <Excalidraw
              key={`excalidraw-${roomId}`}
              onChange={handleChange}
              initialData={initialScene}
              viewModeEnabled={!isOwner}
              UIOptions={{
                canvasActions: {
                  // Disable File System Access API features to prevent FileSystemFileHandle errors
                  // We use our own room-based save/load system instead
                  saveToActiveFile: false,
                  loadScene: false,
                  // Keep export enabled for owners (doesn't use File System Access API)
                  ...(isOwner ? {} : { export: false }),
                },
              }}
            />
          )}
        </div>
      </div>

      {/* Conflict Dialog */}
      {showConflictDialog && conflictInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              พบว่าข้อมูลในเครื่องไม่ตรงกับข้อมูลในฐานข้อมูล
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              คุณต้องการใช้ข้อมูลจากที่ไหน?
            </p>
            {conflictInfo && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 space-y-1">
                <div>
                  Local: {new Date(conflictInfo.localUpdatedAt).toLocaleString("th-TH", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div>
                  Server: {new Date(conflictInfo.serverUpdatedAt).toLocaleString("th-TH", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handlePush}
                disabled={isSyncing}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {isSyncing ? "กำลังบันทึก..." : "ใช้ข้อมูลในเครื่อง (บันทึกขึ้นฐานข้อมูล)"}
              </button>
              <button
                onClick={handlePull}
                disabled={isSyncing}
                className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {isSyncing ? "กำลังดึง..." : "ใช้ข้อมูลจากฐานข้อมูล (ทับข้อมูลในเครื่อง)"}
              </button>
            </div>
            <button
              onClick={() => {
                setShowConflictDialog(false);
                setConflictInfo(null);
              }}
              disabled={isSyncing}
              className="w-full mt-3 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-medium rounded-lg transition-colors text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* AI Generate Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              AI Generate Diagram
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              อธิบายไดอะแกรมที่คุณต้องการสร้าง:
            </p>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAIPrompt(e.target.value)}
              placeholder="เช่น: สร้าง flowchart สำหรับ login process มี 3 ขั้นตอน Start, Login, Success"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white text-sm"
              rows={4}
              disabled={isGenerating}
            />
            {aiError && (
              <div className="mt-3 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">
                {aiError}
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleAIGenerate}
                disabled={isGenerating || !aiPrompt.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    กำลังสร้าง...
                  </span>
                ) : (
                  "สร้างไดอะแกรม"
                )}
              </button>
              <button
                onClick={() => {
                  setShowAIModal(false);
                  setAIPrompt("");
                  setAIError(null);
                }}
                disabled={isGenerating}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-medium rounded-lg transition-colors text-sm"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
