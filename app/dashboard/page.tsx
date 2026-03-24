"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  loadRoomsIndex,
  deleteLocalRoom,
  updateLocalRoomMetadata,
  markRoomAsSynced,
  saveLocalRoom,
  loadLocalRoom,
} from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import { authenticatedFetch } from "@/lib/apiClient";
import { STRIPE_PRICE_ID } from "@/lib/stripeConfig";
import {
  FREE_TIER_MAX_PAGES_PER_PROJECT,
  FREE_TIER_MAX_PROJECTS,
} from "@/lib/planTier";
import type { RoomIndexEntry, LocalRoom } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import Modal from "@/components/Modal";

// ─── Virtual Folder System ───────────────────────────────────
interface VirtualFolder {
  id: string;
  name: string;
  color: string;
  icon: string;
  roomIds: string[];
  createdAt: string;
}

const FOLDERS_KEY = "excalidraw:folders";
const FOLDER_COLORS = [
  { name: "Blue", value: "#3b82f6", bg: "bg-blue-500", light: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  { name: "Purple", value: "#8b5cf6", bg: "bg-purple-500", light: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  { name: "Green", value: "#22c55e", bg: "bg-green-500", light: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  { name: "Orange", value: "#f97316", bg: "bg-orange-500", light: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  { name: "Pink", value: "#ec4899", bg: "bg-pink-500", light: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
  { name: "Teal", value: "#14b8a6", bg: "bg-teal-500", light: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  { name: "Yellow", value: "#eab308", bg: "bg-yellow-500", light: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  { name: "Red", value: "#ef4444", bg: "bg-red-500", light: "bg-red-50", text: "text-red-700", border: "border-red-200" },
];
const FOLDER_ICONS = ["folder", "briefcase", "star", "heart", "zap", "code", "globe", "layers"];

function loadFolders(): VirtualFolder[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(FOLDERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

// ─── Icon Components ─────────────────────────────────────────
function FolderIcon({ icon, className = "w-5 h-5" }: { icon: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    folder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />,
    briefcase: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
    star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />,
    heart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />,
    zap: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
    code: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />,
    globe: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    layers: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
  };
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {icons[icon] || icons.folder}
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<RoomIndexEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingRooms, setSyncingRooms] = useState<Set<string>>(new Set());
  const [isPro, setIsPro] = useState(false);
  const [planLimits, setPlanLimits] = useState<{
    maxProjects: number | null;
    maxPagesPerProject: number | null;
  }>({
    maxProjects: FREE_TIER_MAX_PROJECTS,
    maxPagesPerProject: FREE_TIER_MAX_PAGES_PER_PROJECT,
  });
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Sidebar & Folder state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [folders, setFolders] = useState<VirtualFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All Rooms
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isEditFolderModalOpen, setIsEditFolderModalOpen] = useState(false);
  const [isDeleteFolderModalOpen, setIsDeleteFolderModalOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomNameInput, setRoomNameInput] = useState("");
  const [roomTagsInput, setRoomTagsInput] = useState("");
  const [folderNameInput, setFolderNameInput] = useState("");
  const [folderColorIndex, setFolderColorIndex] = useState(0);
  const [folderIconIndex, setFolderIconIndex] = useState(0);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [folderActionPending, setFolderActionPending] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  // ─── Sorting Helper ──────────────────────────────────────
  const sortRooms = useCallback((r: RoomIndexEntry[]) =>
    [...r].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()), []);

  const fetchProjectsFromServer = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/projects");
      if (!res.ok) {
        setFolders(loadFolders());
        return;
      }
      let list: VirtualFolder[] = await res.json();
      if (list.length === 0) {
        const local = loadFolders();
        if (local.length > 0) {
          const roomIndex = loadRoomsIndex();
          const myRoomIds = new Set(roomIndex.map((r) => r.id));
          for (const f of local) {
            const createRes = await authenticatedFetch("/api/projects", {
              method: "POST",
              body: JSON.stringify({ name: f.name, color: f.color, icon: f.icon }),
            });
            if (!createRes.ok) continue;
            const created = await createRes.json();
            const validRoomIds = f.roomIds.filter((id) => myRoomIds.has(id));
            if (validRoomIds.length > 0) {
              await authenticatedFetch(`/api/projects/${created.id}`, {
                method: "PATCH",
                body: JSON.stringify({ roomIds: validRoomIds }),
              });
            }
          }
          try {
            localStorage.removeItem(FOLDERS_KEY);
          } catch {
            /* ignore */
          }
          const res2 = await authenticatedFetch("/api/projects");
          if (res2.ok) list = await res2.json();
        }
      }
      setFolders(list);
    } catch (e) {
      console.error("Error loading projects:", e);
      setFolders(loadFolders());
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // ─── Initialize ──────────────────────────────────────────
  useEffect(() => {
    setIsClient(true);
    const checkAuth = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push("/login"); return; }
        setUser(user);
        setIsLoading(false);
        fetchSubscriptionStatus();
      } catch { router.push("/login"); }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { router.push("/login"); }
      else { setUser(session.user); setIsLoading(false); fetchSubscriptionStatus(); }
    });

    const loadedRooms = sortRooms(loadRoomsIndex());
    setRooms(loadedRooms);
    syncRoomsFromServer(loadedRooms);
    void fetchProjectsFromServer();

    // Stripe callback handling
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    const isSuccess = urlParams.get("success") === "true";
    const returnedFromPortal = urlParams.get("returned_from_portal") === "true";

    if (isSuccess && sessionId) {
      const confirmSession = async () => {
        try {
          const response = await authenticatedFetch("/api/stripe/confirm-session", { method: "POST", body: JSON.stringify({ sessionId }) });
          if (response.ok) { const data = await response.json(); console.log("Session confirmed:", data); }
        } catch (error) { console.error("Error confirming session:", error); }
        finally { fetchSubscriptionStatus(); window.history.replaceState({}, "", "/dashboard"); }
      };
      setTimeout(confirmSession, 500);
    } else if (returnedFromPortal) {
      setTimeout(() => { fetchSubscriptionStatus(); window.history.replaceState({}, "", "/dashboard"); }, 500);
    }

    return () => { subscription.unsubscribe(); };
  }, [router, sortRooms, fetchProjectsFromServer]);

  // ─── Filtered Rooms ──────────────────────────────────────
  const filteredRooms = useMemo(() => {
    let result = rooms;

    // Filter by active folder
    if (activeFolder === "__uncategorized") {
      const allAssignedIds = new Set(folders.flatMap((f) => f.roomIds));
      result = result.filter((r) => !allAssignedIds.has(r.id));
    } else if (activeFolder) {
      const folder = folders.find((f) => f.id === activeFolder);
      if (folder) result = result.filter((r) => folder.roomIds.includes(r.id));
    }

    // Filter by search
    if (searchQuery.trim()) {
      result = result.filter((r) => r.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Filter by tags
    if (selectedTags.length > 0) {
      result = result.filter((r) => r.tags && selectedTags.every((t) => r.tags.includes(t)));
    }

    return result;
  }, [rooms, activeFolder, folders, searchQuery, selectedTags]);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedTags, activeFolder]);

  // ─── Derived data ────────────────────────────────────────
  const allTags = useMemo(() => Array.from(new Set(rooms.flatMap((r) => r.tags || []))).sort(), [rooms]);

  const stats = useMemo(() => ({
    total: rooms.length,
    synced: rooms.filter((r) => r.status === "synced").length,
    local: rooms.filter((r) => r.status === "local-only").length,
  }), [rooms]);

  const totalPages = Math.ceil(filteredRooms.length / itemsPerPage);
  const paginatedRooms = filteredRooms.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const activeFolderData = useMemo(() => {
    if (!activeFolder) return null;
    if (activeFolder === "__uncategorized") return { id: "__uncategorized", name: "Uncategorized", color: "#78716c", icon: "layers", roomIds: [], createdAt: "" };
    return folders.find((f) => f.id === activeFolder) || null;
  }, [activeFolder, folders]);

  const canCreateMoreProjects = useMemo(() => {
    if (isPro || planLimits.maxProjects === null) return true;
    return folders.length < planLimits.maxProjects;
  }, [isPro, planLimits.maxProjects, folders.length]);

  const canAddPageToFolder = useCallback(
    (folder: VirtualFolder) => {
      if (isPro || planLimits.maxPagesPerProject === null) return true;
      return folder.roomIds.length < planLimits.maxPagesPerProject;
    },
    [isPro, planLimits.maxPagesPerProject],
  );

  const activeProjectFolder = useMemo(() => {
    if (!activeFolder || activeFolder === "__uncategorized") return null;
    return folders.find((f) => f.id === activeFolder) ?? null;
  }, [activeFolder, folders]);

  const isActiveProjectFull =
    activeProjectFolder !== null && !canAddPageToFolder(activeProjectFolder);

  const parseProjectApiError = async (res: Response) => {
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.code === "PROJECT_LIMIT") {
        return "แผนฟรีสร้างได้สูงสุด 5 โปรเจกต์ อัปเกรดเป็น Pro เพื่อเพิ่มไม่จำกัด";
      }
      if (data.code === "PAGES_PER_PROJECT_LIMIT") {
        return "แผนฟรีใส่ได้สูงสุด 5 หน้าต่อโปรเจกต์ อัปเกรดเป็น Pro เพื่อเพิ่มไม่จำกัด";
      }
      return data.error || "เกิดข้อผิดพลาด";
    } catch {
      return "เกิดข้อผิดพลาด";
    }
  };

  // ─── Subscription/Auth handlers ──────────────────────────
  const fetchSubscriptionStatus = async () => {
    try {
      const response = await authenticatedFetch("/api/subscription");
      if (response.ok) {
        const data = await response.json();
        setIsPro(data.isPro);
        if (data.limits) {
          setPlanLimits({
            maxProjects: data.limits.maxProjects,
            maxPagesPerProject: data.limits.maxPagesPerProject,
          });
        }
      }
    } catch (error) { console.error("Error fetching subscription:", error); }
    finally { setIsLoadingSubscription(false); }
  };

  const handleManageSubscription = async () => {
    try {
      const response = await authenticatedFetch("/api/portal", { method: "POST" });
      const { url } = await response.json();
      if (url) window.location.href = url;
      else alert("Failed to open subscription portal");
    } catch (error) { console.error("Error opening portal:", error); alert("Something went wrong"); }
  };

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    try {
      const response = await authenticatedFetch("/api/checkout", { method: "POST", body: JSON.stringify({ priceId: STRIPE_PRICE_ID }) });
      const { url, error } = await response.json();
      if (error) { alert("Checkout failed: " + error); return; }
      if (url) window.location.href = url;
      else alert("Failed to start checkout.");
    } catch (err) { console.error("Checkout error:", err); alert("An unexpected error occurred."); }
    finally { setIsCheckingOut(false); }
  };

  // ─── Sync ────────────────────────────────────────────────
  const syncRoomsFromServer = async (localRooms: RoomIndexEntry[]) => {
    try {
      const response = await authenticatedFetch("/api/rooms");
      if (!response.ok) return;
      const serverRooms = await response.json();
      const localIds = new Set(localRooms.map((r) => r.id));
      const newRooms: RoomIndexEntry[] = [];

      for (const serverRoom of serverRooms) {
        if (!localIds.has(serverRoom.id)) {
          newRooms.push({
            id: serverRoom.id, title: serverRoom.title, description: serverRoom.description || undefined,
            status: "synced", createdAt: new Date(serverRoom.createdAt).toISOString(),
            updatedAt: new Date(serverRoom.updatedAt).toISOString(),
            lastSyncedAt: serverRoom.lastSyncedAt ? new Date(serverRoom.lastSyncedAt).toISOString() : null,
            tags: serverRoom.tags || [],
          });
          const localRoom: LocalRoom = {
            id: serverRoom.id, title: serverRoom.title, description: serverRoom.description || undefined,
            scene: serverRoom.scene, createdAt: new Date(serverRoom.createdAt).toISOString(),
            updatedAt: new Date(serverRoom.updatedAt).toISOString(),
            lastSyncedAt: serverRoom.lastSyncedAt ? new Date(serverRoom.lastSyncedAt).toISOString() : null,
            status: "synced", tags: serverRoom.tags || [],
          };
          await saveLocalRoom(localRoom);
        }
      }

      if (newRooms.length > 0) {
        const updated = sortRooms([...localRooms, ...newRooms]);
        setRooms(updated);
      }
    } catch (error) { console.error("Error syncing rooms from server:", error); }
    finally { setIsLoadingRooms(false); }
  };

  // ─── Room CRUD ───────────────────────────────────────────
  const refreshRooms = useCallback(() => {
    const updated = sortRooms(loadRoomsIndex());
    setRooms(updated);
  }, [sortRooms]);

  const openCreateModal = () => { setRoomNameInput(""); setRoomTagsInput(""); setIsCreateModalOpen(true); };

  const handleCreateRoom = async () => {
    const roomName = roomNameInput.trim();
    if (!roomName) return;
    if (activeFolder && activeFolder !== "__uncategorized") {
      const folder = folders.find((f) => f.id === activeFolder);
      if (folder && !canAddPageToFolder(folder)) {
        alert(
          "แผนฟรีใส่ได้สูงสุด 5 หน้าต่อโปรเจกต์ อัปเกรดเป็น Pro เพื่อเพิ่มไม่จำกัด"
        );
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const response = await authenticatedFetch("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ title: roomName, description: undefined, scene: { elements: [], appState: {}, files: {} }, tags: roomTagsInput.split(",").map((t) => t.trim()).filter(Boolean) }),
      });
      if (!response.ok) throw new Error("Failed to create room");
      const dbRoom = await response.json();
      const localRoom: LocalRoom = {
        id: dbRoom.id, title: dbRoom.title, description: dbRoom.description || undefined,
        scene: dbRoom.scene, createdAt: new Date(dbRoom.createdAt).toISOString(),
        updatedAt: new Date(dbRoom.updatedAt).toISOString(),
        lastSyncedAt: dbRoom.lastSyncedAt ? new Date(dbRoom.lastSyncedAt).toISOString() : null,
        status: "synced", tags: dbRoom.tags || [],
      };
      await saveLocalRoom(localRoom);

      if (activeFolder && activeFolder !== "__uncategorized") {
        const folder = folders.find((f) => f.id === activeFolder);
        if (folder && !folder.roomIds.includes(dbRoom.id)) {
          try {
            const patchRes = await authenticatedFetch(`/api/projects/${activeFolder}`, {
              method: "PATCH",
              body: JSON.stringify({ roomIds: [...folder.roomIds, dbRoom.id] }),
            });
            if (patchRes.ok) {
              const updatedFolder: VirtualFolder = await patchRes.json();
              setFolders((prev) => prev.map((f) => (f.id === activeFolder ? updatedFolder : f)));
            } else {
              alert(await parseProjectApiError(patchRes));
            }
          } catch (e) {
            console.error("Error adding room to project:", e);
          }
        }
      }

      refreshRooms();
      setIsCreateModalOpen(false);
      router.push(`/room/${dbRoom.id}`);
    } catch (error) { console.error("Error creating room:", error); alert("ไม่สามารถสร้างห้องได้ กรุณาลองอีกครั้ง"); }
    finally { setIsSubmitting(false); }
  };

  const handleSyncRoom = async (roomId: string) => {
    if (syncingRooms.has(roomId)) return;
    setSyncingRooms((prev) => new Set(prev).add(roomId));
    try {
      const localRoom = await loadLocalRoom(roomId);
      if (!localRoom) throw new Error("Room not found in localStorage");
      const response = await authenticatedFetch("/api/rooms/sync", {
        method: "POST",
        body: JSON.stringify({ id: localRoom.id, title: localRoom.title, description: localRoom.description, scene: localRoom.scene, updatedAt: localRoom.updatedAt }),
      });
      if (!response.ok) throw new Error("Failed to sync room");
      const syncedRoom = await response.json();
      await markRoomAsSynced(roomId, syncedRoom.lastSyncedAt ? new Date(syncedRoom.lastSyncedAt).toISOString() : new Date().toISOString());
      refreshRooms();
    } catch (error) { console.error("Error syncing room:", error); alert("ไม่สามารถ sync ห้องได้ กรุณาลองอีกครั้ง"); }
    finally { setSyncingRooms((prev) => { const next = new Set(prev); next.delete(roomId); return next; }); }
  };

  const openDeleteModal = (roomId: string) => { setSelectedRoomId(roomId); setIsDeleteModalOpen(true); };

  const handleDeleteRoom = async () => {
    if (!selectedRoomId) return;
    setIsSubmitting(true);
    try {
      try {
        const response = await authenticatedFetch(`/api/rooms/${selectedRoomId}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) { const errorData = await response.json(); throw new Error(errorData.error || "Failed to delete room from server"); }
      } catch (error) { console.error("Error deleting room from server:", error); }
      await deleteLocalRoom(selectedRoomId);

      setFolders((prev) =>
        prev.map((f) => ({ ...f, roomIds: f.roomIds.filter((id) => id !== selectedRoomId) }))
      );

      refreshRooms();
      setIsDeleteModalOpen(false);
    } catch (error) { console.error("Error deleting room:", error); alert("ไม่สามารถลบห้องได้ กรุณาลองอีกครั้ง"); }
    finally { setIsSubmitting(false); setSelectedRoomId(null); }
  };

  const openEditModal = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (room) { setSelectedRoomId(roomId); setRoomNameInput(room.title); setRoomTagsInput(room.tags ? room.tags.join(", ") : ""); setIsEditModalOpen(true); }
  };

  const handleEditRoom = async () => {
    if (!selectedRoomId || !roomNameInput.trim()) return;
    setIsSubmitting(true);
    try {
      const tags = roomTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await updateLocalRoomMetadata(selectedRoomId, { title: roomNameInput.trim(), tags });
      refreshRooms();
      setIsEditModalOpen(false);
    } catch (error) { console.error("Error updating room:", error); alert("Failed to update room name"); }
    finally { setIsSubmitting(false); setSelectedRoomId(null); }
  };

  // ─── Folder CRUD ─────────────────────────────────────────
  const openFolderModal = () => {
    if (!canCreateMoreProjects) {
      alert(
        "แผนฟรีสร้างได้สูงสุด 5 โปรเจกต์ อัปเกรดเป็น Pro เพื่อเพิ่มไม่จำกัด"
      );
      return;
    }
    setFolderNameInput("");
    setFolderColorIndex(0);
    setFolderIconIndex(0);
    setIsFolderModalOpen(true);
  };

  const handleCreateFolder = async () => {
    if (!folderNameInput.trim()) return;
    if (!canCreateMoreProjects) {
      alert(
        "แผนฟรีสร้างได้สูงสุด 5 โปรเจกต์ อัปเกรดเป็น Pro เพื่อเพิ่มไม่จำกัด"
      );
      return;
    }
    setFolderActionPending(true);
    try {
      const res = await authenticatedFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: folderNameInput.trim(),
          color: FOLDER_COLORS[folderColorIndex].value,
          icon: FOLDER_ICONS[folderIconIndex],
        }),
      });
      if (!res.ok) {
        alert(await parseProjectApiError(res));
        return;
      }
      const newFolder: VirtualFolder = await res.json();
      setFolders((prev) => [...prev, newFolder]);
      setIsFolderModalOpen(false);
      setActiveFolder(newFolder.id);
    } catch (e) {
      console.error(e);
      alert("ไม่สามารถสร้างโปรเจกต์ได้ กรุณาลองอีกครั้ง");
    } finally {
      setFolderActionPending(false);
    }
  };

  const openEditFolderModal = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (folder) {
      setEditingFolderId(folderId);
      setFolderNameInput(folder.name);
      setFolderColorIndex(FOLDER_COLORS.findIndex((c) => c.value === folder.color) || 0);
      setFolderIconIndex(FOLDER_ICONS.indexOf(folder.icon) || 0);
      setIsEditFolderModalOpen(true);
    }
  };

  const handleEditFolder = async () => {
    if (!editingFolderId || !folderNameInput.trim()) return;
    setFolderActionPending(true);
    try {
      const res = await authenticatedFetch(`/api/projects/${editingFolderId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: folderNameInput.trim(),
          color: FOLDER_COLORS[folderColorIndex].value,
          icon: FOLDER_ICONS[folderIconIndex],
        }),
      });
      if (!res.ok) throw new Error("Failed to update project");
      const updated: VirtualFolder = await res.json();
      setFolders((prev) => prev.map((f) => (f.id === editingFolderId ? updated : f)));
      setIsEditFolderModalOpen(false);
      setEditingFolderId(null);
    } catch (e) {
      console.error(e);
      alert("ไม่สามารถแก้ไขโปรเจกต์ได้ กรุณาลองอีกครั้ง");
    } finally {
      setFolderActionPending(false);
    }
  };

  const openDeleteFolderModal = (folderId: string) => { setEditingFolderId(folderId); setIsDeleteFolderModalOpen(true); };

  const handleDeleteFolder = async () => {
    if (!editingFolderId) return;
    setFolderActionPending(true);
    try {
      const res = await authenticatedFetch(`/api/projects/${editingFolderId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete project");
      setFolders((prev) => prev.filter((f) => f.id !== editingFolderId));
      if (activeFolder === editingFolderId) setActiveFolder(null);
      setIsDeleteFolderModalOpen(false);
      setEditingFolderId(null);
    } catch (e) {
      console.error(e);
      alert("ไม่สามารถลบโปรเจกต์ได้ กรุณาลองอีกครั้ง");
    } finally {
      setFolderActionPending(false);
    }
  };

  // ─── Drag & Drop ─────────────────────────────────────────
  const handleDragStart = (roomId: string) => { setDraggedRoomId(roomId); };
  const handleDragOver = (e: React.DragEvent, folderId: string) => { e.preventDefault(); setDragOverFolder(folderId); };
  const handleDragLeave = () => { setDragOverFolder(null); };
  const handleDrop = async (folderId: string) => {
    if (!draggedRoomId || folderId === "__uncategorized") {
      setDragOverFolder(null);
      setDraggedRoomId(null);
      return;
    }
    const folder = folders.find((f) => f.id === folderId);
    if (!folder || folder.roomIds.includes(draggedRoomId)) {
      setDragOverFolder(null);
      setDraggedRoomId(null);
      return;
    }
    if (!canAddPageToFolder(folder)) {
      alert(
        "แผนฟรีใส่ได้สูงสุด 5 หน้าต่อโปรเจกต์ อัปเกรดเป็น Pro เพื่อเพิ่มไม่จำกัด"
      );
      setDragOverFolder(null);
      setDraggedRoomId(null);
      return;
    }
    try {
      const res = await authenticatedFetch(`/api/projects/${folderId}`, {
        method: "PATCH",
        body: JSON.stringify({ roomIds: [...folder.roomIds, draggedRoomId] }),
      });
      if (!res.ok) {
        alert(await parseProjectApiError(res));
        return;
      }
      const updated: VirtualFolder = await res.json();
      setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
    } catch (e) {
      console.error(e);
      alert("ไม่สามารถเพิ่มห้องในโปรเจกต์ได้ กรุณาลองอีกครั้ง");
    } finally {
      setDragOverFolder(null);
      setDraggedRoomId(null);
    }
  };

  const removeRoomFromFolder = async (roomId: string, folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    try {
      const res = await authenticatedFetch(`/api/projects/${folderId}`, {
        method: "PATCH",
        body: JSON.stringify({ roomIds: folder.roomIds.filter((id) => id !== roomId) }),
      });
      if (!res.ok) {
        alert(await parseProjectApiError(res));
        return;
      }
      const updated: VirtualFolder = await res.json();
      setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
    } catch (e) {
      console.error(e);
      alert("ไม่สามารถอัปเดตโปรเจกต์ได้ กรุณาลองอีกครั้ง");
    }
  };

  // ─── Other ───────────────────────────────────────────────
  const toggleTag = (tag: string) => { setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]); };
  const handlePageChange = (page: number) => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  // ─── Get folder color helpers ────────────────────────────
  const getFolderColorObj = (color: string) => FOLDER_COLORS.find((c) => c.value === color) || FOLDER_COLORS[0];

  // ─── Loading ─────────────────────────────────────────────
  if (!isClient || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-stone-900"></div>
          <div className="text-stone-500 font-medium">Loading your space...</div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const allAssignedIds = new Set(folders.flatMap((f) => f.roomIds));
  const uncategorizedCount = rooms.filter((r) => !allAssignedIds.has(r.id)).length;

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#18181b]">
      {/* ─── Navbar ──────────────────────────────────────── */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-stone-200 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-xl hover:bg-stone-100 transition-colors text-stone-600"
                title="Toggle sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <Link href="/" className="group flex items-center gap-2.5">
                <Image
                  src="/logo.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <span className="text-lg font-semibold tracking-tight text-stone-900 transition group-hover:text-yellow-700">
                  Excaflow
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {isLoadingSubscription ? (
                <div
                  className="flex items-center gap-2 min-h-[36px]"
                  aria-busy="true"
                  aria-label="กำลังโหลดข้อมูลแผน"
                >
                  <div className="h-6 w-11 rounded-full bg-stone-200 animate-pulse" />
                  <div className="h-4 w-14 rounded-md bg-stone-200/90 animate-pulse" />
                </div>
              ) : isPro ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">PRO</span>
                  <button onClick={handleManageSubscription} className="text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium">Manage</button>
                </div>
              ) : (
                <button onClick={handleCheckout} disabled={isCheckingOut}
                  className="text-sm font-bold text-stone-900 bg-yellow-400 hover:bg-yellow-500 px-4 py-1.5 rounded-full shadow-sm transition-all disabled:opacity-50">
                  {isCheckingOut ? "..." : "Upgrade"}
                </button>
              )}
              <div className="hidden md:flex items-center gap-2 text-sm text-stone-600 bg-stone-50 px-3 py-1.5 rounded-full border border-stone-200">
                {isLoadingSubscription ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-stone-200 animate-pulse shrink-0" aria-hidden />
                    <div className="h-4 max-w-[180px] w-[min(180px,40vw)] rounded bg-stone-200 animate-pulse" aria-hidden />
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0" />
                    <span className="max-w-[180px] truncate">{user.email}</span>
                  </>
                )}
              </div>
              <button onClick={handleLogout} className="text-stone-400 hover:text-stone-600 p-2 rounded-xl hover:bg-stone-100 transition-colors" title="Sign out">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* ─── Sidebar ──────────────────────────────────── */}
        <aside className={`${sidebarOpen ? "w-64" : "w-0"} transition-all duration-300 overflow-hidden flex-shrink-0 border-r border-stone-200 bg-white min-h-[calc(100vh-64px)] sticky top-16`}>
          <div className="w-64 p-4 flex flex-col h-full">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="text-center p-2 rounded-xl bg-stone-50">
                <div className="text-lg font-bold text-stone-900">{stats.total}</div>
                <div className="text-[10px] font-medium text-stone-500 uppercase">Total</div>
              </div>
              <div className="text-center p-2 rounded-xl bg-green-50">
                <div className="text-lg font-bold text-green-700">{stats.synced}</div>
                <div className="text-[10px] font-medium text-green-600 uppercase">Synced</div>
              </div>
              <div className="text-center p-2 rounded-xl bg-amber-50">
                <div className="text-lg font-bold text-amber-700">{stats.local}</div>
                <div className="text-[10px] font-medium text-amber-600 uppercase">Local</div>
              </div>
            </div>

            {/* Navigation */}
            <div className="space-y-1 mb-4">
              <button
                onClick={() => setActiveFolder(null)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeFolder === null ? "bg-stone-900 text-white shadow-md" : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span>All Rooms</span>
                <span className="ml-auto text-xs opacity-60">{rooms.length}</span>
              </button>
            </div>

            {/* Projects */}
            <div className="mb-2">
              {isLoadingProjects ? (
                <>
                  <div
                    className="flex items-center justify-between px-3 mb-2 gap-2"
                    aria-busy="true"
                    aria-label="กำลังโหลดโปรเจกต์"
                  >
                    <div className="h-3 w-[4.5rem] rounded bg-stone-200 animate-pulse" />
                    <div className="h-7 w-7 rounded-lg bg-stone-200 animate-pulse shrink-0" />
                  </div>
                  <div className="space-y-1">
                    {[0, 1].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      >
                        <div className="h-5 w-5 rounded-md bg-stone-200 animate-pulse shrink-0" />
                        <div className="h-4 flex-1 max-w-[9rem] rounded bg-stone-200/90 animate-pulse" />
                        <div className="h-3.5 w-4 rounded bg-stone-200 animate-pulse shrink-0" />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
              <div className="flex items-center justify-between px-3 mb-2 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider shrink-0">Projects</span>
                  {!isPro && planLimits.maxProjects !== null && (
                    <span className="text-[10px] font-semibold text-stone-400 truncate" title="Free plan project limit">
                      {folders.length}/{planLimits.maxProjects}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openFolderModal}
                  disabled={!canCreateMoreProjects}
                  className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  title={
                    canCreateMoreProjects
                      ? "New project"
                      : "แผนฟรีสร้างได้สูงสุด 5 โปรเจกต์ — อัปเกรด Pro เพื่อไม่จำกัด"
                  }
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              <div className="space-y-1">
                {folders.map((folder) => {
                  const colorObj = getFolderColorObj(folder.color);
                  return (
                    <div
                      key={folder.id}
                      className={`group relative ${dragOverFolder === folder.id ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
                      onDragOver={(e) => handleDragOver(e, folder.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={() => void handleDrop(folder.id)}
                    >
                      <button
                        onClick={() => setActiveFolder(folder.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          activeFolder === folder.id
                            ? `${colorObj.light} ${colorObj.text} shadow-sm ${colorObj.border} border`
                            : "text-stone-700 hover:bg-stone-100"
                        }`}
                      >
                        <div className="flex-shrink-0" style={{ color: folder.color }}>
                          <FolderIcon icon={folder.icon} className="w-5 h-5" />
                        </div>
                        <span className="truncate">{folder.name}</span>
                        <span className="ml-auto text-xs opacity-60 tabular-nums">
                          {!isPro && planLimits.maxPagesPerProject !== null
                            ? `${folder.roomIds.length}/${planLimits.maxPagesPerProject}`
                            : folder.roomIds.length}
                        </span>
                      </button>
                      {/* Folder context buttons */}
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); openEditFolderModal(folder.id); }}
                          className="p-1 rounded-md hover:bg-stone-200 text-stone-400 hover:text-stone-600 transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openDeleteFolderModal(folder.id); }}
                          className="p-1 rounded-md hover:bg-red-100 text-stone-400 hover:text-red-600 transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Uncategorized */}
                {uncategorizedCount > 0 && (
                  <button
                    onClick={() => setActiveFolder("__uncategorized")}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeFolder === "__uncategorized" ? "bg-stone-100 text-stone-700 shadow-sm" : "text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    <span>Uncategorized</span>
                    <span className="ml-auto text-xs opacity-60">{uncategorizedCount}</span>
                  </button>
                )}

                {folders.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-stone-400 mb-2">No projects yet</p>
                    <button onClick={openFolderModal}
                      className="text-xs font-medium text-stone-500 hover:text-stone-700 underline underline-offset-2">
                      Create your first project
                    </button>
                  </div>
                )}
              </div>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* ─── Main Content ─────────────────────────────── */}
        <main className="flex-1 min-w-0 px-6 lg:px-10 py-8">
          {isLoadingRooms ? (
            <div aria-busy="true" aria-label="กำลังโหลดห้อง">
              <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-8 rounded-lg bg-stone-200 animate-pulse shrink-0" />
                    <div className="h-8 w-40 rounded-lg bg-stone-200 animate-pulse" />
                  </div>
                  <div className="h-4 w-28 rounded bg-stone-200/90 animate-pulse mt-2" />
                </div>
                <div className="h-10 w-32 rounded-xl bg-stone-200 animate-pulse shrink-0" />
              </div>
              <div className="mb-6 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 h-11 rounded-xl bg-stone-200 animate-pulse" />
                <div className="h-11 w-full sm:w-[7.25rem] rounded-xl bg-stone-200 animate-pulse shrink-0" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col"
                  >
                    <div className="h-1 w-full bg-stone-200 animate-pulse" />
                    <div className="p-5 flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-14 rounded-md bg-stone-200 animate-pulse" />
                          <div className="h-5 w-20 rounded-md bg-stone-200 animate-pulse" />
                        </div>
                        <div className="h-3 w-12 rounded bg-stone-200 animate-pulse" />
                      </div>
                      <div className="h-5 w-full max-w-[14rem] rounded bg-stone-200 animate-pulse mb-3" />
                      <div className="h-3.5 w-36 rounded bg-stone-200/90 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <>
          {/* Page Header */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                {activeFolderData && activeFolder !== "__uncategorized" && (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: activeFolderData.color + "20", color: activeFolderData.color }}>
                    <FolderIcon icon={activeFolderData.icon} className="w-5 h-5" />
                  </div>
                )}
                <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
                  {activeFolderData ? activeFolderData.name : "All Rooms"}
                </h1>
              </div>
              <p className="text-sm text-stone-500 font-medium">
                {filteredRooms.length} room{filteredRooms.length !== 1 ? "s" : ""}
                {searchQuery && ` matching "${searchQuery}"`}
                {selectedTags.length > 0 && ` tagged ${selectedTags.join(", ")}`}
              </p>
              {activeFolder &&
                activeFolder !== "__uncategorized" &&
                activeFolderData &&
                activeFolderData.id !== "__uncategorized" &&
                !isPro &&
                planLimits.maxPagesPerProject !== null && (
                  <p className="text-xs text-stone-500 mt-1.5">
                    โปรเจกต์นี้: {activeFolderData.roomIds.length}/{planLimits.maxPagesPerProject} หน้า
                    <span className="text-stone-400"> — Pro ไม่จำกัด</span>
                  </p>
                )}
            </div>
            <button onClick={openCreateModal}
              className="inline-flex items-center px-5 py-2.5 text-sm font-bold rounded-xl shadow-sm text-white bg-stone-900 hover:bg-stone-800 transition-all hover:shadow-md">
              <svg className="-ml-0.5 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              New Room
            </button>
          </div>

          {/* Search and Controls */}
          <div className="mb-6 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-stone-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooms..."
                className="block w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-xl bg-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 text-sm font-medium text-stone-900" />
            </div>

            <div className="flex items-center bg-white border border-stone-200 rounded-xl p-1 gap-1">
              <button onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${viewMode === "grid" ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span className="text-xs font-bold hidden sm:inline">Grid</span>
              </button>
              <button onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${viewMode === "list" ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="text-xs font-bold hidden sm:inline">List</span>
              </button>
            </div>
          </div>

          {/* Tag Filters */}
          {allTags.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-medium text-stone-400 mr-1">Tags:</span>
              {allTags.map((tag) => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedTags.includes(tag)
                      ? "bg-stone-900 text-white shadow-sm"
                      : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300"
                  }`}>
                  {tag}
                  {selectedTags.includes(tag) && (
                    <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              ))}
              {selectedTags.length > 0 && (
                <button onClick={() => setSelectedTags([])} className="text-xs text-stone-400 hover:text-stone-600 underline underline-offset-2 ml-1">
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Room Cards */}
          {filteredRooms.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-stone-200">
              <svg className="mx-auto h-16 w-16 text-stone-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="text-lg font-bold text-stone-900 mb-1">No rooms found</h3>
              <p className="text-sm text-stone-500 mb-6">{searchQuery ? "Try adjusting your search." : "Create your first room to get started."}</p>
              {!searchQuery && (
                <button onClick={openCreateModal}
                  className="inline-flex items-center px-5 py-2.5 border border-stone-200 text-sm font-bold rounded-xl text-stone-900 bg-white hover:bg-stone-50 hover:border-yellow-400 transition-all shadow-sm">
                  <svg className="-ml-0.5 mr-2 h-4 w-4 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Create Room
                </button>
              )}
            </div>
          ) : (
            <>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {paginatedRooms.map((room) => {
                    const isSyncing = syncingRooms.has(room.id);
                    const lastSynced = room.lastSyncedAt
                      ? new Date(room.lastSyncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "numeric" })
                      : null;
                    const updatedAt = new Date(room.updatedAt || room.createdAt).toLocaleString("en-US", { month: "short", day: "numeric" });
                    const roomFolders = folders.filter((f) => f.roomIds.includes(room.id));

                    return (
                      <div key={room.id}
                        draggable
                        onDragStart={() => handleDragStart(room.id)}
                        className="group bg-white rounded-2xl border border-stone-200 hover:border-stone-300 hover:shadow-lg transition-all duration-200 flex flex-col overflow-hidden cursor-grab active:cursor-grabbing">
                        {/* Card top accent */}
                        <div className="h-1 w-full" style={{ background: roomFolders.length > 0 ? roomFolders[0].color : "#e7e5e4" }}></div>

                        <div className="p-5 flex-1">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {room.status === "local-only" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase">Local</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 uppercase">Synced</span>
                              )}
                              {roomFolders.map((f) => (
                                <span key={f.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border" style={{
                                  backgroundColor: f.color + "10", color: f.color, borderColor: f.color + "30"
                                }}>
                                  <FolderIcon icon={f.icon} className="w-3 h-3" />
                                  {f.name}
                                </span>
                              ))}
                            </div>
                            <span className="text-[11px] text-stone-400 font-medium">{updatedAt}</span>
                          </div>

                          <Link href={`/room/${room.id}`} className="block group/link">
                            <h3 className="text-base font-bold text-stone-900 mb-2 truncate group-hover/link:text-yellow-600 transition-colors" title={room.title}>
                              {room.title}
                            </h3>
                          </Link>

                          {room.tags && room.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {room.tags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-stone-100 text-stone-500">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="text-xs text-stone-400 flex items-center gap-1.5 font-medium">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {lastSynced ? `Synced ${lastSynced}` : "Not synced yet"}
                          </div>
                        </div>

                        <div className="px-5 py-3 bg-stone-50/50 border-t border-stone-100 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/room/${room.id}`} className="text-xs font-bold text-stone-900 hover:text-yellow-600 transition-colors flex items-center gap-1">
                            Open <span>&rarr;</span>
                          </Link>
                          <div className="flex items-center gap-0.5">
                            {room.status === "local-only" && (
                              <button onClick={() => handleSyncRoom(room.id)} disabled={isSyncing}
                                className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Sync">
                                <svg className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </button>
                            )}
                            {activeFolder && activeFolder !== "__uncategorized" && (
                              <button onClick={() => removeRoomFromFolder(room.id, activeFolder)}
                                className="p-1.5 text-stone-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Remove from project">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              </button>
                            )}
                            <button onClick={() => openEditModal(room.id)} className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors" title="Edit">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => openDeleteModal(room.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* List View */
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <table className="min-w-full divide-y divide-stone-100">
                    <thead className="bg-stone-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-stone-400 uppercase tracking-wider">Name</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-stone-400 uppercase tracking-wider">Project</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-stone-400 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-stone-400 uppercase tracking-wider">Last Synced</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold text-stone-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {paginatedRooms.map((room) => {
                        const isSyncing = syncingRooms.has(room.id);
                        const lastSynced = room.lastSyncedAt ? new Date(room.lastSyncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "numeric" }) : null;
                        const roomFolders = folders.filter((f) => f.roomIds.includes(room.id));

                        return (
                          <tr key={room.id} className="hover:bg-stone-50 transition-colors" draggable onDragStart={() => handleDragStart(room.id)}>
                            <td className="px-5 py-4">
                              <Link href={`/room/${room.id}`} className="text-sm font-bold text-stone-900 hover:text-yellow-600 transition-colors">
                                {room.title}
                              </Link>
                              {room.tags && room.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {room.tags.map((tag, i) => (
                                    <span key={i} className="text-[10px] font-medium text-stone-400">{tag}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap gap-1">
                                {roomFolders.length > 0 ? roomFolders.map((f) => (
                                  <span key={f.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium" style={{ backgroundColor: f.color + "15", color: f.color }}>
                                    <FolderIcon icon={f.icon} className="w-3 h-3" />{f.name}
                                  </span>
                                )) : <span className="text-xs text-stone-400">-</span>}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {room.status === "local-only" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 uppercase">Local</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-50 text-green-700 uppercase">Synced</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-xs text-stone-500 font-medium">{lastSynced || "Not yet"}</td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Link href={`/room/${room.id}`} className="text-xs font-bold text-stone-900 hover:text-yellow-600 mr-2">Open</Link>
                                {room.status === "local-only" && (
                                  <button onClick={() => handleSyncRoom(room.id)} disabled={isSyncing}
                                    className="p-1.5 text-stone-400 hover:text-blue-600 rounded-lg transition-colors" title="Sync">
                                    <svg className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                  </button>
                                )}
                                <button onClick={() => openEditModal(room.id)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg transition-colors" title="Edit">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button onClick={() => openDeleteModal(room.id)} className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg transition-colors" title="Delete">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex justify-center">
                  <nav className="inline-flex items-center gap-1" aria-label="Pagination">
                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}
                      className="p-2 rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button key={page} onClick={() => handlePageChange(page)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === page ? "bg-stone-900 text-white" : "border border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
                        }`}>
                        {page}
                      </button>
                    ))}
                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}
                      className="p-2 rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              )}
            </>
          )}
          </>
          )}
        </main>
      </div>

      {/* ─── Modals ─────────────────────────────────────── */}

      {/* Create Room Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create New Room"
        footer={<>
          <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-50">Cancel</button>
          <button onClick={handleCreateRoom} disabled={isSubmitting || !roomNameInput.trim() || isActiveProjectFull}
            className="px-4 py-2 text-sm font-bold text-stone-900 bg-yellow-400 rounded-xl hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmitting ? "Creating..." : "Create Room"}
          </button>
        </>}>
        <div className="space-y-4">
          <div>
            <label htmlFor="roomName" className="block text-sm font-medium text-stone-700 mb-1">Room Name</label>
            <input type="text" id="roomName" value={roomNameInput} onChange={(e) => setRoomNameInput(e.target.value)}
              placeholder="e.g. Project Alpha" autoFocus
              className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-yellow-500 focus:bg-white focus:ring-2 focus:ring-yellow-500/20 sm:text-sm font-medium"
              onKeyDown={(e) => { if (e.key === "Enter" && roomNameInput.trim() && !isActiveProjectFull) handleCreateRoom(); }} />
          </div>
          <div>
            <label htmlFor="roomTags" className="block text-sm font-medium text-stone-700 mb-1">Tags</label>
            <input type="text" id="roomTags" value={roomTagsInput} onChange={(e) => setRoomTagsInput(e.target.value)}
              placeholder="e.g. design, marketing (comma separated)"
              className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-yellow-500 focus:bg-white focus:ring-2 focus:ring-yellow-500/20 sm:text-sm font-medium"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateRoom(); }} />
            <p className="mt-1 text-xs text-stone-400">Separate multiple tags with commas</p>
          </div>
          {activeFolder && activeFolder !== "__uncategorized" && isActiveProjectFull && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl text-xs text-amber-900 border border-amber-100">
              โปรเจกต์นี้มีครบ {planLimits.maxPagesPerProject ?? 5} หน้าแล้ว (แผนฟรี) — ลบห้องออกจากโปรเจกต์หรืออัปเกรด Pro
            </div>
          )}
          {activeFolder && activeFolder !== "__uncategorized" && !isActiveProjectFull && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl text-xs text-blue-700">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Room will be added to &quot;{activeFolderData?.name}&quot; project
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Room Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Room"
        footer={<>
          <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-50">Cancel</button>
          <button onClick={handleEditRoom} disabled={isSubmitting || !roomNameInput.trim()}
            className="px-4 py-2 text-sm font-bold text-stone-900 bg-yellow-400 rounded-xl hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
        </>}>
        <div className="space-y-4">
          <div>
            <label htmlFor="editRoomName" className="block text-sm font-medium text-stone-700 mb-1">Room Name</label>
            <input type="text" id="editRoomName" value={roomNameInput} onChange={(e) => setRoomNameInput(e.target.value)} autoFocus
              className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-yellow-500 focus:bg-white focus:ring-2 focus:ring-yellow-500/20 sm:text-sm font-medium"
              onKeyDown={(e) => { if (e.key === "Enter" && roomNameInput.trim()) handleEditRoom(); }} />
          </div>
          <div>
            <label htmlFor="editRoomTags" className="block text-sm font-medium text-stone-700 mb-1">Tags</label>
            <input type="text" id="editRoomTags" value={roomTagsInput} onChange={(e) => setRoomTagsInput(e.target.value)}
              placeholder="e.g. design, marketing (comma separated)"
              className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-yellow-500 focus:bg-white focus:ring-2 focus:ring-yellow-500/20 sm:text-sm font-medium"
              onKeyDown={(e) => { if (e.key === "Enter") handleEditRoom(); }} />
            <p className="mt-1 text-xs text-stone-400">Separate multiple tags with commas</p>
          </div>
        </div>
      </Modal>

      {/* Delete Room Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Room"
        footer={<>
          <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-50">Cancel</button>
          <button onClick={handleDeleteRoom} disabled={isSubmitting}
            className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmitting ? "Deleting..." : "Delete Room"}
          </button>
        </>}>
        <p className="text-sm text-stone-500">Are you sure you want to delete this room? This action cannot be undone.</p>
      </Modal>

      {/* Create Folder Modal */}
      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Project"
        footer={<>
          <button onClick={() => setIsFolderModalOpen(false)} className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-50">Cancel</button>
          <button onClick={() => void handleCreateFolder()} disabled={!folderNameInput.trim() || folderActionPending}
            className="px-4 py-2 text-sm font-bold text-stone-900 bg-yellow-400 rounded-xl hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed">
            {folderActionPending ? "Creating..." : "Create Project"}
          </button>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Project Name</label>
            <input type="text" value={folderNameInput} onChange={(e) => setFolderNameInput(e.target.value)}
              placeholder="e.g. Marketing Campaign" autoFocus
              className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-yellow-500 focus:bg-white focus:ring-2 focus:ring-yellow-500/20 sm:text-sm font-medium"
              onKeyDown={(e) => { if (e.key === "Enter" && folderNameInput.trim() && !folderActionPending) void handleCreateFolder(); }} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Color</label>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_COLORS.map((c, i) => (
                <button key={c.value} onClick={() => setFolderColorIndex(i)}
                  className={`w-8 h-8 rounded-full transition-all ${folderColorIndex === i ? "ring-2 ring-offset-2 ring-stone-900 scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c.value }} title={c.name} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_ICONS.map((icon, i) => (
                <button key={icon} onClick={() => setFolderIconIndex(i)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    folderIconIndex === i ? "bg-stone-900 text-white shadow-md" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}>
                  <FolderIcon icon={icon} className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
          {/* Preview */}
          <div className="flex items-center gap-3 px-3 py-2 bg-stone-50 rounded-xl">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: FOLDER_COLORS[folderColorIndex].value + "20", color: FOLDER_COLORS[folderColorIndex].value }}>
              <FolderIcon icon={FOLDER_ICONS[folderIconIndex]} className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-stone-700">{folderNameInput || "Project Name"}</span>
          </div>
        </div>
      </Modal>

      {/* Edit Folder Modal */}
      <Modal isOpen={isEditFolderModalOpen} onClose={() => setIsEditFolderModalOpen(false)} title="Edit Project"
        footer={<>
          <button onClick={() => setIsEditFolderModalOpen(false)} className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-50">Cancel</button>
          <button onClick={() => void handleEditFolder()} disabled={!folderNameInput.trim() || folderActionPending}
            className="px-4 py-2 text-sm font-bold text-stone-900 bg-yellow-400 rounded-xl hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed">
            {folderActionPending ? "Saving..." : "Save Changes"}
          </button>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Project Name</label>
            <input type="text" value={folderNameInput} onChange={(e) => setFolderNameInput(e.target.value)} autoFocus
              className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-yellow-500 focus:bg-white focus:ring-2 focus:ring-yellow-500/20 sm:text-sm font-medium"
              onKeyDown={(e) => { if (e.key === "Enter" && folderNameInput.trim() && !folderActionPending) void handleEditFolder(); }} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Color</label>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_COLORS.map((c, i) => (
                <button key={c.value} onClick={() => setFolderColorIndex(i)}
                  className={`w-8 h-8 rounded-full transition-all ${folderColorIndex === i ? "ring-2 ring-offset-2 ring-stone-900 scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c.value }} title={c.name} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_ICONS.map((icon, i) => (
                <button key={icon} onClick={() => setFolderIconIndex(i)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    folderIconIndex === i ? "bg-stone-900 text-white shadow-md" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}>
                  <FolderIcon icon={icon} className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Folder Modal */}
      <Modal isOpen={isDeleteFolderModalOpen} onClose={() => setIsDeleteFolderModalOpen(false)} title="Delete Project"
        footer={<>
          <button onClick={() => setIsDeleteFolderModalOpen(false)} className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-50">Cancel</button>
          <button onClick={() => void handleDeleteFolder()} disabled={folderActionPending}
            className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {folderActionPending ? "Deleting..." : "Delete Project"}
          </button>
        </>}>
        <p className="text-sm text-stone-500">
          Are you sure you want to delete this project? The rooms inside will not be deleted, they will just become uncategorized.
        </p>
      </Modal>
    </div>
  );
}
