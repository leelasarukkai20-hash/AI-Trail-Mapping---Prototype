ALTER TABLE "strava_tokens" ADD COLUMN "athlete_name" text;--> statement-breakpoint
ALTER TABLE "strava_tokens" ADD COLUMN "avg_pace_min_per_km" double precision;--> statement-breakpoint
ALTER TABLE "strava_tokens" ADD COLUMN "runs_last_90" integer;--> statement-breakpoint
ALTER TABLE "strava_tokens" ADD COLUMN "meters_last_90" double precision;--> statement-breakpoint
ALTER TABLE "strava_tokens" ADD COLUMN "stats_refreshed_at" timestamp with time zone;