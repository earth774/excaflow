import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/supabaseServer";
import { canLinkRoomsToProject, isUserPro } from "@/lib/planLimits";

function serializeProject(
  p: {
    id: string;
    name: string;
    color: string;
    icon: string;
    createdAt: Date;
    memberships: { roomId: string }[];
  }
) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    icon: p.icon,
    roomIds: p.memberships.map((m) => m.roomId),
    createdAt: p.createdAt.toISOString(),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromRequest();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.project.findFirst({
      where: { id, ownerId: userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, color, icon, roomIds } = body;

    const data: { name?: string; color?: string; icon?: string } = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (color !== undefined) {
      if (typeof color !== "string") {
        return NextResponse.json({ error: "Invalid color" }, { status: 400 });
      }
      data.color = color;
    }
    if (icon !== undefined) {
      if (typeof icon !== "string") {
        return NextResponse.json({ error: "Invalid icon" }, { status: 400 });
      }
      data.icon = icon;
    }

    if (roomIds !== undefined) {
      if (!Array.isArray(roomIds) || !roomIds.every((r: unknown) => typeof r === "string")) {
        return NextResponse.json({ error: "roomIds must be an array of strings" }, { status: 400 });
      }
      const uniqueRoomIds = [...new Set(roomIds as string[])];
      const pro = await isUserPro(userId);
      if (!canLinkRoomsToProject(uniqueRoomIds.length, pro)) {
        return NextResponse.json(
          {
            error: "Free plan allows up to 5 pages per project. Upgrade for unlimited.",
            code: "PAGES_PER_PROJECT_LIMIT",
          },
          { status: 403 }
        );
      }
      if (uniqueRoomIds.length > 0) {
        const owned = await prisma.room.findMany({
          where: { ownerId: userId, id: { in: uniqueRoomIds } },
          select: { id: true },
        });
        if (owned.length !== uniqueRoomIds.length) {
          return NextResponse.json(
            { error: "One or more rooms are invalid or not owned by you" },
            { status: 400 }
          );
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.projectRoom.deleteMany({ where: { projectId: id } });
        if (uniqueRoomIds.length > 0) {
          await tx.projectRoom.createMany({
            data: uniqueRoomIds.map((roomId) => ({ projectId: id, roomId })),
          });
        }
      });
    }

    if (Object.keys(data).length > 0) {
      await prisma.project.update({
        where: { id },
        data,
      });
    }

    const updated = await prisma.project.findFirst({
      where: { id },
      include: { memberships: { select: { roomId: true } } },
    });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(serializeProject(updated));
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromRequest();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.project.findFirst({
      where: { id, ownerId: userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
