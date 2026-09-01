CREATE TABLE "apod_posts" (
	"apod_date" date PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"media_type" text NOT NULL,
	"url" text,
	"hdurl" text,
	"thumbnail_url" text,
	"copyright" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"broadcast_at" timestamp with time zone
);
