import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/supabaseServer";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Allow reading even if not logged in (read-only mode)
    const userId = await getUserIdFromRequest();

    // Handle both sync and async params (Next.js 15+ uses Promise)
    const params = await Promise.resolve(context.params);
    const id = params.id;
    
    // Fallback: extract from URL if params.id is still undefined
    let roomId = id;
    if (!roomId) {
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const idIndex = pathParts.indexOf("rooms") + 1;
      roomId = pathParts[idIndex];
    }
    
    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 }
      );
    }

    // Allow reading any room (read-only for non-owners or non-logged-in users)
    const room = await prisma.room.findUnique({
      where: {
        id: roomId,
      },
    });

    if (!room) {
      return NextResponse.json(
        { error: "Room not found" },
        { status: 404 }
      );
    }

    // Include ownership info in response (false if not logged in)
    const isOwner = userId ? room.ownerId === userId : false;
    
    return NextResponse.json({
      ...room,
      isOwner, // Add ownership flag
    });
  } catch (error) {
    console.error("Error fetching room:", error);
    return NextResponse.json(
      { error: "Failed to fetch room" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const userId = await getUserIdFromRequest();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const params = await Promise.resolve(context.params);
    const id = params.id;
    
    let roomId = id;
    if (!roomId) {
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const idIndex = pathParts.indexOf("rooms") + 1;
      roomId = pathParts[idIndex];
    }
    
    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { scene, title, description } = body;

    // Check if room exists and user owns it
    const existingRoom = await prisma.room.findFirst({
      where: {
        id: roomId,
        ownerId: userId,
      },
    });

    if (!existingRoom) {
      return NextResponse.json(
        { error: "Room not found" },
        { status: 404 }
      );
    }

    // Update room content
    const updatedRoom = await prisma.room.update({
      where: {
        id: roomId,
      },
      data: {
        ...(scene !== undefined && { scene: scene as any }),
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description || null }),
      },
    });

    return NextResponse.json(updatedRoom);
  } catch (error) {
    console.error("Error updating room:", error);
    return NextResponse.json(
      { error: "Failed to update room" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const userId = await getUserIdFromRequest();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const params = await Promise.resolve(context.params);
    const id = params.id;
    
    let roomId = id;
    if (!roomId) {
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const idIndex = pathParts.indexOf("rooms") + 1;
      roomId = pathParts[idIndex];
    }
    
    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 }
      );
    }

    // Check if room exists and user owns it
    const existingRoom = await prisma.room.findFirst({
      where: {
        id: roomId,
        ownerId: userId,
      },
    });

    if (!existingRoom) {
      return NextResponse.json(
        { error: "Room not found or you don't have permission to delete it" },
        { status: 404 }
      );
    }

    // Delete room from database
    await prisma.room.delete({
      where: {
        id: roomId,
      },
    });

    return NextResponse.json({ success: true, message: "Room deleted successfully" });
  } catch (error) {
    console.error("Error deleting room:", error);
    return NextResponse.json(
      { error: "Failed to delete room" },
      { status: 500 }
    );
  }
}

