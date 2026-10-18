CREATE TABLE listing_submission_receipts (
 id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
 product_id INTEGER NOT NULL,
 owner_id TEXT NOT NULL,
 receipt TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX listing_receipts_owner_product_idx ON listing_submission_receipts(owner_id,product_id,id);
