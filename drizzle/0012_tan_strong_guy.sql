ALTER TABLE `admin_provider_keys` ADD `fallback_models` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `admin_provider_keys`
SET `model` = COALESCE((
      SELECT NULLIF(`active_model`, '')
      FROM `ai_settings`
      ORDER BY `updated_at` DESC
      LIMIT 1
    ), `model`),
    `fallback_models` = COALESCE((
      SELECT `fallback_models`
      FROM `ai_settings`
      ORDER BY `updated_at` DESC
      LIMIT 1
    ), '[]')
WHERE `provider_id` = 'opencode'
  AND EXISTS (SELECT 1 FROM `ai_settings`);
