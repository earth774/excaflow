"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loadRooms, addRoom, deleteRoom, getLastSavedTime } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import type { Room } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      } catch (err) {
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

    // Load rooms
    const loadedRooms = loadRooms();
    setRooms(loadedRooms);
    setFilteredRooms(loadedRooms);

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredRooms(rooms);
    } else {
      const filtered = rooms.filter((room) =>
        room.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredRooms(filtered);
    }
  }, [searchQuery, rooms]);

  const handleCreateRoom = (name?: string) => {
    const roomName = name || newRoomName.trim();
    if (!roomName) return;

    const roomId = roomName.toLowerCase().replace(/\s+/g, "-");
    const newRoom: Room = {
      id: roomId,
      name: roomName,
      createdAt: Date.now(),
    };

    addRoom(newRoom);
    const updatedRooms = loadRooms();
    setRooms(updatedRooms);
    setFilteredRooms(updatedRooms);
    setNewRoomName("");
  };

  const handleDeleteRoom = (roomId: string) => {
    if (confirm("คุณต้องการลบห้องนี้หรือไม่?")) {
      deleteRoom(roomId);
      const updatedRooms = loadRooms();
      setRooms(updatedRooms);
      setFilteredRooms(updatedRooms);
    }
  };

  const handleEditRoom = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      const newName = prompt("แก้ไขชื่อห้อง:", room.name);
      if (newName && newName.trim()) {
        const updatedRooms = rooms.map((r) =>
          r.id === roomId ? { ...r, name: newName.trim() } : r
        );
        // Update localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("excalidraw-rooms", JSON.stringify(updatedRooms));
        }
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
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="3" width="18" height="18" rx="2" fill="#FF6B35"/>
                  <rect x="6" y="6" width="6" height="6" rx="1" fill="#F7B801"/>
                  <rect x="12" y="6" width="6" height="6" rx="1" fill="#4ECDC4"/>
                  <rect x="6" y="12" width="6" height="6" rx="1" fill="#45B7D1"/>
                  <rect x="12" y="12" width="6" height="6" rx="1" fill="#96CEB4"/>
                </svg>
              </span>
              Excalidraw Local Room
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
                <p>{searchQuery ? "ลองค้นหาด้วยคำอื่น" : "สร้างห้องใหม่เพื่อเริ่มวาดภาพ"}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRooms.map((room) => {
                  const lastSaved = getLastSavedTime(room.id);
                  return (
                    <div
                      key={room.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800 text-lg mb-2">
                            {room.name}
                          </h3>
                          {lastSaved ? (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <span>💾</span>
                              <span>มีข้อมูลบันทึกไว้ (อัปเดตล่าสุด: {lastSaved})</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <span>💾</span>
                              <span>ยังไม่มีข้อมูลบันทึก</span>
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
