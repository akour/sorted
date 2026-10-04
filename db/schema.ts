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

// Product-level connections are deliberately separate from the admin AI
// provider settings. A product owner can connect a store account for one app
// without exposing that credential to other products or to the admin UI.
export const productConnections = sqliteTable("product_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  provider: text("provider").notNull(),
  packageName: text("package_name").notNull(),
  locale: text("locale").notNull().default("en-US"),
  label: text("label").notNull().default(""),
  credentialsCiphertext: text("credentials_ciphertext").notNull(),
  credentialHint: text("credential_hint").notNull().default(""),
  status: text("status").notNull().default("connected"),
  lastTestedAt: text("last_tested_at"),
  lastSyncedAt: text("last_synced_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("product_connections_product_owner_provider_idx").on(table.productId, table.ownerId, table.provider),
  index("product_connections_owner_idx").on(table.ownerId),
]);

// OAuth authorization is stored separately from the existing service-account
// connection so both paths can coexist without changing the legacy credential
// format used by the authenticated listing sync.
export const productOauthConnections = sqliteTable("product_oauth_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  provider: text("provider").notNull(),
  packageName: text("package_name").notNull(),
  locale: text("locale").notNull().default("en-US"),
  label: text("label").notNull().default(""),
  accountEmail: text("account_email").notNull().default(""),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  refreshTokenHint: text("refresh_token_hint").notNull().default(""),
  status: text("status").notNull().default("connected"),
  lastSyncedAt: text("last_synced_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("product_oauth_connections_product_owner_provider_idx").on(table.productId, table.ownerId, table.provider),
  index("product_oauth_connections_owner_idx").on(table.ownerId),
]);

// The state value itself is only sent through the browser. D1 stores its hash
// so a callback can be validated without persisting a reusable bearer value.
export const googlePlayOAuthStates = sqliteTable("google_play_oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  packageName: text("package_name").notNull(),
  locale: text("locale").notNull().default("en-US"),
  label: text("label").notNull().default(""),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  localizedListings: text("localized_listings").notNull().default("[]"),
  opportunities: text("opportunities").notNull().default("[]"),
  nextActions: text("next_actions").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("optimization_plans_product_owner_idx").on(table.productId, table.ownerId)]);

// Google Play report imports are kept per product and contain normalized
// observations only; the original CSV is never stored.
export const googlePlayPerformanceImports = sqliteTable("google_play_performance_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  reportType: text("report_type").notNull(),
  fileName: text("file_name").notNull().default(""),
  rowCount: integer("row_count").notNull(),
  dateStart: text("date_start").notNull().default(""),
  dateEnd: text("date_end").notNull().default(""),
  fingerprint: text("fingerprint").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("google_play_performance_import_fingerprint_idx").on(table.productId, table.ownerId, table.fingerprint),
  index("google_play_performance_import_product_owner_idx").on(table.productId, table.ownerId, table.createdAt),
]);

export const googlePlayPerformanceRows = sqliteTable("google_play_performance_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull(),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  sourceRow: integer("source_row").notNull(),
  date: text("date").notNull().default(""),
  locale: text("locale").notNull().default(""),
  country: text("country").notNull().default(""),
  searchTerm: text("search_term").notNull().default(""),
  trafficSource: text("traffic_source").notNull().default(""),
  visitors: integer("visitors"),
  installClicks: integer("install_clicks"),
  openClicks: integer("open_clicks"),
  preRegistrationClicks: integer("pre_registration_clicks"),
  ctr: text("ctr").notNull().default(""),
  conversionRate: text("conversion_rate").notNull().default(""),
  acquisitions: integer("acquisitions"),
}, (table) => [
  index("google_play_performance_rows_import_idx").on(table.importId, table.ownerId, table.productId),
  index("google_play_performance_rows_product_date_idx").on(table.productId, table.ownerId, table.date),
]);

