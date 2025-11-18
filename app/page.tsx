"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import type { RoomIndexEntry, LocalRoom } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<RoomIndexEntry[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<RoomIndexEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingRooms, setSyncingRooms] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsClient(true);

    // Check auth state
    const checkAuth = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.push("/login");
          return;
        }
        setUser(user);
        setIsLoading(false);
      } catch {
        router.push("/login");
      }
    };

    checkAuth();

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login");
      } else {
        setUser(session.user);
        setIsLoading(false);
      }
    });

    // Load rooms from localStorage index
    const loadedRooms = loadRoomsIndex();
    setRooms(loadedRooms);
    setFilteredRooms(loadedRooms);

    // Optionally sync with server in background
    syncRoomsFromServer(loadedRooms);

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredRooms(rooms);
    } else {
      const filtered = rooms.filter((room) =>
        room.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredRooms(filtered);
    }
  }, [searchQuery, rooms]);

  const syncRoomsFromServer = async (localRooms: RoomIndexEntry[]) => {
    try {
      const response = await authenticatedFetch("/api/rooms");
      if (!response.ok) return;
      const serverRooms = await response.json();

      // Merge server rooms that don't exist locally
      const localIds = new Set(localRooms.map((r) => r.id));
      const newRooms: RoomIndexEntry[] = [];

      for (const serverRoom of serverRooms) {
        if (!localIds.has(serverRoom.id)) {
          // Room exists on server but not locally - add to local index
          newRooms.push({
            id: serverRoom.id,
            title: serverRoom.title,
            description: serverRoom.description || undefined,
            status: "synced",
            createdAt: new Date(serverRoom.createdAt).toISOString(),
            updatedAt: new Date(serverRoom.updatedAt).toISOString(),
            lastSyncedAt: serverRoom.lastSyncedAt
              ? new Date(serverRoom.lastSyncedAt).toISOString()
              : null,
          });
          
          // Also save full room data to localStorage for draft management
          const localRoom: LocalRoom = {
            id: serverRoom.id,
            title: serverRoom.title,
            description: serverRoom.description || undefined,
            scene: serverRoom.scene,
            createdAt: new Date(serverRoom.createdAt).toISOString(),
            updatedAt: new Date(serverRoom.updatedAt).toISOString(),
            lastSyncedAt: serverRoom.lastSyncedAt
              ? new Date(serverRoom.lastSyncedAt).toISOString()
              : null,
            status: "synced",
          };
          saveLocalRoom(localRoom);
        }
      }

      if (newRooms.length > 0) {
        const updated = [...localRooms, ...newRooms];
        setRooms(updated);
        setFilteredRooms(updated);
      }
    } catch (error) {
      console.error("Error syncing rooms from server:", error);
    }
  };

  const handleCreateRoom = async (name?: string) => {
    const roomName = name?.trim();
    if (!roomName) return;

    try {
      // Create room in database immediately (not in localStorage)
      const response = await authenticatedFetch("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          title: roomName,
          description: undefined,
          scene: {
            elements: [],
            appState: {},
            files: {},
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const dbRoom = await response.json();
      
      // Save to localStorage for draft management
      const localRoom: LocalRoom = {
        id: dbRoom.id,
        title: dbRoom.title,
        description: dbRoom.description || undefined,
        scene: dbRoom.scene,
        createdAt: new Date(dbRoom.createdAt).toISOString(),
        updatedAt: new Date(dbRoom.updatedAt).toISOString(),
        lastSyncedAt: dbRoom.lastSyncedAt
          ? new Date(dbRoom.lastSyncedAt).toISOString()
          : null,
        status: "synced",
      };
      saveLocalRoom(localRoom);
      
      // Update rooms list
      const updatedRooms = loadRoomsIndex();
      setRooms(updatedRooms);
      setFilteredRooms(updatedRooms);
      
      // Redirect to room page
      router.push(`/room/${dbRoom.id}`);
    } catch (error) {
      console.error("Error creating room:", error);
      alert("ไม่สามารถสร้างห้องได้ กรุณาลองอีกครั้ง");
    }
  };

  const handleSyncRoom = async (roomId: string) => {
    if (syncingRooms.has(roomId)) return;

    setSyncingRooms((prev) => new Set(prev).add(roomId));

    try {
      // Load room data from localStorage
      const localRoom = loadLocalRoom(roomId);
      if (!localRoom) {
        throw new Error("Room not found in localStorage");
      }

      // Sync to server (push)
      const response = await authenticatedFetch("/api/rooms/sync", {
        method: "POST",
        body: JSON.stringify({
          id: localRoom.id,
          title: localRoom.title,
          description: localRoom.description,
          scene: localRoom.scene,
          updatedAt: localRoom.updatedAt,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to sync room");
      }

      const syncedRoom = await response.json();

      // Mark as synced in localStorage
      markRoomAsSynced(
        roomId,
        syncedRoom.lastSyncedAt
          ? new Date(syncedRoom.lastSyncedAt).toISOString()
          : new Date().toISOString()
      );

      // Refresh rooms list
      const updatedRooms = loadRoomsIndex();
      setRooms(updatedRooms);
      setFilteredRooms(updatedRooms);
    } catch (error) {
      console.error("Error syncing room:", error);
      alert("ไม่สามารถ sync ห้องได้ กรุณาลองอีกครั้ง");
    } finally {
      setSyncingRooms((prev) => {
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      });
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    if (confirm("คุณต้องการลบห้องนี้หรือไม่?")) {
      deleteLocalRoom(roomId);
      const updatedRooms = loadRoomsIndex();
      setRooms(updatedRooms);
      setFilteredRooms(updatedRooms);
    }
  };

  const handleEditRoom = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      const newTitle = prompt("แก้ไขชื่อห้อง:", room.title);
      if (newTitle && newTitle.trim()) {
        updateLocalRoomMetadata(roomId, { title: newTitle.trim() });
        const updatedRooms = loadRoomsIndex();
        setRooms(updatedRooms);
        setFilteredRooms(updatedRooms);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!isClient || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-lg text-gray-600">กำลังโหลด...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Top Bar - User Info */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="text-gray-700 font-medium">{user.email}</div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          {/* Header with Title and Create Button */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-purple-600 mb-4 md:mb-0 flex items-center gap-3">
              <span className="relative inline-block">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" fill="#FF6B35" />
                  <rect x="6" y="6" width="6" height="6" rx="1" fill="#F7B801" />
                  <rect x="12" y="6" width="6" height="6" rx="1" fill="#4ECDC4" />
                  <rect x="6" y="12" width="6" height="6" rx="1" fill="#45B7D1" />
                  <rect x="12" y="12" width="6" height="6" rx="1" fill="#96CEB4" />
                </svg>
              </span>
              Excalidraw Rooms
            </h1>
            <button
              onClick={() => {
                const name = prompt("ใส่ชื่อห้องใหม่:");
                if (name && name.trim()) {
                  handleCreateRoom(name.trim());
                }
              }}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md transition-all whitespace-nowrap"
            >
              + สร้างห้องใหม่
            </button>
          </div>

          {/* Rooms List Header with Search */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-3 md:mb-0">
              ห้องที่มีอยู่
            </h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาห้อง..."
              className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Rooms List */}
          <div>
            {filteredRooms.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">
                  {searchQuery ? "ไม่พบห้องที่ค้นหา" : "ยังไม่มีห้อง"}
                </p>
                <p>
                  {searchQuery
                    ? "ลองค้นหาด้วยคำอื่น"
                    : "สร้างห้องใหม่เพื่อเริ่มวาดภาพ"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRooms.map((room) => {
                  const isSyncing = syncingRooms.has(room.id);
                  const lastSynced = room.lastSyncedAt
                    ? new Date(room.lastSyncedAt).toLocaleString("th-TH", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : null;

                  return (
                    <div
                      key={room.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-800 text-lg">
                              {room.title}
                            </h3>
                            {room.status === "local-only" ? (
                              <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                                Local only
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                                Synced
                              </span>
                            )}
                          </div>
                          {lastSynced && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <span>💾</span>
                              <span>Sync ล่าสุด: {lastSynced}</span>
                            </div>
                          )}
                          {room.status === "local-only" && (
                            <div className="flex items-center gap-2 text-sm text-yellow-600 mt-1">
                              <span>⚠️</span>
                              <span>ยังไม่ได้ sync ไปยัง server</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Link
                            href={`/room/${room.id}`}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-all text-sm whitespace-nowrap"
                          >
                            เข้าห้อง
                          </Link>
                          {room.status === "local-only" && (
                            <button
                              onClick={() => handleSyncRoom(room.id)}
                              disabled={isSyncing}
                              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
                            >
                              {isSyncing ? "กำลัง sync..." : "Sync"}
                            </button>
                          )}
                          <button
                            onClick={() => handleEditRoom(room.id)}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
