CREATE TABLE `google_play_performance_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`report_type` text NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`row_count` integer NOT NULL,
	`date_start` text DEFAULT '' NOT NULL,
	`date_end` text DEFAULT '' NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_play_performance_import_fingerprint_idx` ON `google_play_performance_imports` (`product_id`,`owner_id`,`fingerprint`);
--> statement-breakpoint
CREATE INDEX `google_play_performance_import_product_owner_idx` ON `google_play_performance_imports` (`product_id`,`owner_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `google_play_performance_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`source_row` integer NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`locale` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`search_term` text DEFAULT '' NOT NULL,
	`traffic_source` text DEFAULT '' NOT NULL,
	`visitors` integer,
	`install_clicks` integer,
	`open_clicks` integer,
	`pre_registration_clicks` integer,
	`ctr` text DEFAULT '' NOT NULL,
	`conversion_rate` text DEFAULT '' NOT NULL,
	`acquisitions` integer
);
--> statement-breakpoint
CREATE INDEX `google_play_performance_rows_import_idx` ON `google_play_performance_rows` (`import_id`,`owner_id`,`product_id`);
--> statement-breakpoint
CREATE INDEX `google_play_performance_rows_product_date_idx` ON `google_play_performance_rows` (`product_id`,`owner_id`,`date`);
