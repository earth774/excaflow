import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/supabaseServer";
import { canCreateProject } from "@/lib/planLimits";

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

export async function GET() {
  try {
    const userId = await getUserIdFromRequest();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await prisma.project.findMany({
      where: { ownerId: userId },
      include: { memberships: { select: { roomId: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(projects.map(serializeProject));
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, color, icon } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!color || typeof color !== "string") {
      return NextResponse.json({ error: "Color is required" }, { status: 400 });
    }
    if (!icon || typeof icon !== "string") {
      return NextResponse.json({ error: "Icon is required" }, { status: 400 });
    }

    if (!(await canCreateProject(userId))) {
      return NextResponse.json(
        { error: "Free plan allows up to 5 projects. Upgrade for unlimited.", code: "PROJECT_LIMIT" },
        { status: 403 }
      );
    }

    const project = await prisma.project.create({
      data: {
        ownerId: userId,
        name: name.trim(),
        color,
        icon,
      },
      include: { memberships: { select: { roomId: true } } },
    });

    return NextResponse.json(serializeProject(project), { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
