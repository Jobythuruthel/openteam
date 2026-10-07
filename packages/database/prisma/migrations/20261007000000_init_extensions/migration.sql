-- Enable extensions used across the schema.
-- citext: case-insensitive usernames and emails. pgcrypto: gen_random_uuid() for UUID keys.
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Key/value metadata about the installation (schema version markers, bootstrap state).
CREATE TABLE "system_info" (
    "key" VARCHAR(64) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_info_pkey" PRIMARY KEY ("key")
);
