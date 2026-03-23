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
        // No dataURL - check if we have supabaseUrl (from optimized local storage)
        if (sanitizedFile.supabaseUrl && typeof sanitizedFile.supabaseUrl === "string") {
          // Use supabaseUrl as dataURL so it passes validation and is saved to DB
          sanitizedFile.dataURL = sanitizedFile.supabaseUrl;
          hasValidDataURL = true;
        } else {
          // No dataURL and no supabaseUrl - skip this file
          console.warn(`File ${fileId} has no dataURL, skipping file`);
        }
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
      </div>
    ),
  }
);

import { STRIPE_PRICE_ID } from "@/lib/stripeConfig";

/** Max prompt length — must match app/api/ai/generate-diagram/route.ts */
const AI_PROMPT_MAX = 1000;

const AI_EXAMPLE_PROMPTS = [
  "Flowchart ระบบ login: เริ่มต้น → กรอกอีเมล → ตรวจสอบรหัส → สำเร็จ / ล้มเหลว",
  "Sequence diagram: User, Next.js API, Database สำหรับการสั่งซื้อสินค้า",
  "State diagram สถานะคำสั่งซื้อ: รอชำระ, กำลังจัดส่ง, สำเร็จ, ยกเลิก",
] as const;

function aiFlashStorageKey(roomId: string) {
  return `roomAiDiagramFlash_${roomId}`;
}

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

