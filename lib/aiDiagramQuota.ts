import { prisma } from "@/lib/prisma";
import {
  FREE_TIER_AI_DIAGRAM_GENERATIONS_PER_MONTH,
  PRO_TIER_AI_DIAGRAM_GENERATIONS_PER_MONTH,
} from "@/lib/planTier";

/** Calendar month in UTC, `YYYY-MM` — matches typical SaaS quota resets. */
export function currentAiUsageMonthKeyUtc(): string {
  return new Date().toISOString().slice(0, 7);
}

export function aiDiagramGenerationMonthlyLimit(isPro: boolean): number {
  return isPro
    ? PRO_TIER_AI_DIAGRAM_GENERATIONS_PER_MONTH
    : FREE_TIER_AI_DIAGRAM_GENERATIONS_PER_MONTH;
}

export async function getAiDiagramUsageState(userId: string, isPro: boolean) {
  const monthKey = currentAiUsageMonthKeyUtc();
  const limit = aiDiagramGenerationMonthlyLimit(isPro);
  const row = await prisma.aiDiagramUsage.findUnique({
    where: { userId_monthKey: { userId, monthKey } },
  });
  const used = row?.count ?? 0;
  return {
    monthKey,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

/**
 * Increment usage after a successful generation. `updateMany` avoids going over `limit`
 * under normal single-threaded use; pre-check should run before calling OpenAI.
 */
export async function recordAiDiagramGeneration(
  userId: string,
  isPro: boolean
): Promise<{ recorded: boolean }> {
  const monthKey = currentAiUsageMonthKeyUtc();
  const limit = aiDiagramGenerationMonthlyLimit(isPro);
  await prisma.aiDiagramUsage.upsert({
    where: { userId_monthKey: { userId, monthKey } },
    create: { userId, monthKey, count: 0 },
    update: {},
  });
  const result = await prisma.aiDiagramUsage.updateMany({
    where: { userId, monthKey, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  return { recorded: result.count > 0 };
}
