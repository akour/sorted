CREATE TABLE `publish_plans` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `product_id` integer NOT NULL,
  `owner_id` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `channels` text DEFAULT '[]' NOT NULL,
  `checklist` text DEFAULT '[]' NOT NULL,
  `release_notes` text DEFAULT '' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publish_plans_product_owner_idx` ON `publish_plans` (`product_id`,`owner_id`);
