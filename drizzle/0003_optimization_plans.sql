CREATE TABLE `optimization_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`focus` text DEFAULT 'ASO + AEO' NOT NULL,
	`store_title` text DEFAULT '' NOT NULL,
	`store_subtitle` text DEFAULT '' NOT NULL,
	`store_short_description` text DEFAULT '' NOT NULL,
	`store_long_description` text DEFAULT '' NOT NULL,
	`answer_summary` text DEFAULT '' NOT NULL,
	`opportunities` text DEFAULT '[]' NOT NULL,
	`next_actions` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `optimization_plans_product_owner_idx` ON `optimization_plans` (`product_id`,`owner_id`);
