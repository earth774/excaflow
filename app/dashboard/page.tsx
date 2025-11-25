"use client";

import { useState, useEffect } from "react";
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
  const [isPro, setIsPro] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

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
        fetchSubscriptionStatus();
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
        fetchSubscriptionStatus();
      }
    });

    // Load rooms from localStorage index and sort by updatedAt (most recent first)
    const loadedRooms = loadRoomsIndex().sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt).getTime();
      return dateB - dateA; // Descending order (newest first)
    });
    setRooms(loadedRooms);
    setFilteredRooms(loadedRooms);

    // Optionally sync with server in background
    syncRoomsFromServer(loadedRooms);

    // Check if we're returning from Stripe checkout or portal (check URL params)
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const isSuccess = urlParams.get('success') === 'true';
    const returnedFromPortal = urlParams.get('returned_from_portal') === 'true';

    if (isSuccess && sessionId) {
      // Confirm the checkout session and update subscription (fallback if webhook didn't fire)
      const confirmSession = async () => {
        try {
          const response = await authenticatedFetch('/api/stripe/confirm-session', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
          });

          if (response.ok) {
            const data = await response.json();
            console.log('Session confirmed:', data);
          } else {
            const error = await response.json();
            console.error('Failed to confirm session:', error);
            // Continue anyway - webhook might have already processed it
          }
        } catch (error) {
          console.error('Error confirming session:', error);
          // Continue anyway - webhook might have already processed it
        } finally {
          // Refresh subscription status after confirming session
          fetchSubscriptionStatus();
          // Clean up URL params
          window.history.replaceState({}, '', '/dashboard');
        }
      };

      // Small delay to ensure webhook has a chance to process first
      setTimeout(confirmSession, 500);
    } else if (returnedFromPortal) {
      // Just refresh subscription status when returning from portal
      setTimeout(() => {
        fetchSubscriptionStatus();
        // Clean up URL params
        window.history.replaceState({}, '', '/dashboard');
      }, 500);
    }

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
    setCurrentPage(1); // Reset to first page on search
  }, [searchQuery, rooms]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredRooms.length / itemsPerPage);
  const paginatedRooms = filteredRooms.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await authenticatedFetch("/api/subscription");
      if (response.ok) {
        const data = await response.json();
        setIsPro(data.isPro);
      }
    } catch (error) {
      console.error("Error fetching subscription:", error);
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const response = await authenticatedFetch("/api/portal", {
        method: "POST",
      });
      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        alert("Failed to open subscription portal");
      }
    } catch (error) {
      console.error("Error opening portal:", error);
      alert("Something went wrong");
    }
  };

  const handleCheckout = async () => {
    setIsCheckingOut(true);
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
    } finally {
      setIsCheckingOut(false);
    }
  };

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
        const updated = [...localRooms, ...newRooms].sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt).getTime();
          return dateB - dateA; // Descending order (newest first)
        });
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
      const updatedRooms = loadRoomsIndex().sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA; // Descending order (newest first)
      });
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
      const updatedRooms = loadRoomsIndex().sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA; // Descending order (newest first)
      });
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
      const updatedRooms = loadRoomsIndex().sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA; // Descending order (newest first)
      });
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
        const updatedRooms = loadRoomsIndex().sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt).getTime();
          return dateB - dateA; // Descending order (newest first)
        });
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
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-stone-900"></div>
          <div className="text-stone-500 font-medium">Loading your space...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#18181b]">
      {/* Navbar */}
      <nav className="bg-[#faf9f6]/80 backdrop-blur-md border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                <Image
                  src="/logo.svg"
                  alt="Excaflow Logo"
                  width={32}
                  height={32}
                  className="object-cover"
                />
              </div>
              <span className="text-xl font-bold tracking-tight text-stone-900">
                Excaflow
              </span>
            </Link>
            <div className="flex items-center gap-4">
              {!isLoadingSubscription && (
                isPro ? (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
                      PRO
                    </span>
                    <button
                      onClick={handleManageSubscription}
                      className="text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium"
                    >
                      Manage
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-600 border border-stone-200">
                      FREE
                    </span>
                    <button
                      onClick={handleCheckout}
                      disabled={isCheckingOut}
                      className="text-sm font-bold text-stone-900 bg-yellow-400 hover:bg-yellow-500 px-5 py-2 rounded-full shadow-sm transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCheckingOut ? "Processing..." : "Upgrade to Pro"}
                    </button>
                  </div>
                )
              )}
              <div className="hidden md:flex items-center gap-2 text-sm text-stone-600 bg-white px-4 py-2 rounded-full border border-stone-200 shadow-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                {user.email}
              </div>
              <button
                onClick={handleLogout}
                className="text-stone-500 hover:text-stone-900 font-medium text-sm transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-stone-900 tracking-tight mb-2">Your Boards</h1>
            <p className="text-lg text-stone-500 font-medium max-w-lg">Manage your visual specifications and share them with your team.</p>
          </div>
          <button
            onClick={() => {
              const name = prompt("Enter room name:");
              if (name && name.trim()) {
                handleCreateRoom(name.trim());
              }
            }}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-bold rounded-full shadow-lg shadow-stone-900/10 text-white bg-stone-900 hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-900 transition-all transform hover:-translate-y-0.5"
          >
            <svg className="-ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Create New Room
          </button>
        </div>

        {/* Search and Controls */}
        <div className="mb-10 bg-white border border-stone-200 rounded-2xl p-2 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="relative flex-1 w-full sm:w-auto">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-stone-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your rooms..."
              className="block w-full pl-11 pr-4 py-2.5 border-none rounded-xl leading-5 bg-transparent placeholder-stone-400 focus:outline-none focus:ring-0 sm:text-sm font-medium text-stone-900"
            />
          </div>

          <div className="flex items-center bg-stone-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                viewMode === 'grid'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50'
              }`}
              title="Grid View"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-xs font-bold hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                viewMode === 'list'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50'
              }`}
              title="List View"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-xs font-bold hidden sm:inline">List</span>
            </button>
          </div>
        </div>

        {/* Rooms Grid */}
        {filteredRooms.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-stone-200">
            <div className="mx-auto h-24 w-24 text-stone-200 mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="mt-2 text-xl font-bold text-stone-900">No rooms found</h3>
            <p className="mt-2 text-stone-500 font-medium">
              {searchQuery ? "Try adjusting your search terms." : "Get started by creating a new room."}
            </p>
            {!searchQuery && (
              <div className="mt-8">
                <button
                  onClick={() => {
                    const name = prompt("Enter room name:");
                    if (name && name.trim()) {
                      handleCreateRoom(name.trim());
                    }
                  }}
                  className="inline-flex items-center px-6 py-3 border border-stone-200 shadow-sm text-sm font-bold rounded-full text-stone-900 bg-white hover:bg-stone-50 hover:border-yellow-400 transition-all"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Create Room
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedRooms.map((room) => {
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
                      className="group bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-xl hover:shadow-stone-200/50 hover:border-yellow-400/50 transition-all duration-300 flex flex-col overflow-hidden"
                    >
                      <div className="p-6 flex-1">
                        <div className="flex items-start justify-between mb-6">
                          <div className="p-3 bg-stone-50 rounded-xl text-stone-900 group-hover:bg-yellow-400 group-hover:text-stone-900 transition-colors duration-300">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="flex items-center gap-2">
                            {room.status === "local-only" ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                Local
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-100">
                                Synced
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <h3 className="text-xl font-bold text-stone-900 mb-2 truncate" title={room.title}>
                          {room.title}
                        </h3>
                        
                        <div className="text-sm text-stone-500 flex items-center gap-2 font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          {lastSynced ? `Synced ${lastSynced}` : "Not synced yet"}
                        </div>
                      </div>

                      <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
                        <Link
                          href={`/room/${room.id}`}
                          className="text-sm font-bold text-stone-900 hover:text-yellow-600 transition-colors flex items-center gap-1"
                        >
                          Open Room <span className="text-lg">&rarr;</span>
                        </Link>
                        
                        <div className="flex items-center gap-1">
                          {room.status === "local-only" && (
                            <button
                              onClick={() => handleSyncRoom(room.id)}
                              disabled={isSyncing}
                              className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Sync to server"
                            >
                              <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                              </svg>
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleEditRoom(room.id)}
                            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
                            title="Rename"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                          </button>
                          
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
            ) : (
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-stone-100">
                  <thead className="bg-stone-50">
                    <tr>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">
                        Last Synced
                      </th>
                      <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-stone-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-stone-100">
                    {paginatedRooms.map((room) => {
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
                        <tr key={room.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-6 py-5 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 bg-stone-100 rounded-lg flex items-center justify-center text-stone-600">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                              <div className="ml-4">
                                <Link href={`/room/${room.id}`} className="text-sm font-bold text-stone-900 hover:text-yellow-600">
                                  {room.title}
                                </Link>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5 whitespace-nowrap">
                            {room.status === "local-only" ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                Local
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-100">
                                Synced
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-5 whitespace-nowrap text-sm text-stone-500 font-medium">
                            {lastSynced || "Not synced yet"}
                          </td>
                          <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-3">
                              <Link
                                href={`/room/${room.id}`}
                                className="text-stone-900 hover:text-yellow-600 font-bold mr-2"
                              >
                                Open
                              </Link>
                              
                              {room.status === "local-only" && (
                                <button
                                  onClick={() => handleSyncRoom(room.id)}
                                  disabled={isSyncing}
                                  className="text-stone-400 hover:text-blue-600 transition-colors"
                                  title="Sync to server"
                                >
                                  <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                  </svg>
                                </button>
                              )}
                              
                              <button
                                onClick={() => handleEditRoom(room.id)}
                                className="text-stone-400 hover:text-stone-600 transition-colors"
                                title="Rename"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                </svg>
                              </button>
                              
                              <button
                                onClick={() => handleDeleteRoom(room.id)}
                                className="text-stone-400 hover:text-red-600 transition-colors"
                                title="Delete"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-12 flex justify-center">
                <nav className="relative z-0 inline-flex rounded-full shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-3 py-2 rounded-l-full border border-stone-200 bg-white text-sm font-medium text-stone-500 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        currentPage === page
                          ? "z-10 bg-yellow-400 border-yellow-400 text-stone-900 font-bold"
                          : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-3 py-2 rounded-r-full border border-stone-200 bg-white text-sm font-medium text-stone-500 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
