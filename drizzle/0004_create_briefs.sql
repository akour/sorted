CREATE TABLE `create_briefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`primary_message` text DEFAULT '' NOT NULL,
	`store_variants` text DEFAULT '[]' NOT NULL,
	`answer_blocks` text DEFAULT '[]' NOT NULL,
	`promo_brief` text DEFAULT '{}' NOT NULL,
	`creative_brief` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `create_briefs_product_owner_idx` ON `create_briefs` (`product_id`,`owner_id`);
