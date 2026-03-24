-- CreateTable
CREATE TABLE "ai_diagram_usage" (
    "userId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_diagram_usage_pkey" PRIMARY KEY ("userId","monthKey")
);
