CREATE TABLE `google_search_console_connections` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`account_email` text DEFAULT '' NOT NULL,
	`refresh_token_ciphertext` text NOT NULL,
	`refresh_token_hint` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_search_console_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `website_seo_audits` ADD `search_console_property` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `website_seo_audits` ADD `search_console_snapshot` text DEFAULT '{}' NOT NULL;
