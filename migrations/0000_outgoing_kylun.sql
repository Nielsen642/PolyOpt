CREATE TABLE "portfolios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"portfolio_id" integer NOT NULL,
	"market_id" text NOT NULL,
	"yes_shares" numeric NOT NULL,
	"no_shares" numeric NOT NULL,
	"price" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"wallet_address" text,
	"role" text DEFAULT 'operator' NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
