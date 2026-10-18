CREATE TABLE listing_change_outcomes (
 id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
 product_id INTEGER NOT NULL,
 owner_id TEXT NOT NULL,
 experiment_id TEXT NOT NULL,
 outcome TEXT NOT NULL
);
CREATE UNIQUE INDEX listing_outcome_owner_product_change_idx ON listing_change_outcomes(owner_id,product_id,experiment_id);
