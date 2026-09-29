CREATE TABLE `google_play_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`package_name` text NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_oauth_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`package_name` text NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`account_email` text DEFAULT '' NOT NULL,
	`refresh_token_ciphertext` text NOT NULL,
	`refresh_token_hint` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_synced_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_oauth_connections_product_owner_provider_idx` ON `product_oauth_connections` (`product_id`,`owner_id`,`provider`);--> statement-breakpoint
CREATE INDEX `product_oauth_connections_owner_idx` ON `product_oauth_connections` (`owner_id`);