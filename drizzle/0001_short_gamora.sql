CREATE TABLE `research_briefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`intent` text DEFAULT '' NOT NULL,
	`semantic_core` text DEFAULT '' NOT NULL,
	`competitors` text DEFAULT '' NOT NULL,
	`proof` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_briefs_product_owner_idx` ON `research_briefs` (`product_id`,`owner_id`);