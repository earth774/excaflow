import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/supabaseServer";
import type { LocalRoom } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: Omit<LocalRoom, "status"> & { updatedAt: string } = await request.json();

    // Ensure scene has files property
    const sceneWithFiles = {
      ...body.scene,
      files: body.scene.files || {},
    };

    // Check if room exists and user owns it
    const existingRoom = await prisma.room.findFirst({
      where: {
        id: body.id,
        ownerId: userId,
      },
    });

    let room;
    if (existingRoom) {
      // Update existing room (push)
      room = await prisma.room.update({
        where: { id: body.id },
        data: {
          title: body.title,
          description: body.description || null,
          scene: sceneWithFiles as any,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      // Create new room (sync - first time)
      room = await prisma.room.create({
        data: {
          id: body.id,
          ownerId: userId,
          title: body.title,
          description: body.description || null,
          scene: sceneWithFiles as any,
          lastSyncedAt: new Date(),
        },
      });
    }

    return NextResponse.json(room);
  } catch (error) {
    console.error("Error syncing room:", error);
    return NextResponse.json(
      { error: "Failed to sync room" },
      { status: 500 }
    );
  }
}

