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
export function loadLocalRoom(roomId: string): LocalRoom | null {
  if (typeof window === "undefined") return null;

  try {
    const data = localStorage.getItem(`${ROOM_DATA_PREFIX}${roomId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error loading local room:", error);
    return null;
  }
}

export function saveLocalRoom(room: LocalRoom): void {
  if (typeof window === "undefined") {
    console.warn("saveLocalRoom: window is undefined");
    return;
  }

  try {
    const key = `${ROOM_DATA_PREFIX}${room.id}`;
    const data = JSON.stringify(room);
    localStorage.setItem(key, data);
    
    console.log("saveLocalRoom: Saved to localStorage:", key, {
      title: room.title,
      updatedAt: room.updatedAt,
      dataSize: data.length,
    });
    
    // Also update index
    addRoomToIndex({
      id: room.id,
      title: room.title,
      description: room.description,
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      lastSyncedAt: room.lastSyncedAt,
    });
  } catch (error) {
    console.error("Error saving local room:", error);
    // Check if it's a quota exceeded error
    if (error instanceof DOMException && error.code === 22) {
      console.error("localStorage quota exceeded!");
    }
  }
}

export function deleteLocalRoom(roomId: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(`${ROOM_DATA_PREFIX}${roomId}`);
    removeRoomFromIndex(roomId);
  } catch (error) {
    console.error("Error deleting local room:", error);
  }
}

// Create a new room in localStorage (offline-first)
export function createLocalRoom(
  title: string,
  description?: string,
  roomId?: string
): LocalRoom {
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
  };

  saveLocalRoom(newRoom);
  return newRoom;
}

// Update room scene (for auto-save)
export function updateLocalRoomScene(
  roomId: string,
  scene: ExcalidrawScene
): void {
  if (typeof window === "undefined") {
    console.warn("updateLocalRoomScene: window is undefined");
    return;
  }

  const room = loadLocalRoom(roomId);
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

  saveLocalRoom(updatedRoom);
}

// Update room metadata (title, description)
export function updateLocalRoomMetadata(
  roomId: string,
  updates: { title?: string; description?: string }
): void {
  const room = loadLocalRoom(roomId);
  if (!room) return;

  const updatedRoom: LocalRoom = {
    ...room,
    ...updates,
    updatedAt: new Date().toISOString(),
    status: room.status === "synced" ? "local-only" : room.status,
  };

  saveLocalRoom(updatedRoom);
}

// Mark room as synced (after successful sync)
export function markRoomAsSynced(roomId: string, lastSyncedAt: string): void {
  const room = loadLocalRoom(roomId);
  if (!room) return;

  const updatedRoom: LocalRoom = {
    ...room,
    status: "synced",
    lastSyncedAt,
  };

  saveLocalRoom(updatedRoom);
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
export function loadDrawingData(roomId: string): DrawingData | null {
  // Try new format first
  const localRoom = loadLocalRoom(roomId);
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

export function saveDrawingData(roomId: string, data: DrawingData): void {
  if (typeof window === "undefined") return;

  try {
    // Try to update existing local room
    const existingRoom = loadLocalRoom(roomId);
    if (existingRoom) {
      updateLocalRoomScene(roomId, {
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

export function getLastSavedTime(roomId: string): string | null {
  // Try new format first
  const localRoom = loadLocalRoom(roomId);
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
