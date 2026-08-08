-- AlterTable
ALTER TABLE "Term" ADD COLUMN "maxCredits" INTEGER NOT NULL DEFAULT 18;

-- CreateTable
CREATE TABLE "AdvisorHold" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "advisorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "AdvisorHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverloadApproval" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "approvedById" UUID NOT NULL,
    "maxCredits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverloadApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvisorHold_studentId_releasedAt_idx" ON "AdvisorHold"("studentId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OverloadApproval_studentId_termId_key" ON "OverloadApproval"("studentId", "termId");

-- AddForeignKey
ALTER TABLE "AdvisorHold" ADD CONSTRAINT "AdvisorHold_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorHold" ADD CONSTRAINT "AdvisorHold_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverloadApproval" ADD CONSTRAINT "OverloadApproval_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverloadApproval" ADD CONSTRAINT "OverloadApproval_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverloadApproval" ADD CONSTRAINT "OverloadApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
