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
          await saveLocalRoom(localRoom);
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
      await saveLocalRoom(localRoom);
      
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
      const localRoom = await loadLocalRoom(roomId);
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
      await markRoomAsSynced(
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

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm("คุณต้องการลบห้องนี้หรือไม่?")) {
      return;
    }

    try {
      // Try to delete from database first (always try, regardless of sync status)
      try {
        const response = await authenticatedFetch(`/api/rooms/${roomId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          // If room doesn't exist in DB (404), that's okay - continue with local deletion
          if (response.status !== 404) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to delete room from server");
          }
        }
      } catch (error) {
        console.error("Error deleting room from server:", error);
        // Continue to delete locally even if server deletion fails
        // This allows offline deletion
      }

      // Delete from localStorage
      await deleteLocalRoom(roomId);
      
      // Refresh rooms list
      const updatedRooms = loadRoomsIndex();
      setRooms(updatedRooms);
      setFilteredRooms(updatedRooms);
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("ไม่สามารถลบห้องได้ กรุณาลองอีกครั้ง");
    }
  };

  const handleEditRoom = async (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      const newTitle = prompt("แก้ไขชื่อห้อง:", room.title);
      if (newTitle && newTitle.trim()) {
        await updateLocalRoomMetadata(roomId, { title: newTitle.trim() });
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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
          <div className="text-lg text-gray-500 font-medium">Loading your space...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white p-2 rounded-lg">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600">
                Excaflow Rooms
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                {user.email}
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-700 font-medium text-sm transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Your Creative Space</h1>
            <p className="mt-2 text-gray-600">Manage your drawings and collaborate with others.</p>
          </div>
          <button
            onClick={() => {
              const name = prompt("Enter room name:");
              if (name && name.trim()) {
                handleCreateRoom(name.trim());
              }
            }}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition-all transform hover:-translate-y-0.5"
          >
            <svg className="-ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Room
          </button>
        </div>

        {/* Search and Filter */}
        <div className="mb-8">
          <div className="relative max-w-lg">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rooms..."
              className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent sm:text-sm shadow-sm transition-all"
            />
          </div>
        </div>

        {/* Rooms Grid */}
        {filteredRooms.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
            <div className="mx-auto h-24 w-24 text-gray-300 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="mt-2 text-lg font-medium text-gray-900">No rooms found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery ? "Try adjusting your search terms." : "Get started by creating a new room."}
            </p>
            {!searchQuery && (
              <div className="mt-6">
                <button
                  onClick={() => {
                    const name = prompt("Enter room name:");
                    if (name && name.trim()) {
                      handleCreateRoom(name.trim());
                    }
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-violet-600 bg-violet-50 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Create Room
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRooms.map((room) => {
              const isSyncing = syncingRooms.has(room.id);
              const lastSynced = room.lastSyncedAt
                ? new Date(room.lastSyncedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                  })
                : null;

              return (
                <div
                  key={room.id}
                  className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden"
                >
                  <div className="p-6 flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-2 bg-violet-50 rounded-lg text-violet-600 group-hover:bg-violet-100 transition-colors">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="flex items-center gap-2">
                        {room.status === "local-only" ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Local
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Synced
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate" title={room.title}>
                      {room.title}
                    </h3>
                    
                    <div className="text-sm text-gray-500 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      {lastSynced ? `Synced ${lastSynced}` : "Not synced yet"}
                    </div>
                  </div>

                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <Link
                      href={`/room/${room.id}`}
                      className="text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
                    >
                      Open Room &rarr;
                    </Link>
                    
                    <div className="flex items-center gap-1">
                      {room.status === "local-only" && (
                        <button
                          onClick={() => handleSyncRoom(room.id)}
                          disabled={isSyncing}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="Sync to server"
                        >
                          <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                          </svg>
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleEditRoom(room.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        title="Rename"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                      </button>
                      
                      <button
                        onClick={() => handleDeleteRoom(room.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
