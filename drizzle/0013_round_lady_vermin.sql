CREATE TABLE `product_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`package_name` text NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`credentials_ciphertext` text NOT NULL,
	`credential_hint` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_tested_at` text,
	`last_synced_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_connections_product_owner_provider_idx` ON `product_connections` (`product_id`,`owner_id`,`provider`);--> statement-breakpoint
CREATE INDEX `product_connections_owner_idx` ON `product_connections` (`owner_id`);