CREATE TABLE `google_play_reporting_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`package_name` text NOT NULL,
	`date_start` text DEFAULT '' NOT NULL,
	`date_end` text DEFAULT '' NOT NULL,
	`data_json` text DEFAULT '{}' NOT NULL,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_play_reporting_snapshots_product_owner_idx` ON `google_play_reporting_snapshots` (`product_id`,`owner_id`);
