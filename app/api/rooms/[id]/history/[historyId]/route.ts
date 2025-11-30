import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/supabaseServer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; historyId: string }> }
) {
  try {
    const userId = await getUserIdFromRequest();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id, historyId } = await params;
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

    const historyEntry = await prisma.roomHistory.findUnique({
      where: {
        id: historyId,
      },
    });

    if (!historyEntry) {
      return NextResponse.json(
        { error: "History entry not found" },
        { status: 404 }
      );
    }

    if (historyEntry.roomId !== roomId) {
      return NextResponse.json(
        { error: "History entry does not belong to this room" },
        { status: 400 }
      );
    }

    return NextResponse.json(historyEntry);
  } catch (error) {
    console.error("Error fetching history entry:", error);
    return NextResponse.json(
      { error: "Failed to fetch history entry" },
      { status: 500 }
    );
  }
}
