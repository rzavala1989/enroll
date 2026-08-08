-- CreateEnum
CREATE TYPE "ClassStanding" AS ENUM ('FRESHMAN', 'SOPHOMORE', 'JUNIOR', 'SENIOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "classStanding" "ClassStanding";

-- CreateTable
CREATE TABLE "RegistrationWindow" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "termId" UUID NOT NULL,
    "classStanding" "ClassStanding" NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationWindow_termId_classStanding_key" ON "RegistrationWindow"("termId", "classStanding");

-- AddForeignKey
ALTER TABLE "RegistrationWindow" ADD CONSTRAINT "RegistrationWindow_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
