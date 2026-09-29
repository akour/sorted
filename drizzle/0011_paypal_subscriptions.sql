CREATE TABLE `subscriptions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `auth_user_id` text NOT NULL,
  `provider` text DEFAULT 'paypal' NOT NULL,
  `provider_subscription_id` text NOT NULL,
  `plan_id` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `payer_email` text DEFAULT '' NOT NULL,
  `current_period_start` text,
  `next_billing_time` text,
  `cancelled_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_id_uidx` ON `subscriptions` (`provider_subscription_id`);
--> statement-breakpoint
CREATE INDEX `subscriptions_auth_user_idx` ON `subscriptions` (`auth_user_id`);
