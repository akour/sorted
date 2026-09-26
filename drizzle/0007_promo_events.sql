CREATE TABLE `promo_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `product_id` integer NOT NULL,
  `owner_id` text NOT NULL,
  `title` text DEFAULT '' NOT NULL,
  `event_type` text DEFAULT 'feature' NOT NULL,
  `status` text DEFAULT 'planned' NOT NULL,
  `start_date` text DEFAULT '' NOT NULL,
  `end_date` text DEFAULT '' NOT NULL,
  `theme` text DEFAULT '' NOT NULL,
  `objective` text DEFAULT '' NOT NULL,
  `event_brief` text DEFAULT '{}' NOT NULL,
  `google_play` text DEFAULT '{}' NOT NULL,
  `apple_event` text DEFAULT '{}' NOT NULL,
  `site_entry` text DEFAULT '{}' NOT NULL,
  `localization` text DEFAULT '[]' NOT NULL,
  `creative` text DEFAULT '{}' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `promo_events_product_owner_idx` ON `promo_events` (`product_id`,`owner_id`);
