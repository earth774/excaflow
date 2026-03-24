import { prisma } from "@/lib/prisma";
import {
  FREE_TIER_MAX_PAGES_PER_PROJECT,
  FREE_TIER_MAX_PROJECTS,
} from "@/lib/planTier";

export async function isUserPro(userId: string): Promise<boolean> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripePriceId: true, stripeCurrentPeriodEnd: true },
  });
  if (!dbUser) return false;
  return !!(
    dbUser.stripePriceId &&
    dbUser.stripeCurrentPeriodEnd &&
    dbUser.stripeCurrentPeriodEnd.getTime() > Date.now()
  );
}

export async function canCreateProject(userId: string): Promise<boolean> {
  if (await isUserPro(userId)) return true;
  const count = await prisma.project.count({ where: { ownerId: userId } });
  return count < FREE_TIER_MAX_PROJECTS;
}

export function canLinkRoomsToProject(roomCount: number, isPro: boolean): boolean {
  if (isPro) return true;
  return roomCount <= FREE_TIER_MAX_PAGES_PER_PROJECT;
}
