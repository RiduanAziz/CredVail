-- Additive Migration: Dual Account Onboarding, Institutional Metadata & Email Verification
-- Preserves all existing tables, constraints, users, tenants, memberships, and credentials.

DO $$ BEGIN
  CREATE TYPE "OrganizationType" AS ENUM (
    'UNIVERSITY',
    'COLLEGE',
    'SCHOOL',
    'TRAINING_CENTER',
    'PROFESSIONAL_ASSOCIATION',
    'NGO',
    'GOVERNMENT',
    'ENTERPRISE',
    'CLUB',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "preferredDisplayName" TEXT,
  ADD COLUMN IF NOT EXISTS "jobTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termsVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "privacyVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "marketingOptIn" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tenants"
  ALTER COLUMN "websiteUrl" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "organizationType" "OrganizationType",
  ADD COLUMN IF NOT EXISTS "organizationTypeOther" TEXT,
  ADD COLUMN IF NOT EXISTS "countryCode" TEXT,
  ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "registrationAuthority" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine1" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine2" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "region" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "contactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "adminContactPosition" TEXT,
  ADD COLUMN IF NOT EXISTS "authorizedToRegisterAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "tenants_countryCode_idx" ON "tenants"("countryCode");
CREATE INDEX IF NOT EXISTS "tenants_organizationType_idx" ON "tenants"("organizationType");

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_verification_tokens_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "email_verification_tokens_userId_consumedAt_idx"
  ON "email_verification_tokens"("userId", "consumedAt");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_expiresAt_idx"
  ON "email_verification_tokens"("expiresAt");
