CREATE TABLE aeo_website_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  product_id INTEGER NOT NULL,
  owner_id TEXT NOT NULL,
  report TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX aeo_website_review_product_owner_idx ON aeo_website_reviews(product_id,owner_id);
