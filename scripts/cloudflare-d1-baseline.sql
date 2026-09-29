-- The production D1 database predates Wrangler migration tracking. Record
-- migrations whose schema objects already exist so deploys do not replay them.
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0000_goofy_champions.sql'
WHERE EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'products');

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0001_short_gamora.sql'
WHERE EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'research_briefs');

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0002_ai_settings.sql'
WHERE EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'ai_settings');

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0003_optimization_plans.sql'
WHERE EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'optimization_plans');

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0004_create_briefs.sql'
WHERE EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'create_briefs');

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0005_publish_plans.sql'
WHERE EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'publish_plans');

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0006_current_listing.sql'
WHERE EXISTS (
  SELECT 1 FROM pragma_table_info('optimization_plans') WHERE name = 'current_listing'
);

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0007_promo_events.sql'
WHERE EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'promo_events');

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0008_ai_settings_fallback_models.sql'
WHERE EXISTS (
  SELECT 1 FROM pragma_table_info('ai_settings') WHERE name = 'fallback_models'
);

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0009_product_icons.sql'
WHERE EXISTS (
  SELECT 1 FROM pragma_table_info('products') WHERE name = 'icon_url'
);

INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0010_jittery_wildside.sql'
WHERE EXISTS (
  SELECT 1 FROM sqlite_schema
  WHERE type = 'table'
    AND name IN ('account_identity_links', 'account', 'session', 'user', 'verification')
  GROUP BY type
  HAVING COUNT(*) = 5
);
