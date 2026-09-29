CREATE TABLE `admin_oauth_clients` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_ciphertext` text NOT NULL,
	`client_secret_hint` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_tested_at` text,
	`last_error` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
