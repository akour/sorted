CREATE TABLE `google_play_promo_report_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`bucket_name` text NOT NULL,
	`credentials_ciphertext` text,
	`credential_hint` text DEFAULT '' NOT NULL,
	`last_synced_at` text,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_play_promo_report_sources_product_owner_idx` ON `google_play_promo_report_sources` (`product_id`,`owner_id`);
--> statement-breakpoint
CREATE TABLE `google_play_promo_report_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`report_month` text NOT NULL,
	`file_name` text NOT NULL,
	`generation` text DEFAULT '' NOT NULL,
	`row_count` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_play_promo_report_import_fingerprint_idx` ON `google_play_promo_report_imports` (`product_id`,`owner_id`,`fingerprint`);
--> statement-breakpoint
CREATE INDEX `google_play_promo_report_import_product_month_idx` ON `google_play_promo_report_imports` (`product_id`,`owner_id`,`report_month`,`created_at`);
--> statement-breakpoint
CREATE TABLE `google_play_promo_report_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`source_row` integer NOT NULL,
	`date` text NOT NULL,
	`event_ids` text DEFAULT '' NOT NULL,
	`event_names` text NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`viewers_daily` integer,
	`viewers_28d` integer,
	`converters_daily` integer,
	`converters_28d` integer,
	`conversion_rate_daily` text DEFAULT '' NOT NULL,
	`conversion_rate_28d` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `google_play_promo_report_rows_import_idx` ON `google_play_promo_report_rows` (`import_id`,`owner_id`,`product_id`);
--> statement-breakpoint
CREATE INDEX `google_play_promo_report_rows_product_date_idx` ON `google_play_promo_report_rows` (`product_id`,`owner_id`,`date`);
