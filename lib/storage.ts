import type { DrawingData, Room } from "./types";

const ROOMS_KEY = "excalidraw-rooms";
const ROOM_DATA_PREFIX = "excalidraw-room-";
const ROOM_LAST_SAVED_PREFIX = "excalidraw-room-";
const ROOM_LAST_SAVED_SUFFIX = "-last-saved";

// Room management
export function loadRooms(): Room[] {
  if (typeof window === "undefined") return [];
  
  try {
    const data = localStorage.getItem(ROOMS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error loading rooms:", error);
    return [];
  }
}

export function saveRooms(rooms: Room[]): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  } catch (error) {
    console.error("Error saving rooms:", error);
  }
}

export function addRoom(room: Room): void {
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
    localStorage.removeItem(`${ROOM_DATA_PREFIX}${roomId}`);
    localStorage.removeItem(`${ROOM_LAST_SAVED_PREFIX}${roomId}${ROOM_LAST_SAVED_SUFFIX}`);
  } catch (error) {
    console.error("Error deleting room data:", error);
  }
}

// Drawing data management
export function loadDrawingData(roomId: string): DrawingData | null {
  if (typeof window === "undefined") return null;
  
  try {
    const data = localStorage.getItem(`${ROOM_DATA_PREFIX}${roomId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error loading drawing data:", error);
    return null;
  }
}

export function saveDrawingData(roomId: string, data: DrawingData): void {
  if (typeof window === "undefined") return;
  
  try {
    // Convert readonly array to regular array for JSON serialization
    const drawingData: DrawingData = {
      elements: [...data.elements],
      appState: { ...data.appState },
      timestamp: Date.now(),
    };
    localStorage.setItem(`${ROOM_DATA_PREFIX}${roomId}`, JSON.stringify(drawingData));
    
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
      `${ROOM_LAST_SAVED_PREFIX}${roomId}${ROOM_LAST_SAVED_SUFFIX}`,
      timestamp
    );
  } catch (error) {
    console.error("Error saving drawing data:", error);
  }
}

export function getLastSavedTime(roomId: string): string | null {
  if (typeof window === "undefined") return null;
  
  try {
    return localStorage.getItem(`${ROOM_LAST_SAVED_PREFIX}${roomId}${ROOM_LAST_SAVED_SUFFIX}`);
  } catch (error) {
    console.error("Error getting last saved time:", error);
    return null;
  }
}

