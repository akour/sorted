CREATE TABLE `admin_workspace_appearance` (
	`id` text PRIMARY KEY NOT NULL,
	`accent` text DEFAULT 'violet' NOT NULL,
	`density` text DEFAULT 'comfortable' NOT NULL,
	`corners` text DEFAULT 'soft' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
