-- Pro: server-persisted alert rules & events per user (APP_TIER=pro)
CREATE TABLE IF NOT EXISTS "user_alert_state" (
  "user_id" integer PRIMARY KEY NOT NULL,
  "rules_json" text DEFAULT '[]' NOT NULL,
  "events_json" text DEFAULT '[]' NOT NULL,
  "updated_at" text NOT NULL
);