export default function RoomClient() {
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
  const [aiMergeMode, setAiMergeMode] = useState<"append" | "replace">("append");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [aiSuccessBanner, setAiSuccessBanner] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Map<string, string>>(new Map());
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyList, setHistoryList] = useState<{ id: string; createdAt: string }[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
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
              // Fallback: Use the URL as dataURL so Excalidraw can try to load it directly
              filesWithBase64[fileId] = {
                ...fileData,
                dataURL: urlToFetch,
              };
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
        (fileData.supabaseUrl || 
        (fileData.dataURL &&
        typeof fileData.dataURL === "string" &&
        (fileData.dataURL.startsWith("http://") ||
          fileData.dataURL.startsWith("https://") ||
          fileData.dataURL.startsWith("blob:"))))
      ) {
        // File has a URL (from Supabase), mark as uploaded
        uploadedIds.add(fileId);
      }
    }
    uploadedFileIdsRef.current = uploadedIds;
  }, []);

  // Post-reload success toast (avoids blocking alert() before reload)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(aiFlashStorageKey(roomId));
      if (!raw) return;
      sessionStorage.removeItem(aiFlashStorageKey(roomId));
      const data = JSON.parse(raw) as { message?: string };
      if (data?.message) setAiSuccessBanner(data.message);
    } catch {
      /* ignore */
    }
  }, [roomId]);

  useEffect(() => {
    if (!aiSuccessBanner) return;
    const t = window.setTimeout(() => setAiSuccessBanner(null), 5500);
    return () => window.clearTimeout(t);
  }, [aiSuccessBanner]);

  useEffect(() => {
    if (!showAIModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAIModal(false);
        setAIPrompt("");
        setAIError(null);
        setAiMergeMode("append");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAIModal]);

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
                tags: dbRoom.tags || [],
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
              status: "synced" as RoomStatus,
              tags: dbRoom.tags || [],
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

        // Update local room scene with Supabase URL
        // We don't need to fetch the image back, we already have the base64 dataURL
        const currentRoom = await loadLocalRoom(roomId);
        if (currentRoom) {
          const updatedFiles = {
            ...currentRoom.scene.files,
            [fileId]: {
              ...currentRoom.scene.files?.[fileId],
              // Keep the base64 dataURL for immediate display
              dataURL: file.dataURL,
              // Store Supabase URL for persistence
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
          status: (localRoom.status === "synced" ? "local-only" : localRoom.status) as RoomStatus,
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

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await authenticatedFetch(`/api/rooms/${roomId}/history`);
      if (response.ok) {
        const data = await response.json();
        setHistoryList(data);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const restoreVersion = async (historyId: string) => {
    if (!confirm("Are you sure you want to restore this version? Current unsaved changes might be lost.")) {
      return;
    }

    try {
      const response = await authenticatedFetch(`/api/rooms/${roomId}/history/${historyId}`);
      if (!response.ok) throw new Error("Failed to fetch version");
      
      const version = await response.json();
      
      if (version.scene) {
        const scene = version.scene;
        // Restore scene
        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: scene.elements,
            appState: scene.appState,
            files: scene.files,
          });
          
          // Save as current local room
          if (localRoom) {
            const updatedRoom: LocalRoom = {
              ...localRoom,
              scene: scene,
              updatedAt: new Date().toISOString(),
              status: "local-only", // Mark as local so it syncs back as new version
              tags: localRoom.tags || [],
            };
            setLocalRoom(updatedRoom);
            await saveLocalRoom(updatedRoom);
            
            // Trigger sync to save this restored version as the latest on server
            setSyncStatus(prev => ({ ...prev, needsSync: true }));
          }
        }
        setShowHistoryModal(false);
      }
    } catch (error) {
      console.error("Error restoring version:", error);
      alert("Failed to restore version");
    }
  };

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
        status: "synced" as RoomStatus,
        tags: dbRoom.tags || [],
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
          prompt: aiPrompt.trim().slice(0, AI_PROMPT_MAX),
          format: "excalidraw",
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

      const currentElements = localRoom.scene.elements || [];
      const mergedElements =
        aiMergeMode === "replace"
          ? newElements
          : [...currentElements, ...newElements];

      const updatedScene: ExcalidrawScene = {
        ...localRoom.scene,
        elements: mergedElements,
      };
      updateLocalRoomScene(roomId, updatedScene);

      const successMsg =
        aiMergeMode === "replace"
          ? `สร้างไดอะแกรมสำเร็จ — แทนที่เนื้อหาแคนวาสด้วย ${newElements.length} รายการ`
          : `สร้างไดอะแกรมสำเร็จ — เพิ่ม ${newElements.length} รายการต่อจากของเดิม`;
      try {
        sessionStorage.setItem(
          aiFlashStorageKey(roomId),
          JSON.stringify({ message: successMsg })
        );
      } catch {
        /* quota / private mode */
      }

      setShowAIModal(false);
      setAIPrompt("");
      setAiMergeMode("append");

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
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-stone-200"></div>
            <div className="absolute inset-0 rounded-full border-2 border-stone-900 border-t-transparent animate-spin"></div>
          </div>
          <div className="text-stone-500 font-medium text-sm">Loading canvas...</div>
        </div>
      </div>
    );
  }

  const syncStatusColor = syncStatus.status === "synced" && syncStatus.isInSync !== false;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f5f5f0]">

      {/* ─── Sidebar ──────────────────────────────────── */}
      <div className={`${sidebarOpen ? "w-[280px]" : "w-0"} flex-shrink-0 bg-white border-r border-stone-200/80 transition-all duration-300 overflow-hidden flex flex-col relative z-20`}>

        {/* Sidebar Header */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2 min-h-[56px]">
          <Link href="/dashboard" className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-700 transition-colors shrink-0" title="Back to Dashboard">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-stone-900 truncate">{localRoom.title}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatusColor ? "bg-green-500" : "bg-amber-500"}`}></div>
              <span className="text-[10px] font-medium text-stone-400">
                {syncStatusColor ? "Synced" : "Unsaved"} &middot; {new Date(localRoom.updatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors shrink-0" title="Close sidebar">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">

          {/* Read-only notice */}
          {!isOwner && (
            <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-amber-50 border border-amber-100 rounded-lg">
              <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-[11px] font-medium text-amber-700">View-only mode</span>
            </div>
          )}

          {/* Share */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href)
                .then(() => alert("Link copied to clipboard"))
                .catch(() => alert("Failed to copy link"));
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors font-medium group"
          >
            <div className="w-7 h-7 rounded-lg bg-stone-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors shrink-0">
              <svg className="w-3.5 h-3.5 text-stone-500 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </div>
            <span>Copy Link</span>
          </button>

          {/* Actions */}
          {isOwner && (
            <>
              <div className="pt-3 pb-1.5 px-3">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Sync</span>
              </div>

              <button
                onClick={() => handleLockedFeature(handlePush)}
                disabled={isSyncing}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                  !isSubscriptionActive ? "text-stone-400 cursor-not-allowed" : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  !isSubscriptionActive ? "bg-stone-100" : "bg-stone-100 group-hover:bg-green-100"
                }`}>
                  {!isSubscriptionActive ? (
                    <LockIcon className="w-3.5 h-3.5 text-stone-400" />
                  ) : isSyncing ? (
                    <div className="w-3.5 h-3.5 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5 text-stone-500 group-hover:text-green-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  )}
                </div>
                <span>{isSyncing ? "Saving..." : "Save to Server"}</span>
                {!isSubscriptionActive && <span className="ml-auto text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">PRO</span>}
              </button>

              <button
                onClick={() => handleLockedFeature(handleCheckSync)}
                disabled={isSyncing}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                  !isSubscriptionActive ? "text-stone-400 cursor-not-allowed" : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  !isSubscriptionActive ? "bg-stone-100" : "bg-stone-100 group-hover:bg-blue-100"
                }`}>
                  {!isSubscriptionActive ? (
                    <LockIcon className="w-3.5 h-3.5 text-stone-400" />
                  ) : (
                    <svg className="w-3.5 h-3.5 text-stone-500 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </div>
                <span>Check Status</span>
                {!isSubscriptionActive && <span className="ml-auto text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">PRO</span>}
              </button>

              {syncStatus.dbExists && (
                <button
                  onClick={() => handleLockedFeature(handlePull)}
                  disabled={isSyncing}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                    !isSubscriptionActive ? "text-stone-400 cursor-not-allowed" : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    !isSubscriptionActive ? "bg-stone-100" : "bg-stone-100 group-hover:bg-purple-100"
                  }`}>
                    {!isSubscriptionActive ? (
                      <LockIcon className="w-3.5 h-3.5 text-stone-400" />
                    ) : (
                      <svg className="w-3.5 h-3.5 text-stone-500 group-hover:text-purple-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                    )}
                  </div>
                  <span>Pull from Server</span>
                  {!isSubscriptionActive && <span className="ml-auto text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">PRO</span>}
                </button>
              )}

              {/* Tools section */}
              <div className="pt-3 pb-1.5 px-3">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Tools</span>
              </div>

              <button
                onClick={() => { setShowHistoryModal(true); fetchHistory(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors font-medium group"
              >
                <div className="w-7 h-7 rounded-lg bg-stone-100 group-hover:bg-orange-100 flex items-center justify-center transition-colors shrink-0">
                  <svg className="w-3.5 h-3.5 text-stone-500 group-hover:text-orange-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span>History</span>
              </button>

              <button
                onClick={() => handleLockedFeature(() => setShowAIModal(true))}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                  !isSubscriptionActive ? "text-stone-400 cursor-not-allowed" : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  !isSubscriptionActive ? "bg-stone-100" : "bg-gradient-to-br from-yellow-400 to-amber-500 shadow-sm"
                }`}>
                  {!isSubscriptionActive ? (
                    <LockIcon className="w-3.5 h-3.5 text-stone-400" />
                  ) : (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                </div>
                <span>AI Generate</span>
                {!isSubscriptionActive && <span className="ml-auto text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">PRO</span>}
              </button>
            </>
          )}

          {/* File Upload Status */}
          {isOwner && (uploadingFiles.size > 0 || uploadErrors.size > 0) && (
            <div className="pt-3 px-1 space-y-2">
              {uploadingFiles.size > 0 && (
                <div className="text-[11px] text-blue-600 flex items-center gap-2 font-medium bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg">
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                  Uploading {uploadingFiles.size} file{uploadingFiles.size > 1 ? "s" : ""}...
                </div>
              )}
              {Array.from(uploadErrors.entries()).map(([fileId, error]) => (
                <div key={fileId} className="text-[11px] text-red-600 flex items-center gap-2 truncate font-medium bg-red-50 border border-red-100 px-3 py-2 rounded-lg" title={error}>
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="truncate">{error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Main Content ─────────────────────────────── */}
      <div className="flex-1 relative h-full overflow-hidden">

        {/* Floating sidebar toggle */}
        {!sidebarOpen && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2.5 bg-white/90 backdrop-blur-sm border border-stone-200 rounded-xl shadow-md hover:bg-white hover:shadow-lg transition-all text-stone-600 hover:text-stone-900"
              title="Open sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="bg-white/90 backdrop-blur-sm border border-stone-200 rounded-xl shadow-md px-3 py-2 flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatusColor ? "bg-green-500" : "bg-amber-500"}`}></div>
              <span className="text-xs font-medium text-stone-700 max-w-[200px] truncate">{localRoom.title}</span>
            </div>
          </div>
        )}

        {/* Excalidraw Canvas */}
        <div className="relative w-full h-full bg-white overflow-hidden">
          {isClient && initialScene && (
            <Excalidraw
              key={`excalidraw-${roomId}`}
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              onChange={handleChange}
              initialData={initialScene}
              viewModeEnabled={!isOwner}
            />
          )}
        </div>
      </div>

      {/* ─── Conflict Dialog ──────────────────────────── */}
      {showConflictDialog && conflictInfo && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-stone-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">Conflict Detected</h3>
                <p className="text-xs text-stone-500">Local and server data differ</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <button onClick={handlePush} disabled={isSyncing}
                className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-blue-50 border border-stone-200 hover:border-blue-200 rounded-xl transition-all group">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="text-left flex-1">
                  <div className="text-sm font-bold text-stone-900">Use Local Data</div>
                  <div className="text-[10px] text-stone-500">{new Date(conflictInfo.localUpdatedAt).toLocaleString("en-US")}</div>
                </div>
              </button>

              <button onClick={handlePull} disabled={isSyncing}
                className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-green-50 border border-stone-200 hover:border-green-200 rounded-xl transition-all group">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                </div>
                <div className="text-left flex-1">
                  <div className="text-sm font-bold text-stone-900">Use Server Data</div>
                  <div className="text-[10px] text-stone-500">{new Date(conflictInfo.serverUpdatedAt).toLocaleString("en-US")}</div>
                </div>
              </button>
            </div>

            <button onClick={() => { setShowConflictDialog(false); setConflictInfo(null); }}
              className="w-full py-2 text-xs font-medium text-stone-400 hover:text-stone-600 transition-colors">
              Decide Later
            </button>
          </div>
        </div>
      )}

      {/* ─── AI Modal ─────────────────────────────────── */}
      {showAIModal && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full border border-stone-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start gap-3 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-sm shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 id="ai-modal-title" className="text-lg font-bold text-stone-900">
                    AI Generate
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                    อธิบายไดอะแกรมที่ต้องการ (flowchart, sequence, state ฯลฯ) AI จะสร้างเป็น Mermaid แล้ววางลงบน Excalidraw ให้
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAIModal(false);
                  setAIPrompt("");
                  setAIError(null);
                  setAiMergeMode("append");
                }}
                className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors shrink-0"
                aria-label="ปิด"
              >
                <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label htmlFor="ai-prompt-input" className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  คำอธิบายไดอะแกรม
                </label>
                <span className="text-[10px] text-stone-400 tabular-nums">
                  {aiPrompt.length}/{AI_PROMPT_MAX}
                </span>
              </div>
              <textarea
                id="ai-prompt-input"
                value={aiPrompt}
                onChange={(e) => setAIPrompt(e.target.value.slice(0, AI_PROMPT_MAX))}
                placeholder="เช่น สร้าง flowchart ระบบล็อกอิน: เริ่มต้น → ฟอร์ม → ตรวจสอบ → สำเร็จ / ผิดพลาด"
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-400 text-stone-900 text-sm transition-all resize-none placeholder-stone-400 min-h-[108px]"
                rows={4}
                disabled={isGenerating}
              />
              <p className="text-[10px] text-stone-400 mt-2">กด Esc เพื่อปิดหน้าต่าง</p>
            </div>

            <div className="mb-4">
              <span className="block text-xs font-bold text-stone-500 mb-2 uppercase tracking-wider">ตัวอย่าง (คลิกเพื่อใส่ในช่อง)</span>
              <div className="flex flex-col gap-2">
                {AI_EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setAIPrompt(example.slice(0, AI_PROMPT_MAX))}
                    className="text-left text-xs text-stone-600 bg-stone-50 hover:bg-amber-50 border border-stone-200 hover:border-amber-200 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 leading-snug"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="mb-5 border-0 p-0 m-0">
              <legend className="block text-xs font-bold text-stone-500 mb-2 uppercase tracking-wider">
                วางบนแคนวาส
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setAiMergeMode("append")}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold border transition-all ${
                    aiMergeMode === "append"
                      ? "border-amber-400 bg-amber-50 text-amber-950 shadow-sm"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  เพิ่มต่อ
                  <span className="block text-[10px] font-normal text-stone-500 mt-0.5">คงของเดิม แล้วต่อท้าย</span>
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setAiMergeMode("replace")}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold border transition-all ${
                    aiMergeMode === "replace"
                      ? "border-amber-400 bg-amber-50 text-amber-950 shadow-sm"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  แทนที่ทั้งหมด
                  <span className="block text-[10px] font-normal text-stone-500 mt-0.5">ลบเฉพาะเส้น/รูปบนแคนวาส (ไฟล์แนบคงอยู่)</span>
                </button>
              </div>
            </fieldset>

            {aiError && (
              <div className="mb-5 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs flex items-start gap-2 font-medium">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{aiError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleAIGenerate}
              disabled={isGenerating || !aiPrompt.trim()}
              className="w-full px-4 py-3 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>กำลังสร้าง...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>สร้างไดอะแกรม</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── History Modal ────────────────────────────── */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-stone-100 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-stone-900">Version History</h3>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
                <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {isLoadingHistory ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-10">
                  <svg className="w-10 h-10 text-stone-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-stone-400 font-medium">No versions yet</p>
                </div>
              ) : (
                historyList.map((version, i) => (
                  <div key={version.id}
                    className="flex items-center justify-between px-4 py-3 bg-stone-50 border border-stone-100 rounded-xl hover:border-stone-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-xs font-bold text-stone-400">
                        {historyList.length - i}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-stone-900">
                          {new Date(version.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                        <div className="text-[10px] text-stone-500 font-medium">
                          {new Date(version.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric" })}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => restoreVersion(version.id)}
                      className="px-3 py-1.5 text-xs font-bold text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-900 hover:text-white hover:border-stone-900 transition-all">
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {aiSuccessBanner && (
        <div
          className="fixed bottom-6 left-1/2 z-[60] flex max-w-[min(420px,calc(100%-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-stone-700/40 bg-stone-900 px-4 py-3 text-sm text-white shadow-xl"
          role="status"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="min-w-0 flex-1 leading-snug">{aiSuccessBanner}</p>
          <button
            type="button"
            onClick={() => setAiSuccessBanner(null)}
            className="shrink-0 rounded-lg p-1 text-stone-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="ปิดการแจ้งเตือน"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