// Promotional-content outcomes are read-only Play Console report observations.
// Keep them separate from listing clicks and app-quality vitals.
export const googlePlayPromoReportSources = sqliteTable("google_play_promo_report_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  bucketName: text("bucket_name").notNull(),
  credentialsCiphertext: text("credentials_ciphertext"),
  credentialHint: text("credential_hint").notNull().default(""),
  lastSyncedAt: text("last_synced_at"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("google_play_promo_report_sources_product_owner_idx").on(table.productId, table.ownerId)]);

export const googlePlayPromoReportImports = sqliteTable("google_play_promo_report_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  reportMonth: text("report_month").notNull(),
  fileName: text("file_name").notNull(),
  generation: text("generation").notNull().default(""),
  rowCount: integer("row_count").notNull(),
  fingerprint: text("fingerprint").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("google_play_promo_report_import_fingerprint_idx").on(table.productId, table.ownerId, table.fingerprint),
  index("google_play_promo_report_import_product_month_idx").on(table.productId, table.ownerId, table.reportMonth, table.createdAt),
]);

export const googlePlayPromoReportRows = sqliteTable("google_play_promo_report_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull(),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  sourceRow: integer("source_row").notNull(),
  date: text("date").notNull(),
  eventIds: text("event_ids").notNull().default(""),
  eventNames: text("event_names").notNull(),
  country: text("country").notNull().default(""),
  viewersDaily: integer("viewers_daily"),
  viewers28d: integer("viewers_28d"),
  convertersDaily: integer("converters_daily"),
  converters28d: integer("converters_28d"),
  conversionRateDaily: text("conversion_rate_daily").notNull().default(""),
  conversionRate28d: text("conversion_rate_28d").notNull().default(""),
}, (table) => [
  index("google_play_promo_report_rows_import_idx").on(table.importId, table.ownerId, table.productId),
  index("google_play_promo_report_rows_product_date_idx").on(table.productId, table.ownerId, table.date),
]);

// Keep the latest API-fetched Play quality report separate from listing
// conversion observations; neither dataset should be mistaken for the other.
export const googlePlayReportingSnapshots = sqliteTable("google_play_reporting_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  ownerId: text("owner_id").notNull(),
  packageName: text("package_name").notNull(),
  dateStart: text("date_start").notNull().default(""),
  dateEnd: text("date_end").notNull().default(""),
  dataJson: text("data_json").notNull().default("{}"),
  syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastError: text("last_error"),
}, (table) => [
  uniqueIndex("google_play_reporting_snapshots_product_owner_idx").on(table.productId, table.ownerId),
]);

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

// Admin access is bootstrapped by SORTED_ADMIN_EMAILS and can then be managed
// from the control plane without changing the deployment configuration.
export const adminUsers = sqliteTable("admin_users", {
  authUserId: text("auth_user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("admin"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminUserControls = sqliteTable("admin_user_controls", {
  authUserId: text("auth_user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
  note: text("note").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminProviderKeys = sqliteTable("admin_provider_keys", {
  providerId: text("provider_id").primaryKey(),
  label: text("label").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull().default(""),
  fallbackModels: text("fallback_models").notNull().default("[]"),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyHint: text("api_key_hint").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastTestedAt: text("last_tested_at"),
  lastError: text("last_error"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Shared OAuth client configuration is managed centrally by administrators.
// User/workspace authorization tokens will remain separate from this client
// configuration when the provider connection flow is added.
export const adminOAuthClients = sqliteTable("admin_oauth_clients", {
  providerId: text("provider_id").primaryKey(),
  label: text("label").notNull(),
  clientId: text("client_id").notNull(),
  clientSecretCiphertext: text("client_secret_ciphertext").notNull(),
  clientSecretHint: text("client_secret_hint").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastTestedAt: text("last_tested_at"),
  lastError: text("last_error"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull().default(""),
  summary: text("summary").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("admin_audit_log_created_idx").on(table.createdAt)]);


// Appearance settings are shared by all product workspaces and controlled by admins.
export const adminWorkspaceAppearance = sqliteTable("admin_workspace_appearance", {
  id: text("id").primaryKey(),
  accent: text("accent").notNull().default("violet"),
  density: text("density").notNull().default("comfortable"),
  corners: text("corners").notNull().default("soft"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
