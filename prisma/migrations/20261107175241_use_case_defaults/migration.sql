-- CreateEnum
CREATE TYPE "AiUseCase" AS ENUM ('llm', 'image', 'video', 'tts');

-- CreateTable
CREATE TABLE "UseCaseDefault" (
    "useCase" "AiUseCase" NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UseCaseDefault_pkey" PRIMARY KEY ("useCase")
);

-- AddForeignKey
ALTER TABLE "UseCaseDefault" ADD CONSTRAINT "UseCaseDefault_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
