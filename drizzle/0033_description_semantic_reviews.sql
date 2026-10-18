CREATE TABLE description_semantic_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
 product_id INTEGER NOT NULL,
 owner_id TEXT NOT NULL,
 analysis TEXT NOT NULL
);
CREATE UNIQUE INDEX description_semantic_product_owner_idx ON description_semantic_reviews(product_id,owner_id);
