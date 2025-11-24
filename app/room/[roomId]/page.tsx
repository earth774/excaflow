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
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sanitizeAppState = (appState: any = {}) => {
  const cleanAppState = { ...appState };
  delete cleanAppState.collaborators;
  delete cleanAppState.socketId;
  return cleanAppState;
};

// Sanitize files to ensure dataURLs are valid (base64 strings or URLs)
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    ),
  }
);

import { STRIPE_PRICE_ID } from "@/lib/stripeConfig";

// ... existing imports

const LockIcon = ({ className }: { className?: string }) => (
  <svg 
    className={className} 
    fill="none" 
    stroke="currentColor" 
    viewBox="0 0 24 24" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth={2} 
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
    />
  </svg>
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
  const [initialScene, setInitialScene] = useState<ExcalidrawScene | null>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{
    localUpdatedAt: string;
    serverUpdatedAt: string;
  } | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isSubscriptionActive, setIsSubscriptionActive] = useState<boolean>(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAIPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Map<string, string>>(new Map());
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  const handleCheckout = async () => {
    try {
      const response = await authenticatedFetch("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ priceId: STRIPE_PRICE_ID }),
      });

      const { url, error } = await response.json();

      if (error) {
        alert("Checkout failed: " + error);
        return;
      }

      if (url) {
        window.location.href = url;
      } else {
        alert("Failed to start checkout.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("An unexpected error occurred.");
    }
  };

  const handleLockedFeature = (action: () => void) => {
    if (!isSubscriptionActive) {
      if (confirm("Your subscription has expired. Please upgrade to continue using this feature.")) {
        handleCheckout();
      }
      return;
    }
    action();
  };
  
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filesWithBase64: any = {};
      for (const [fileId, file] of Object.entries(filesBeforeSanitize)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileData = file as any;
        if (!fileData || typeof fileData !== "object") {
          continue;
        }
        
        // If file has URL (http/https/blob) but not base64, convert URL to base64
        if (fileData.dataURL && typeof fileData.dataURL === "string") {
          const dataURL = String(fileData.dataURL);
          
          // If it's already a base64 data URL, use it as-is
          if (dataURL.startsWith("data:")) {
            filesWithBase64[fileId] = fileData;
            continue;
          }
        }
        
        // Check if we have a supabaseUrl but no valid dataURL (or dataURL is just the supabaseUrl)
        // This happens when we optimized localStorage by stripping the base64 data
        const urlToFetch = fileData.supabaseUrl || (typeof fileData.dataURL === "string" && !fileData.dataURL.startsWith("data:") ? fileData.dataURL : null);
        
        if (urlToFetch) {
           // Use the URL to fetch and restore base64
           const dataURL = urlToFetch;
           
           // Logic below handles fetching from URL

          if (
            dataURL.startsWith("http://") ||
            dataURL.startsWith("https://") ||
            dataURL.startsWith("blob:")
          ) {
            try {
              // Create a temp object with dataURL set to the URL we want to fetch
              const tempFile = { ...fileData, dataURL: urlToFetch };
              const base64DataURL = await ensureBase64DataURL(tempFile);
              
              if (base64DataURL) {
                // Use base64 for display, keep URL for reference
                filesWithBase64[fileId] = {
                  ...fileData,
                  dataURL: base64DataURL,
                  supabaseUrl: fileData.supabaseUrl || dataURL,
                };
                continue;
              } else {
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
          setIsSubscriptionActive(dbRoom.isSubscriptionActive === true);
          
          // Check localStorage for draft (only if owner)
          // Await the async loadLocalRoom call
          const localDraft = dbRoom.isOwner ? await loadLocalRoom(roomId) : null;
          
          if (localDraft) {
            const localUpdatedAt = new Date(localDraft.updatedAt).toISOString();
            
            // Compare timestamps
            if (localUpdatedAt !== dbUpdatedAt) {
              // Conflict detected
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
              const dbFiles = sanitizeFiles(dbRoom.scene?.files || {});
              const localFiles = localDraft?.scene?.files || {};
              
              const mergedFiles = {
                ...dbFiles,
                ...localFiles, // Local files override DB files (they're more recent)
              };
              
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
              await saveLocalRoom(roomToUse);
              
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
            
            await saveLocalRoom(roomToUse);
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
          const localDraft = await loadLocalRoom(roomId);
          
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
        const localDraft = await loadLocalRoom(roomId);
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
  const uploadFileToSupabase = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (fileId: string, file: any, roomId: string) => {
      // Skip if already uploaded or currently uploading
      if (
        uploadedFileIdsRef.current.has(fileId) ||
        uploadingFileIdsRef.current.has(fileId)
      ) {
        return;
      }

      // Skip if not a base64 data URL
      if (
        !file.dataURL ||
        typeof file.dataURL !== "string" ||
        !file.dataURL.startsWith("data:")
      ) {
        return;
      }

      // Skip if no mimeType
      if (!file.mimeType) {
        return;
      }

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
          throw new Error(errorMessage);
        }

        const { url } = await response.json();

        // Update local room scene with Supabase URL converted to base64
        const currentRoom = await loadLocalRoom(roomId);
        if (currentRoom) {
          
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
            } else {
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

          await updateLocalRoomScene(roomId, {
            ...currentRoom.scene,
            files: updatedFiles,
          });

          // Verify the update
          const updatedRoom = await loadLocalRoom(roomId);
          if (updatedRoom && updatedRoom.scene.files?.[fileId]) {
            // Update localRoom state and initialScene to reflect the change
            setLocalRoom(updatedRoom);
            prepareInitialScene(updatedRoom).then((newScene) => {
              setInitialScene(newScene);
              initialSceneFilesRef.current = newScene.files || {};
            });
          }
        }

        uploadedFileIdsRef.current.add(fileId);
        setUploadedFiles((prev) => new Set(prev).add(fileId));
      } catch (error) {
        console.error(`[uploadFileToSupabase] Error uploading ${fileId}:`, error);
        
        // Show alert to user
        if (error instanceof Error) {
          alert(error.message);
        }
        
        setUploadErrors((prev) => {
          const next = new Map(prev);
          next.set(fileId, error instanceof Error ? error.message : "Unknown error");
          return next;
        });
      } finally {
        uploadingFileIdsRef.current.delete(fileId);
        setUploadingFiles((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      }
    },
    []
  );

  // Handle Excalidraw changes
  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      if (!localRoom) return;

      // Check for large files (> 2MB)
      if (files) {
        let hasLargeFile = false;
        const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
        
        for (const [fileId, file] of Object.entries(files)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fileData = file as any;
          
          // Check if file is new (not uploaded) and large
          // We check dataURL length as a proxy. Base64 is ~1.33x larger than binary.
          // So 2MB binary ~= 2.66MB base64.
          // Let's be safe and check if base64 length > 2MB * 1.37 (approx 2.74MB)
          // Or just check estimated size
          
          if (
            fileData.dataURL && 
            fileData.dataURL.startsWith("data:") && 
            !uploadedFileIdsRef.current.has(fileId)
          ) {
            const base64Data = fileData.dataURL.split(",")[1];
            if (base64Data) {
              const estimatedSize = (base64Data.length * 3) / 4;
              
              if (estimatedSize > MAX_FILE_SIZE) {
                hasLargeFile = true;
                console.warn(`[handleChange] File ${fileId} is too large: ${(estimatedSize / 1024 / 1024).toFixed(2)}MB`);
                
                // Alert user
                alert(`File too large (${(estimatedSize / 1024 / 1024).toFixed(2)}MB). Please upload files smaller than 2MB`);
                
                // Remove file and associated elements
                if (excalidrawAPI) {
                  const newFiles = { ...files };
                  delete newFiles[fileId];
                  
                  const newElements = elements.filter((el) => el.fileId !== fileId);
                  
                  excalidrawAPI.updateScene({
                    elements: newElements,
                    files: newFiles,
                  });
                  
                  // Return early to avoid saving this state
                  return;
                }
              }
            }
          }
        }
      }

      // Debounce save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        // Check if content actually changed
        const currentContent = JSON.stringify({ elements, appState, files });
        if (currentContent === lastSavedRef.current) {
          return;
        }
        lastSavedRef.current = currentContent;

        // Check for new files to upload
        if (files && isOwner) {
          for (const [fileId, file] of Object.entries(files)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fileData = file as any;
            
            // If file has dataURL (base64) and not yet uploaded, upload it
            if (
              fileData.dataURL && 
              fileData.dataURL.startsWith("data:") && 
              !uploadedFileIdsRef.current.has(fileId) &&
              !uploadingFileIdsRef.current.has(fileId)
            ) {
              // Only upload to Supabase if subscription is active (Pro feature)
              if (isSubscriptionActive) {
                // Upload in background
                uploadFileToSupabase(fileId, fileData, roomId);
              } else {
                // For free users, we just keep it in localStorage (which happens automatically via saveLocalRoom)
                // We mark it as "uploaded" to prevent repeated checks, but it's really just "processed"
                uploadedFileIdsRef.current.add(fileId);
              }
            }
          }
        }

        const updatedRoom: LocalRoom = {
          ...localRoom,
          scene: {
            elements: [...elements],
            appState: sanitizeAppState(appState),
            files: sanitizeFiles(files),
          },
          updatedAt: new Date().toISOString(),
          // If previously synced, mark as local-only after update
          status: localRoom.status === "synced" ? "local-only" : localRoom.status,
        };

        console.log("handleChange: Saving room:", roomId, {
          elementsCount: elements.length,
          hasAppState: !!appState,
          hasFiles: !!files,
        });

        await saveLocalRoom(updatedRoom);
        setLocalRoom(updatedRoom);
        
        // If room is synced, update sync status to show it needs sync
        if (syncStatus.status === "synced" || syncStatus.dbExists) {
          setSyncStatus((prev) => ({
            ...prev,
            needsSync: true,
            isInSync: false,
          }));
        }
      }, 500); // 500ms debounce
    },
    [localRoom, roomId, syncStatus.status, syncStatus.dbExists, isOwner, uploadFileToSupabase, excalidrawAPI, isSubscriptionActive]
  );

  // Sync: Push local to server
  const handlePush = async () => {
    if (isSyncing || !localRoom || !isOwner) return;

    setIsSyncing(true);
    try {
      // Prepare data for server
      // We need to ensure files are handled correctly
      // 1. Files with supabaseUrl should use that URL
      // 2. Files with base64 dataURL should have been uploaded already, but if not, we might need to upload them
      // For now, we assume background upload handles most cases.
      // The server expects 'files' object where dataURL can be a URL string
      
      const sceneToSave = {
        ...localRoom.scene,
        files: sanitizeFiles(localRoom.scene.files),
      };

      const response = await authenticatedFetch(`/api/rooms/${roomId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: localRoom.title,
          description: localRoom.description,
          scene: sceneToSave,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to sync room");
      }

      const updatedDbRoom = await response.json();
      const newUpdatedAt = new Date(updatedDbRoom.updatedAt).toISOString();

      // Update local room
      const updatedLocalRoom: LocalRoom = {
        ...localRoom,
        updatedAt: newUpdatedAt,
        lastSyncedAt: newUpdatedAt,
        status: "synced",
      };

      saveLocalRoom(updatedLocalRoom);
      setLocalRoom(updatedLocalRoom);
      setSyncStatus({
        status: "synced",
        needsSync: false,
        lastSyncedAt: newUpdatedAt,
        dbExists: true,
        isInSync: true,
        serverUpdatedAt: newUpdatedAt,
        syncAction: null,
      });
      setShowConflictDialog(false);
      setConflictInfo(null);
      
    } catch (error) {
      console.error("Error syncing room:", error);
      alert("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองอีกครั้ง");
    } finally {
      setIsSyncing(false);
    }
  };

  // Check Sync Status
  const handleCheckSync = async () => {
    if (isSyncing || !localRoom || !isOwner) return;

    setIsSyncing(true);
    try {
      const response = await authenticatedFetch(`/api/rooms/${roomId}`);

      if (response.status === 404) {
        setSyncStatus((prev) => ({
          ...prev,
          dbExists: false,
          syncAction: "sync",
          isInSync: null,
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
        // Instead of showing dialog immediately, just update status
        // User can choose action from popover
        setSyncStatus({
          status: localRoom.status,
          needsSync: true,
          lastSyncedAt: localRoom.lastSyncedAt,
          dbExists: true,
          isInSync: false,
          serverUpdatedAt: dbUpdatedAt,
          syncAction: null, 
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
      }
    } catch (error) {
      console.error("Error checking sync status:", error);
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
      
      // Check if we need to convert Mermaid to Excalidraw on client-side
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let newElements: any[] = [];
      
      if (data.convertOnClient && data.mermaid) {
        console.log("Converting Mermaid to Excalidraw on client...");
        console.log("Mermaid syntax to convert:", data.mermaid);
        console.log("Node labels from API:", data.nodeLabels);
        console.log("Has labels:", data.hasLabels);
        
        // Use nodeLabels from API if available, otherwise parse from Mermaid
        const nodeLabels: Record<string, string> = data.nodeLabels || {};
        
        // If API didn't provide labels, try to parse them ourselves as fallback
        if (Object.keys(nodeLabels).length === 0) {
          console.warn("No nodeLabels from API, parsing from Mermaid syntax...");
          const labelRegex = /(\w+)\s*(?:\[|\["|\(|\(\["|\{)(.*?)(?:\]|"\]|\)|"\)\]|\})/g;
          const lines = data.mermaid.split('\n');
          
          lines.forEach((line: string) => {
            const matches = Array.from(line.matchAll(labelRegex));
            matches.forEach((match) => {
              if (match[1] && match[2]) {
                const label = match[2].replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();
                if (label.length > 0) {
                  nodeLabels[match[1]] = label;
                }
              }
            });
          });
        }
        
        console.log("Final nodeLabels to use:", nodeLabels);
        
        try {
          // Log the mermaid syntax for debugging
          console.log("Attempting to parse Mermaid syntax:", data.mermaid.substring(0, 500));
          
          const { elements } = await parseMermaidToExcalidraw(data.mermaid, {
            flowchart: {
              htmlLabels: false,
            },
            themeVariables: {
              fontSize: "20px",
            }
          } as any);
          newElements = elements || [];
          
          console.log(`Parsed ${newElements.length} elements from Mermaid`);

          // Helper to create text element
          const createTextElement = (text: string, container: any) => {
            const fontSize = 20;
            // Estimate width/height (rough approximation)
            const textLines = text.split('\n');
            const maxLineLength = Math.max(...textLines.map(l => l.length));
            const width = Math.max(maxLineLength * (fontSize * 0.6), 40); // Minimum width 40
            const height = Math.max(textLines.length * fontSize * 1.2, fontSize * 1.2); // Minimum height
            
            return {
              type: "text",
              version: 1,
              versionNonce: Math.floor(Math.random() * 1000000),
              isDeleted: false,
              id: `text_${container.id}_${Date.now()}`,
              fillStyle: "hachure",
              strokeWidth: 1,
              strokeStyle: "solid",
              roughness: 1,
              opacity: 100,
              angle: 0,
              x: container.x + (container.width - width) / 2,
              y: container.y + (container.height - height) / 2,
              strokeColor: "#000000",
              backgroundColor: "transparent",
              width: width,
              height: height,
              seed: Math.floor(Math.random() * 1000000),
              groupIds: container.groupIds || [],
              frameId: null,
              roundness: null,
              boundElements: [],
              updated: Date.now(),
              link: null,
              locked: false,
              text: text,
              fontSize: fontSize,
              fontFamily: 1,
              textAlign: "center",
              verticalAlign: "middle",
              containerId: container.id,
              originalText: text,
            };
          };

          // Inject text if missing
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const finalElements: any[] = [...newElements];
          
          // Collect all shape elements (rectangles, diamonds, ellipses) that need labels
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const shapeElements: any[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          newElements.forEach((el: any) => {
            if (["rectangle", "diamond", "ellipse"].includes(el.type)) {
              shapeElements.push(el);
            }
          });
          
          console.log(`Found ${shapeElements.length} shape elements to check for labels`);
          
          // Track which labels we've used
          const usedLabels = new Set<string>();
          
          // Strategy 1: Check if shape already has text element bound to it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          shapeElements.forEach((el: any, index: number) => {
            // Check if this shape already has a bound text element
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const hasText = newElements.some((t: any) => 
              t.type === "text" && (t.containerId === el.id || el.boundElements?.some((be: any) => be.id === t.id))
            );
            
            if (!hasText) {
              let labelText: string | null = null;
              
              // Strategy 2: Check if el.text property exists (some converters put it there)
              if (el.text && typeof el.text === "string" && el.text.trim().length > 0) {
                labelText = el.text.trim();
                console.log(`Found text in shape property for ${el.id}: ${labelText}`);
              } 
              // Strategy 3: Try to match by order (shapes usually match node order in Mermaid)
              else if (Object.keys(nodeLabels).length > 0) {
                // Get node IDs in order from Mermaid syntax
                const nodeIds = Object.keys(nodeLabels);
                if (index < nodeIds.length) {
                  const nodeId = nodeIds[index];
                  if (!usedLabels.has(nodeId)) {
                    labelText = nodeLabels[nodeId];
                    usedLabels.add(nodeId);
                    console.log(`Matched label by order for ${el.id}: ${labelText} (from node ${nodeId})`);
                  }
                }
              }
              
              // Strategy 4: Try to find any unused label
              if (!labelText && Object.keys(nodeLabels).length > 0) {
                for (const [nodeId, label] of Object.entries(nodeLabels)) {
                  if (!usedLabels.has(nodeId)) {
                    labelText = label;
                    usedLabels.add(nodeId);
                    console.log(`Assigned unused label to ${el.id}: ${labelText} (from node ${nodeId})`);
                    break;
                  }
                }
              }
              
              // Create text element if we found a label
              if (labelText && labelText.trim().length > 0) {
                const textEl = createTextElement(labelText, el);
                finalElements.push(textEl);
                
                // Bind text to container
                if (!el.boundElements) el.boundElements = [];
                el.boundElements.push({ id: textEl.id, type: "text" });
                
                // Also update the element in finalElements array
                const elIndex = finalElements.findIndex((e: any) => e.id === el.id);
                if (elIndex >= 0) {
                  finalElements[elIndex] = { ...el, boundElements: el.boundElements };
                }
              } else {
                console.warn(`No label found for shape ${el.id} at index ${index}`);
              }
            } else {
              console.log(`Shape ${el.id} already has text element`);
            }
          });
          
          newElements = finalElements;
          
          // Count text elements
          const textCount = newElements.filter((el: any) => el.type === "text").length;
          const shapeCount = newElements.filter((el: any) => ["rectangle", "diamond", "ellipse"].includes(el.type)).length;
          
          console.log(`Final element count: ${newElements.length} (${shapeCount} shapes, ${textCount} text elements)`);
          
          // Warn if we have shapes but no text
          if (shapeCount > 0 && textCount === 0 && !data.hasLabels) {
            console.warn("No text elements found and API indicates no labels. Diagram may appear empty.");
            throw new Error("AI สร้างโครงไดอะแกรมได้แต่ไม่มีข้อความในกล่อง กรุณาลองพิมพ์ prompt ให้ละเอียดขึ้น เช่น 'สร้าง flowchart สำหรับระบบ login ที่มีขั้นตอน: เริ่มต้น, กรอกอีเมล, ตรวจสอบรหัสผ่าน, สำเร็จ'");
          }
          
        } catch (conversionError) {
          console.error("Error converting Mermaid to Excalidraw:", conversionError);
          console.error("Mermaid syntax that failed:", data.mermaid);
          
          // Check if it's a parse error
          const errorMessage = conversionError instanceof Error ? conversionError.message : String(conversionError);
          
          if (errorMessage.includes("Parse error") || errorMessage.includes("Expecting")) {
            // Mermaid syntax parse error - provide helpful message
            throw new Error(
              "Mermaid syntax ที่ AI สร้างมีข้อผิดพลาด กรุณาลองอีกครั้งหรือปรับ prompt ให้ชัดเจนขึ้น " +
              "(เช่น 'สร้าง flowchart สำหรับระบบ login ที่มีขั้นตอน: เริ่มต้น, กรอกอีเมล, ตรวจสอบรหัสผ่าน, สำเร็จ')"
            );
          }
          
          // Other errors
          throw new Error(
            errorMessage || "ไม่สามารถแปลงไดอะแกรมได้ กรุณาลองอีกครั้ง"
          );
        }
      } else {
        // Fallback to direct elements (old behavior)
        newElements = data.elements || [];
      }

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
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
          <div className="text-gray-500 dark:text-gray-400">กำลังโหลดห้องวาดภาพ...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-64" : "w-0"} flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 overflow-hidden flex flex-col relative z-20`}>
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <Link href="/dashboard" className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="font-bold text-gray-800 dark:text-white truncate">
              {localRoom.title}
            </h1>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Room Info */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Room Info</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  syncStatus.status === "synced" && syncStatus.isInSync !== false
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                }`}>
                  {syncStatus.status === "synced" && syncStatus.isInSync !== false ? "Synced" : "Unsaved"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Last Updated</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs">
                  {new Date(localRoom.updatedAt).toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {!isOwner && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-xs p-2 rounded-lg">
                  You are in read-only mode
                </div>
              )}
            </div>
          </div>

          {/* Share */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Share</div>
            <button
              onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                    .then(() => alert("Link copied to clipboard"))
                    .catch(() => alert("Failed to copy link"));
              }}
              className="w-full flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors"
            >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              <span>Copy Link</span>
            </button>
          </div>

          {/* Actions */}
          {isOwner && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actions</div>
              <div className="space-y-2">
                <button
                  onClick={() => handleLockedFeature(handlePush)}
                  disabled={isSyncing}
                  className={`w-full flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors ${
                    !isSubscriptionActive ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {!isSubscriptionActive ? (
                    <LockIcon className="w-4 h-4 text-gray-400" />
                  ) : (
                    <div className={`w-2 h-2 rounded-full ${isSyncing ? "bg-gray-400 animate-pulse" : "bg-blue-500"}`} />
                  )}
                  <span>{isSyncing ? "Saving..." : "Save to Server (Push)"}</span>
                  {!isSubscriptionActive && <span className="ml-auto text-xs text-amber-500 font-medium">PRO</span>}
                </button>
                
                <button
                  onClick={() => handleLockedFeature(handleCheckSync)}
                  disabled={isSyncing}
                  className={`w-full flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors ${
                    !isSubscriptionActive ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {!isSubscriptionActive ? (
                    <LockIcon className="w-4 h-4 text-gray-400" />
                  ) : (
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  <span>Check Sync Status</span>
                  {!isSubscriptionActive && <span className="ml-auto text-xs text-amber-500 font-medium">PRO</span>}
                </button>

                {syncStatus.dbExists && (
                  <button
                    onClick={() => handleLockedFeature(handlePull)}
                    disabled={isSyncing}
                    className={`w-full flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors ${
                      !isSubscriptionActive ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  >
                    {!isSubscriptionActive ? (
                      <LockIcon className="w-4 h-4 text-gray-400" />
                    ) : (
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                    )}
                    <span>Pull from Server</span>
                    {!isSubscriptionActive && <span className="ml-auto text-xs text-amber-500 font-medium">PRO</span>}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* File Upload Status */}
          {isOwner && (uploadingFiles.size > 0 || uploadErrors.size > 0) && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Uploads</div>
              <div className="space-y-2">
                {uploadingFiles.size > 0 && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Uploading {uploadingFiles.size} file{uploadingFiles.size > 1 ? 's' : ''}...
                  </div>
                )}
                {Array.from(uploadErrors.entries()).map(([fileId, error]) => (
                  <div key={fileId} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-2 truncate" title={error}>
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="truncate">{error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Sidebar Footer */}
        {isOwner && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={() => handleLockedFeature(() => setShowAIModal(true))}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-violet-500/20 ${
                !isSubscriptionActive ? "opacity-60 cursor-not-allowed grayscale" : ""
              }`}
            >
              {!isSubscriptionActive ? (
                <LockIcon className="w-4 h-4" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              <span>AI Generate</span>
              {!isSubscriptionActive && <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded text-white">PRO</span>}
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 relative h-full overflow-hidden">
        
        {/* Toggle Sidebar Button (Visible when sidebar closed) */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-10 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Excalidraw Canvas */}
        <div className="absolute inset-0 z-0">
          {isClient && initialScene && (
            <Excalidraw
              key={`excalidraw-${roomId}`}
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              onChange={handleChange}
              initialData={initialScene}
              viewModeEnabled={!isOwner}
              UIOptions={{
                canvasActions: {
                  saveToActiveFile: false,
                  loadScene: false,
                  ...(isOwner ? {} : { export: false }),
                },
              }}
            />
          )}
        </div>
      </div>

      {/* Conflict Dialog */}
      {showConflictDialog && conflictInfo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-amber-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Conflict Detected
              </h3>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Your local data doesn't match the server data. Which version would you like to use?
            </p>

            <div className="space-y-3">
              <button
                onClick={handlePush}
                disabled={isSyncing}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl transition-all group"
              >
                <div className="text-left">
                  <div className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Use Local Data</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Updated: {new Date(conflictInfo.localUpdatedAt).toLocaleString("en-US")}
                  </div>
                </div>
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 group-hover:border-blue-500" />
              </button>

              <button
                onClick={handlePull}
                disabled={isSyncing}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl transition-all group"
              >
                <div className="text-left">
                  <div className="font-semibold text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Use Server Data</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Updated: {new Date(conflictInfo.serverUpdatedAt).toLocaleString("en-US")}
                  </div>
                </div>
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 group-hover:border-green-500" />
              </button>
            </div>

            <button
              onClick={() => {
                setShowConflictDialog(false);
                setConflictInfo(null);
              }}
              className="w-full mt-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              Cancel and Decide Later
            </button>
          </div>
        </div>
      )}

      {/* AI Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                AI Generate Diagram
              </h3>
              <button 
                onClick={() => {
                  setShowAIModal(false);
                  setAIPrompt("");
                  setAIError(null);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Describe the diagram you want
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAIPrompt(e.target.value)}
                placeholder="e.g., Create a flowchart for Login system with 3 steps: Start, Login Form, Success..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-white text-sm transition-all resize-none"
                rows={4}
                disabled={isGenerating}
              />
            </div>

            {aiError && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {aiError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleAIGenerate}
                disabled={isGenerating || !aiPrompt.trim()}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Generate Diagram</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
