"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  loadDrawingData,
  saveDrawingData,
  getLastSavedTime,
} from "@/lib/storage";
import type { DrawingData, SaveStatus } from "@/lib/types";

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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<DrawingData | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsClient(true);
    const data = loadDrawingData(roomId);
    
    // Normalize appState to ensure compatibility with Excalidraw
    if (data && data.appState) {
      const normalizedAppState = { ...data.appState };
      
      // Remove collaboration-related properties that shouldn't be in initialData
      // These properties are runtime-only and shouldn't be persisted
      delete normalizedAppState.collaborators;
      delete normalizedAppState.socketId;
      
      setInitialData({
        ...data,
        appState: normalizedAppState,
      });
    } else {
      setInitialData(data);
    }
    
    setLastSavedTime(getLastSavedTime(roomId));
    
    // Load Excalidraw CSS dynamically
    if (!document.querySelector('link[href="/excalidraw.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/excalidraw.css";
      document.head.appendChild(link);
    }
  }, [roomId]);

  const debouncedSave = useCallback(
    (elements: readonly any[], appState: any) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      setSaveStatus("saving");

      saveTimeoutRef.current = setTimeout(() => {
        // Clean appState before saving - remove runtime-only properties
        const cleanAppState = { ...appState };
        delete cleanAppState.collaborators;
        delete cleanAppState.socketId;
        
        const drawingData: DrawingData = {
          elements,
          appState: cleanAppState,
          timestamp: Date.now(),
        };
        saveDrawingData(roomId, drawingData);
        setSaveStatus("saved");
        setLastSavedTime(getLastSavedTime(roomId));
      }, 1000); // Debounce 1 second
    },
    [roomId]
  );

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      if (saveStatus === "saved") {
        setSaveStatus("unsaved");
      }
      debouncedSave(elements, appState);
    },
    [debouncedSave, saveStatus]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!isClient) {
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
          <div className="mb-4">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              ชื่อห้อง
            </div>
            <div className="text-base font-medium text-gray-800 dark:text-white truncate">
              {roomId}
            </div>
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* Save Status */}
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              สถานะการบันทึก
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === "saved" && (
                <>
                  <span className="text-green-600 dark:text-green-400 text-lg">✅</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    บันทึกแล้ว
                  </span>
                </>
              )}
              {saveStatus === "unsaved" && (
                <>
                  <span className="text-yellow-600 dark:text-yellow-400 text-lg">⚠️</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
                  </span>
                </>
              )}
              {saveStatus === "saving" && (
                <>
                  <span className="text-blue-600 dark:text-blue-400 text-lg animate-spin">
                    🔄
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    กำลังบันทึก...
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Last Saved Time */}
          {lastSavedTime && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                บันทึกล่าสุด
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {lastSavedTime}
              </div>
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
          {isClient && initialData && (
            <Excalidraw
              onChange={handleChange}
              initialData={{
                elements: initialData.elements || [],
                appState: (() => {
                  const appState = { ...initialData.appState };
                  // Remove collaboration-related properties that shouldn't be in initialData
                  delete appState.collaborators;
                  delete appState.socketId;
                  return appState;
                })(),
              }}
            />
          )}
          {isClient && !initialData && (
            <Excalidraw
              onChange={handleChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

