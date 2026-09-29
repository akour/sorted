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

// Better Auth's native D1 adapter uses these four core tables. Keep their
// physical names and camel-case columns aligned with Better Auth's defaults.
export const authUsers = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("user_email_uidx").on(table.email)]);

export const authSessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("session_token_uidx").on(table.token),
  index("session_userId_idx").on(table.userId),
]);

export const authAccounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("account_userId_idx").on(table.userId)]);

export const authVerifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

// The private Sites identity remains the canonical owner ID for the existing
// workspace. This one-to-one link lets a verified customer session resolve to
// that same owner ID without rewriting any existing product data.
export const accountIdentityLinks = sqliteTable("account_identity_links", {
  authUserId: text("auth_user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  siteUserId: text("site_user_id").notNull(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("account_identity_links_site_user_uidx").on(table.siteUserId)]);

export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  authUserId: text("auth_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("paypal"),
  providerSubscriptionId: text("provider_subscription_id").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull().default("pending"),
  payerEmail: text("payer_email").notNull().default(""),
  currentPeriodStart: text("current_period_start"),
  nextBillingTime: text("next_billing_time"),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("subscriptions_provider_id_uidx").on(table.providerSubscriptionId),
  index("subscriptions_auth_user_idx").on(table.authUserId),
]);
