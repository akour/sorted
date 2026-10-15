CREATE TABLE aeo_visibility_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  product_id INTEGER NOT NULL,
  owner_id TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX aeo_campaign_product_owner_idx ON aeo_visibility_campaigns(product_id, owner_id);
CREATE TABLE aeo_visibility_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  product_id INTEGER NOT NULL,
  owner_id TEXT NOT NULL,
  observation TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX aeo_observation_product_owner_idx ON aeo_visibility_observations(product_id, owner_id, observed_at);
