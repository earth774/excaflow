// Using any for storage compatibility - types will be enforced at component level
export interface DrawingData {
  elements: readonly any[];
  appState: Partial<any>;
  timestamp: number;
}

// Excalidraw scene structure
export interface ExcalidrawScene {
  elements: readonly any[];
  appState: Partial<any>;
  files?: Record<string, any>;
}

// Room status for sync tracking
export type RoomStatus = "local-only" | "synced";

// Room metadata for index (lightweight)
export interface RoomIndexEntry {
  id: string;
  title: string;
  description?: string;
  status: RoomStatus;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastSyncedAt: string | null; // ISO string or null
}

// Full room data stored in localStorage
export interface LocalRoom {
  id: string;
  title: string;
  description?: string;
  scene: ExcalidrawScene;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastSyncedAt: string | null; // ISO string or null
  status: RoomStatus;
}

// Room from database (Prisma)
export interface Room {
  id: string;
  title: string;
  description: string | null;
  scene: ExcalidrawScene;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date | null;
}

// Legacy Room type for backward compatibility (deprecated)
export interface LegacyRoom {
  id: string;
  name: string;
  createdAt: number;
}

export type SaveStatus = "saved" | "unsaved" | "saving";

