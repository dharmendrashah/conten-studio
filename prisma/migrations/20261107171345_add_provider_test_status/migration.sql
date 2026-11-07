-- AlterTable
ALTER TABLE "AiProvider" ADD COLUMN     "lastTestOk" BOOLEAN,
ADD COLUMN     "lastTestedAt" TIMESTAMP(3);
