import { get, set, del } from "idb-keyval";
import type {
  LocalRoom,
  RoomIndexEntry,
  RoomStatus,
  ExcalidrawScene,
  DrawingData,
  LegacyRoom,
} from "./types";

// New storage keys according to plan
const ROOMS_INDEX_KEY = "excalidraw:rooms:index";
const ROOM_DATA_PREFIX = "excalidraw:room:";

// Legacy keys for backward compatibility
const LEGACY_ROOMS_KEY = "excalidraw-rooms";
const LEGACY_ROOM_DATA_PREFIX = "excalidraw-room-";
const LEGACY_ROOM_LAST_SAVED_PREFIX = "excalidraw-room-";
const LEGACY_ROOM_LAST_SAVED_SUFFIX = "-last-saved";

// Helper to generate room ID (cuid-like or UUID)
export function generateRoomId(): string {
  if (typeof window === "undefined") {
    return `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ===== NEW STORAGE API (according to plan) =====

// Room Index Management
export function loadRoomsIndex(): RoomIndexEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const data = localStorage.getItem(ROOMS_INDEX_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error loading rooms index:", error);
    return [];
  }
}

export function saveRoomsIndex(index: RoomIndexEntry[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(ROOMS_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error("Error saving rooms index:", error);
  }
}

export function addRoomToIndex(entry: RoomIndexEntry): void {
  const index = loadRoomsIndex();
  // Remove if exists (update case)
  const filtered = index.filter((r) => r.id !== entry.id);
  filtered.push(entry);
  saveRoomsIndex(filtered);
}

export function removeRoomFromIndex(roomId: string): void {
  const index = loadRoomsIndex();
  const filtered = index.filter((r) => r.id !== roomId);
  saveRoomsIndex(filtered);
}

export function updateRoomInIndex(
  roomId: string,
  updates: Partial<RoomIndexEntry>
): void {
  const index = loadRoomsIndex();
  const updated = index.map((r) =>
    r.id === roomId ? { ...r, ...updates } : r
  );
  saveRoomsIndex(updated);
}

// Individual Room Data Management
export async function loadLocalRoom(roomId: string): Promise<LocalRoom | null> {
  if (typeof window === "undefined") return null;

  try {
    // Try loading from IndexedDB first
    const key = `${ROOM_DATA_PREFIX}${roomId}`;
    const data = await get<LocalRoom>(key);
    
    if (data) {
      return data;
    }

    // Fallback: Try loading from localStorage (migration path)
    const localData = localStorage.getItem(key);
    if (localData) {
      try {
        const parsedData = JSON.parse(localData);
        // Migrate to IndexedDB
        await set(key, parsedData);
        // Optional: Remove from localStorage after successful migration
        // localStorage.removeItem(key); 
        return parsedData;
      } catch (e) {
        console.error("Error parsing localStorage data during migration:", e);
      }
    }

    return null;
  } catch (error) {
    console.error("Error loading local room:", error);
    return null;
  }
}

export async function saveLocalRoom(room: LocalRoom): Promise<void> {
  if (typeof window === "undefined") {
    console.warn("saveLocalRoom: window is undefined");
    return;
  }

  try {
    // Optimize storage: remove base64 dataURL if supabaseUrl exists
    const roomToSave = { ...room };
    if (roomToSave.scene && roomToSave.scene.files) {
      const optimizedFiles: Record<string, any> = {};
      let optimizedCount = 0;
      
      for (const [fileId, file] of Object.entries(roomToSave.scene.files)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileData = file as any;
        
        if (fileData.supabaseUrl && fileData.dataURL && fileData.dataURL.startsWith("data:")) {
          // Keep supabaseUrl, remove huge base64 dataURL
          // We'll restore it from supabaseUrl when loading (in prepareInitialScene)
          const { dataURL, ...rest } = fileData;
          optimizedFiles[fileId] = rest;
          optimizedCount++;
        } else {
          optimizedFiles[fileId] = fileData;
        }
      }
      
      if (optimizedCount > 0) {
        roomToSave.scene = {
          ...roomToSave.scene,
          files: optimizedFiles,
        };
        console.log(`saveLocalRoom: Optimized ${optimizedCount} files by removing base64 data`);
      }
    }

    const key = `${ROOM_DATA_PREFIX}${room.id}`;
    
    // Save to IndexedDB
    await set(key, roomToSave);
    
    console.log("saveLocalRoom: Saved to IndexedDB:", key, {
      title: room.title,
      updatedAt: room.updatedAt,
    });
    
    // Also update index (synchronous, in localStorage)
    addRoomToIndex({
      id: room.id,
      title: room.title,
      description: room.description,
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      lastSyncedAt: room.lastSyncedAt,
      tags: room.tags || [],
    });
  } catch (error) {
    console.error("Error saving local room:", error);
  }
}

export async function deleteLocalRoom(roomId: string): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const key = `${ROOM_DATA_PREFIX}${roomId}`;
    
    // Delete from IndexedDB
    await del(key);
    
    // Also try to delete from localStorage (cleanup)
    localStorage.removeItem(key);
    
    removeRoomFromIndex(roomId);
  } catch (error) {
    console.error("Error deleting local room:", error);
  }
}

// Create a new room in IndexedDB (offline-first)
export async function createLocalRoom(
  title: string,
  description?: string,
  tags: string[] = [],
  roomId?: string
): Promise<LocalRoom> {
  const now = new Date().toISOString();
  const id = roomId || generateRoomId();

  const newRoom: LocalRoom = {
    id,
    title,
    description,
    scene: {
      elements: [],
      appState: {},
      files: {},
    },
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: null,
    status: "local-only",
    tags,
  };

  await saveLocalRoom(newRoom);
  return newRoom;
}

// Update room scene (for auto-save)
export async function updateLocalRoomScene(
  roomId: string,
  scene: ExcalidrawScene
): Promise<void> {
  if (typeof window === "undefined") {
    console.warn("updateLocalRoomScene: window is undefined");
    return;
  }

  const room = await loadLocalRoom(roomId);
  if (!room) {
    console.warn("updateLocalRoomScene: Room not found:", roomId);
    return;
  }

  const updatedRoom: LocalRoom = {
    ...room,
    scene,
    updatedAt: new Date().toISOString(),
    // If previously synced, mark as local-only after update
    status: room.status === "synced" ? "local-only" : room.status,
  };

  console.log("updateLocalRoomScene: Saving room:", roomId, {
    elementsCount: scene.elements?.length || 0,
    hasAppState: !!scene.appState,
    hasFiles: !!scene.files,
  });

  await saveLocalRoom(updatedRoom);
}

// Update room metadata (title, description)
export async function updateLocalRoomMetadata(
  roomId: string,
  updates: { title?: string; description?: string; tags?: string[] }
): Promise<void> {
  const room = await loadLocalRoom(roomId);
  if (!room) return;

  const updatedRoom: LocalRoom = {
    ...room,
    ...updates,
    updatedAt: new Date().toISOString(),
    status: room.status === "synced" ? "local-only" : room.status,
  };

  await saveLocalRoom(updatedRoom);
}

// Mark room as synced (after successful sync)
export async function markRoomAsSynced(roomId: string, lastSyncedAt: string): Promise<void> {
  const room = await loadLocalRoom(roomId);
  if (!room) return;

  const updatedRoom: LocalRoom = {
    ...room,
    status: "synced",
    lastSyncedAt,
  };

  await saveLocalRoom(updatedRoom);
}

// ===== LEGACY API (for backward compatibility) =====

// Room management (legacy)
export function loadRooms(): LegacyRoom[] {
  if (typeof window === "undefined") return [];

  try {
    const data = localStorage.getItem(LEGACY_ROOMS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error loading rooms:", error);
    return [];
  }
}

export function saveRooms(rooms: LegacyRoom[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(LEGACY_ROOMS_KEY, JSON.stringify(rooms));
  } catch (error) {
    console.error("Error saving rooms:", error);
  }
}

export function addRoom(room: LegacyRoom): void {
  const rooms = loadRooms();
  rooms.push(room);
  saveRooms(rooms);
}

export function deleteRoom(roomId: string): void {
  // Remove from rooms list
  const rooms = loadRooms();
  const filteredRooms = rooms.filter((room) => room.id !== roomId);
  saveRooms(filteredRooms);

  // Remove room data
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${LEGACY_ROOM_DATA_PREFIX}${roomId}`);
    localStorage.removeItem(
      `${LEGACY_ROOM_LAST_SAVED_PREFIX}${roomId}${LEGACY_ROOM_LAST_SAVED_SUFFIX}`
    );
  } catch (error) {
    console.error("Error deleting room data:", error);
  }
}

