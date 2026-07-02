CREATE TABLE "runner_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"self_reported_pace_min_per_km" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
