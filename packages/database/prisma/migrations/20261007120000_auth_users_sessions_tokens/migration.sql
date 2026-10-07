-- Run 1: authentication. Users, sessions and single-use email tokens.
-- Secrets are never stored raw: token_hash columns hold SHA-256 hex digests.

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('pending_verification', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "session_revocation_reason" AS ENUM ('logout', 'logout_all', 'user_revoked', 'password_reset', 'rotated');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'pending_verification',
    "email_verified_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "device_label" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" "session_revocation_reason",

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express. They guard against bugs that bypass the service layer.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalised_chk" CHECK ("email"::text = lower(btrim("email"::text))),
  ADD CONSTRAINT "users_active_requires_verified_chk" CHECK ("status" <> 'active' OR "email_verified_at" IS NOT NULL);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_hash_format_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_expiry_after_creation_chk" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "sessions_revocation_consistent_chk" CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL));

ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_hash_format_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "email_verification_tokens_expiry_chk" CHECK ("expires_at" > "created_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_hash_format_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "password_reset_tokens_expiry_chk" CHECK ("expires_at" > "created_at");
