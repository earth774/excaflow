import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import RoomClient from "./RoomClient";

type Props = {
  params: Promise<{ roomId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roomId } = await params;

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { title: true, description: true },
  });

  if (!room) {
    return {
      title: "Room Not Found",
    };
  }

  return {
    title: room.title,
    description: room.description || "View this Excalidraw room!",
    openGraph: {
      title: room.title,
      description: room.description || "View this Excalidraw room!",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: room.title,
      description: room.description || "View this Excalidraw room!",
    },
  };
}

export default async function Page() {
  return <RoomClient />;
}