// Drawing data management (legacy)
export async function loadDrawingData(roomId: string): Promise<DrawingData | null> {
  // Try new format first
  const localRoom = await loadLocalRoom(roomId);
  if (localRoom) {
    return {
      elements: localRoom.scene.elements,
      appState: localRoom.scene.appState,
      timestamp: new Date(localRoom.updatedAt).getTime(),
    };
  }

  // Fallback to legacy format
  if (typeof window === "undefined") return null;

  try {
    const data = localStorage.getItem(`${LEGACY_ROOM_DATA_PREFIX}${roomId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error loading drawing data:", error);
    return null;
  }
}

export async function saveDrawingData(roomId: string, data: DrawingData): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    // Try to update existing local room
    const existingRoom = await loadLocalRoom(roomId);
    if (existingRoom) {
      await updateLocalRoomScene(roomId, {
        elements: data.elements,
        appState: data.appState,
        files: existingRoom.scene.files || {},
      });
      return;
    }

    // Fallback to legacy format
    const drawingData: DrawingData = {
      elements: [...data.elements],
      appState: { ...data.appState },
      timestamp: Date.now(),
    };
    localStorage.setItem(
      `${LEGACY_ROOM_DATA_PREFIX}${roomId}`,
      JSON.stringify(drawingData)
    );

    // Save last saved timestamp
    const timestamp = new Date().toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    localStorage.setItem(
      `${LEGACY_ROOM_LAST_SAVED_PREFIX}${roomId}${LEGACY_ROOM_LAST_SAVED_SUFFIX}`,
      timestamp
    );
  } catch (error) {
    console.error("Error saving drawing data:", error);
  }
}

export async function getLastSavedTime(roomId: string): Promise<string | null> {
  // Try new format first
  const localRoom = await loadLocalRoom(roomId);
  if (localRoom && localRoom.updatedAt) {
    return new Date(localRoom.updatedAt).toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  // Fallback to legacy format
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(
      `${LEGACY_ROOM_LAST_SAVED_PREFIX}${roomId}${LEGACY_ROOM_LAST_SAVED_SUFFIX}`
    );
  } catch (error) {
    console.error("Error getting last saved time:", error);
    return null;
  }
}
