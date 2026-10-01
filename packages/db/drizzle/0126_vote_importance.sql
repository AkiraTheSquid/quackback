-- Delta fork: per-voter importance rating (1 = not important at all ... 5 = crucial).
-- NULL = a plain upvote with no rating (every vote cast before this column existed).
ALTER TABLE "votes" ADD COLUMN "importance" smallint;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_importance_range" CHECK ("importance" IS NULL OR "importance" BETWEEN 1 AND 5);
