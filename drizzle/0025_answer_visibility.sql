CREATE TABLE `answer_visibility_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`primary_page_url` text DEFAULT '' NOT NULL,
	`primary_claim` text DEFAULT '' NOT NULL,
	`facts` text DEFAULT '[]' NOT NULL,
	`answers` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answer_visibility_profiles_product_owner_idx` ON `answer_visibility_profiles` (`product_id`,`owner_id`);
