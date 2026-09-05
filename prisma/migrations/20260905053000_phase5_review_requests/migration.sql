-- CreateEnum
CREATE TYPE "ReviewRequestKind" AS ENUM ('DISCOUNT', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "ReviewRequestStatus" AS ENUM ('PENDING', 'AWAITING_COO', 'RESOLVED', 'DECLINED');

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "kind" "ReviewRequestKind" NOT NULL,
    "status" "ReviewRequestStatus" NOT NULL DEFAULT 'PENDING',
    "agreementId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "justification" TEXT,
    "discountSnapshotPct" DOUBLE PRECISION,
    "csmoActedById" TEXT,
    "csmoActedAt" TIMESTAMP(3),
    "csmoNote" TEXT,
    "finalActedById" TEXT,
    "finalActedAt" TIMESTAMP(3),
    "finalNote" TEXT,
    "resolvedTier" TEXT,
    "resolvedMonthlyPct" DOUBLE PRECISION,
    "resolvedSetupPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_token_key" ON "ReviewRequest"("token");

-- CreateIndex
CREATE INDEX "ReviewRequest_agreementId_idx" ON "ReviewRequest"("agreementId");

-- CreateIndex
CREATE INDEX "ReviewRequest_status_idx" ON "ReviewRequest"("status");

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_csmoActedById_fkey" FOREIGN KEY ("csmoActedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_finalActedById_fkey" FOREIGN KEY ("finalActedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
