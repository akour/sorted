CREATE TABLE `promo_event_performance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`promo_event_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`play_event_id` text NOT NULL,
	`report_date` text NOT NULL,
	`country_code` text DEFAULT 'ALL' NOT NULL,
	`daily_viewers` integer,
	`rolling28_viewers` integer,
	`daily_converters` integer,
	`rolling28_converters` integer,
	`daily_conversion_rate` text,
	`rolling28_conversion_rate` text,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`promo_event_id`) REFERENCES `promo_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_event_performance_owner_event_date_country_idx` ON `promo_event_performance` (`owner_id`,`promo_event_id`,`report_date`,`country_code`);--> statement-breakpoint
CREATE INDEX `promo_event_performance_product_owner_date_idx` ON `promo_event_performance` (`product_id`,`owner_id`,`report_date`);