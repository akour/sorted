ALTER TABLE `products` ADD `website_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD `google_play_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD `app_store_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `optimization_plans` ADD `app_store_draft` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
UPDATE `products` SET `google_play_url` = `url` WHERE lower(`url`) LIKE 'https://play.google.com/%';
--> statement-breakpoint
UPDATE `products` SET `app_store_url` = `url` WHERE lower(`url`) LIKE 'https://apps.apple.com/%' OR lower(`url`) LIKE 'https://itunes.apple.com/%';
--> statement-breakpoint
UPDATE `products` SET `website_url` = `url` WHERE `url` <> '' AND lower(`url`) NOT LIKE 'https://play.google.com/%' AND lower(`url`) NOT LIKE 'https://apps.apple.com/%' AND lower(`url`) NOT LIKE 'https://itunes.apple.com/%';
--> statement-breakpoint
CREATE TABLE `website_seo_audits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`audit` text DEFAULT '{}' NOT NULL,
	`action_states` text DEFAULT '{}' NOT NULL,
	`metrics` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `website_seo_audits_product_owner_idx` ON `website_seo_audits` (`product_id`,`owner_id`);
