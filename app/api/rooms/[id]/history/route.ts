import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/supabaseServer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromRequest();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const roomId = id;

    // Check if user owns the room
    const room = await prisma.room.findFirst({
      where: {
        id: roomId,
        ownerId: userId,
      },
    });

    if (!room) {
      return NextResponse.json(
        { error: "Room not found or unauthorized" },
        { status: 404 }
      );
    }

    const history = await prisma.roomHistory.findMany({
      where: {
        roomId: roomId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        createdAt: true,
        // Don't select scene to keep payload small
      },
    });

    return NextResponse.json(history);
  } catch (error) {
    console.error("Error fetching room history:", error);
    return NextResponse.json(
      { error: "Failed to fetch room history" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromRequest();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const roomId = id;
    const body = await request.json();
    const { scene } = body;

    if (!scene) {
      return NextResponse.json(
        { error: "Scene data is required" },
        { status: 400 }
      );
    }

    // Check if user owns the room
    const room = await prisma.room.findFirst({
      where: {
        id: roomId,
        ownerId: userId,
      },
    });

    if (!room) {
      return NextResponse.json(
        { error: "Room not found or unauthorized" },
        { status: 404 }
      );
    }

    const historyEntry = await prisma.roomHistory.create({
      data: {
        roomId: roomId,
        scene: scene,
      },
    });

    return NextResponse.json(historyEntry, { status: 201 });
  } catch (error) {
    console.error("Error creating history entry:", error);
    return NextResponse.json(
      { error: "Failed to create history entry" },
      { status: 500 }
    );
  }
}
