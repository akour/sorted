CREATE TABLE `keyword_researches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`market` text DEFAULT 'en-US' NOT NULL,
	`seed_terms` text DEFAULT '[]' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`generated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keyword_researches_product_owner_idx` ON `keyword_researches` (`product_id`,`owner_id`);
