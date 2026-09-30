CREATE TABLE `aso_experiments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`package_name` text NOT NULL,
	`locale` text NOT NULL,
	`field` text NOT NULL,
	`hypothesis` text NOT NULL,
	`baseline_text` text NOT NULL,
	`variant_text` text NOT NULL,
	`baseline_fetched_at` text NOT NULL,
	`primary_metric` text DEFAULT 'unique_user_install_clicks' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`outcome` text,
	`outcome_notes` text DEFAULT '' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `aso_experiments_product_owner_created_idx` ON `aso_experiments` (`product_id`,`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `aso_experiments_product_owner_locale_status_idx` ON `aso_experiments` (`product_id`,`owner_id`,`locale`,`status`);