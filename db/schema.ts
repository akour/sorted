import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull().default(""),
  iconUrl: text("icon_url").notNull().default(""),
  position: text("position").notNull().default(""),
  audience: text("audience").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const researchBriefs = sqliteTable("research_briefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  intent: text("intent").notNull().default(""),
  semanticCore: text("semantic_core").notNull().default(""),
  competitors: text("competitors").notNull().default(""),
  proof: text("proof").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("research_briefs_product_owner_idx").on(table.productId, table.ownerId)]);

export const aiSettings = sqliteTable("ai_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull().unique(),
  activeModel: text("active_model").notNull(),
  fallbackModels: text("fallback_models").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const optimizationPlans = sqliteTable("optimization_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  focus: text("focus").notNull().default("ASO + AEO"),
  storeTitle: text("store_title").notNull().default(""),
  storeSubtitle: text("store_subtitle").notNull().default(""),
  storeShortDescription: text("store_short_description").notNull().default(""),
  storeLongDescription: text("store_long_description").notNull().default(""),
  answerSummary: text("answer_summary").notNull().default(""),
  currentListing: text("current_listing").notNull().default("{}"),
  opportunities: text("opportunities").notNull().default("[]"),
  nextActions: text("next_actions").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("optimization_plans_product_owner_idx").on(table.productId, table.ownerId)]);

export const createBriefs = sqliteTable("create_briefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  status: text("status").notNull().default("draft"),
  primaryMessage: text("primary_message").notNull().default(""),
  storeVariants: text("store_variants").notNull().default("[]"),
  answerBlocks: text("answer_blocks").notNull().default("[]"),
  promoBrief: text("promo_brief").notNull().default("{}"),
  creativeBrief: text("creative_brief").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("create_briefs_product_owner_idx").on(table.productId, table.ownerId)]);

export const publishPlans = sqliteTable("publish_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  status: text("status").notNull().default("draft"),
  channels: text("channels").notNull().default("[]"),
  checklist: text("checklist").notNull().default("[]"),
  releaseNotes: text("release_notes").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("publish_plans_product_owner_idx").on(table.productId, table.ownerId)]);

export const promoEvents = sqliteTable("promo_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull().default(""),
  eventType: text("event_type").notNull().default("feature"),
  status: text("status").notNull().default("planned"),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  theme: text("theme").notNull().default(""),
  objective: text("objective").notNull().default(""),
  eventBrief: text("event_brief").notNull().default("{}"),
  googlePlay: text("google_play").notNull().default("{}"),
  appleEvent: text("apple_event").notNull().default("{}"),
  siteEntry: text("site_entry").notNull().default("{}"),
  localization: text("localization").notNull().default("[]"),
  creative: text("creative").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("promo_events_product_owner_idx").on(table.productId, table.ownerId)]);
