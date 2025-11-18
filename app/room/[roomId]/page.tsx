"use client";

import { useState, useEffect, useCallback } from "react";
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

  const prepareInitialScene = useCallback(
    (room: LocalRoom): ExcalidrawScene => ({
      elements: room.scene.elements || [],
      appState: sanitizeAppState(room.scene.appState),
      files: room.scene.files || {},
    }),
    []
  );

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
              setInitialScene(prepareInitialScene(localDraft));
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
              // In sync - use local draft if it exists, otherwise use DB
              const roomToUse = localDraft || {
                id: dbRoom.id,
                title: dbRoom.title,
                description: dbRoom.description || undefined,
                scene: dbRoom.scene,
                createdAt: new Date(dbRoom.createdAt).toISOString(),
                updatedAt: dbUpdatedAt,
                lastSyncedAt: dbRoom.lastSyncedAt
                  ? new Date(dbRoom.lastSyncedAt).toISOString()
                  : null,
                status: "synced" as RoomStatus,
              };
              
              // Save to localStorage if not already there
              if (!localDraft) {
                saveLocalRoom(roomToUse);
              }
              
              setLocalRoom(roomToUse);
              setInitialScene(prepareInitialScene(roomToUse));
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
              scene: dbRoom.scene,
              createdAt: new Date(dbRoom.createdAt).toISOString(),
              updatedAt: dbUpdatedAt,
              lastSyncedAt: dbRoom.lastSyncedAt
                ? new Date(dbRoom.lastSyncedAt).toISOString()
                : null,
              status: "synced",
            };
            
            saveLocalRoom(roomToUse);
            setLocalRoom(roomToUse);
            setInitialScene(prepareInitialScene(roomToUse));
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
            setInitialScene(prepareInitialScene(localDraft));
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
          setInitialScene(prepareInitialScene(localDraft));
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
  }, [roomId, prepareInitialScene]);


  // Auto-save to localStorage immediately on every change (only if owner)
  const handleChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (elements: readonly any[], appState: any, files: any) => {
      // Don't save if not owner (read-only mode)
      if (!isOwner) {
        return;
      }
      
      console.log("handleChange called", { elementsCount: elements.length });
      
      // Clean appState before saving - remove runtime-only properties
      const cleanAppState = sanitizeAppState(appState);

      try {
        // Update local room scene immediately (auto-save)
        updateLocalRoomScene(roomId, {
          elements,
          appState: cleanAppState,
          files: files || {},
        });

        console.log("Saved to localStorage:", roomId);

        // Refresh local room state
        const updatedRoom = loadLocalRoom(roomId);
        if (updatedRoom) {
          setLocalRoom(updatedRoom);
          // After local update, mark as needing sync if it was previously synced
          setSyncStatus((prev) => {
            // If was synced before, now needs push
            const syncAction = prev.dbExists && prev.isInSync ? "push" : prev.syncAction;
            return {
              ...prev,
              status: updatedRoom.status,
              needsSync: updatedRoom.status === "local-only" ? true : prev.needsSync || true,
              isInSync: false, // Local changed, so out of sync
              syncAction: syncAction || "push",
            };
          });
        } else {
          console.warn("Failed to load room after save:", roomId);
        }
      } catch (error) {
        console.error("Error saving to localStorage:", error);
      }
    },
    [roomId, isOwner]
  );

  // Push: Upload local data to server
  const handlePush = async () => {
    if (isSyncing || !localRoom || !isOwner) return; // Only owners can push

    setIsSyncing(true);
    try {
      const sceneToSync = {
        ...localRoom.scene,
        files: localRoom.scene.files || {},
      };

      const response = await authenticatedFetch("/api/rooms/sync", {
        method: "POST",
        body: JSON.stringify({
          id: localRoom.id,
          title: localRoom.title,
          description: localRoom.description,
          scene: sceneToSync,
          updatedAt: localRoom.updatedAt,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to push room");
      }

      const syncedRoom = await response.json();

      // Update localStorage with synced data
      const updatedRoom: LocalRoom = {
        ...localRoom,
        scene: syncedRoom.scene,
        updatedAt: new Date(syncedRoom.updatedAt).toISOString(),
        lastSyncedAt: syncedRoom.lastSyncedAt
          ? new Date(syncedRoom.lastSyncedAt).toISOString()
          : new Date().toISOString(),
        status: "synced",
      };
      saveLocalRoom(updatedRoom);

      setLocalRoom(updatedRoom);
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

      // Update local room with server data
      const updatedLocalRoom: LocalRoom = {
        id: dbRoom.id,
        title: dbRoom.title,
        description: dbRoom.description || undefined,
        scene: dbRoom.scene,
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
      setInitialScene(prepareInitialScene(updatedLocalRoom));
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
                  saveToActiveFile: isOwner,
                  loadScene: isOwner,
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
