"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Tab = "overview" | "users" | "providers" | "integrations" | "environment";
type Readiness = Record<"betterAuthSecret" | "d1" | "resend" | "openCode" | "adminAllowlist", boolean>;
type Overview = {
  counts: { users: number; verifiedUsers: number; products: number; configuredProviders: number };
  readiness: Readiness;
  runtime: { source: "managed" | "environment" | "none"; providerId: string; model: string | null; baseUrl: string | null };
  currentAdmin: { id: string; email: string; name: string };
  audit: Array<{ id: string; action: string; summary: string; createdAt: string }>;
};
type User = {
  id: string; name: string; email: string; emailVerified: boolean; createdAt: string | number | Date; updatedAt: string | number | Date;
  suspended: boolean; isAdmin: boolean; isEnvironmentAdmin: boolean; sessionCount: number; productCount: number;
};
type Provider = {
  providerId: string; label: string; baseUrl: string; model: string; fallbackModels: string[]; enabled: boolean; apiKeyHint: string;
  lastTestedAt: string | null; lastError: string | null; createdAt: string; updatedAt: string;
};
type ProviderDefinition = { id: string; name: string; kind: string; defaultBaseUrl: string; defaultModel: string; models?: Array<{ id: string; name: string }>; description: string };
type ProviderForm = { providerId: string; label: string; baseUrl: string; model: string; fallbackModels: string[]; apiKey: string; enabled: boolean };
type GooglePlayOAuthConfig = {
  configured: boolean; enabled: boolean; label: string; clientId: string; clientSecretHint: string;
  redirectUri: string; scopes: string[]; lastTestedAt: string | null; lastError: string | null;
  createdAt: string | null; updatedAt: string | null;
};
type GooglePlayOAuthForm = { clientId: string; clientSecret: string; enabled: boolean };

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "users", label: "Users", icon: "♙" },
  { id: "providers", label: "AI providers", icon: "✦" },
  { id: "integrations", label: "Integrations", icon: "◎" },
  { id: "environment", label: "Environment", icon: "⚙" },
];

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload as T;
}

function formatDate(value: string | number | Date | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function StatusPill({ good, children }: { good: boolean; children: React.ReactNode }) {
  return <span className={`admin-badge ${good ? "good" : "quiet"}`}><span className="admin-badge-dot" />{children}</span>;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [catalog, setCatalog] = useState<ProviderDefinition[]>([]);
  const [googlePlayOAuth, setGooglePlayOAuth] = useState<GooglePlayOAuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [providerForm, setProviderForm] = useState<ProviderForm>({ providerId: "", label: "", baseUrl: "", model: "", fallbackModels: [], apiKey: "", enabled: true });
  const [googlePlayOAuthForm, setGooglePlayOAuthForm] = useState<GooglePlayOAuthForm>({ clientId: "", clientSecret: "", enabled: true });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewData, usersData, providersData, googlePlayData] = await Promise.all([
        requestJson<Overview>("/api/admin/overview"),
        requestJson<{ users: User[] }>("/api/admin/users"),
        requestJson<{ providers: Provider[]; catalog: ProviderDefinition[] }>("/api/admin/providers"),
        requestJson<GooglePlayOAuthConfig>("/api/admin/integrations/google-play"),
      ]);
      setOverview(overviewData);
      setUsers(usersData.users);
      setProviders(providersData.providers);
      setCatalog(providersData.catalog);
      setGooglePlayOAuth(googlePlayData);
      setGooglePlayOAuthForm({ clientId: googlePlayData.clientId, clientSecret: "", enabled: googlePlayData.enabled });
      if (!providerForm.providerId && providersData.catalog[0]) {
        const first = providersData.catalog[0];
        const existing = providersData.providers.find((provider) => provider.providerId === first.id);
        setProviderForm({ providerId: first.id, label: existing?.label ?? first.name, baseUrl: existing?.baseUrl ?? first.defaultBaseUrl, model: existing?.model ?? first.defaultModel, fallbackModels: existing?.fallbackModels ?? [], apiKey: "", enabled: existing?.enabled ?? true });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the admin portal.");
    } finally {
      setLoading(false);
    }
  }, [providerForm.providerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const selectedDefinition = useMemo(() => catalog.find((item) => item.id === providerForm.providerId), [catalog, providerForm.providerId]);

  function selectProvider(providerId: string) {
    const existing = providers.find((provider) => provider.providerId === providerId);
    const definition = catalog.find((item) => item.id === providerId);
    setProviderForm({
      providerId,
      label: existing?.label ?? definition?.name ?? "",
      baseUrl: existing?.baseUrl ?? definition?.defaultBaseUrl ?? "",
      model: existing?.model ?? definition?.defaultModel ?? "",
      fallbackModels: existing?.fallbackModels ?? [],
      apiKey: "",
      enabled: existing?.enabled ?? true,
    });
  }

  async function runUserAction(user: User, action: "suspend" | "restore" | "revoke-sessions" | "promote-admin" | "revoke-admin") {
    const labels = { suspend: "Suspend this user?", restore: "Restore this user?", "revoke-sessions": "Revoke this user’s active sessions?", "promote-admin": "Grant this user administrator access?", "revoke-admin": "Remove this user’s administrator access?" };
    if (!window.confirm(labels[action])) return;
    setBusy(`user:${user.id}`); setError(""); setNotice("");
    try {
      await requestJson(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ action }) });
      setNotice("User access updated.");
      await loadData();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The user action failed."); }
    finally { setBusy(null); }
  }

  async function saveProvider(event: React.FormEvent) {
    event.preventDefault();
    setBusy("provider:save"); setError(""); setNotice("");
    try {
      await requestJson("/api/admin/providers", { method: "POST", body: JSON.stringify(providerForm) });
      setProviderForm((current) => ({ ...current, apiKey: "" }));
      setNotice("Provider saved. The secret is encrypted and will not be shown again.");
      await loadData();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The provider could not be saved."); }
    finally { setBusy(null); }
  }

  async function testProvider(providerId: string, model?: string) {
    const busyKey = model ? `provider:test:${providerId}:${model}` : `provider:test:${providerId}`;
    setBusy(busyKey); setError(""); setNotice("");
    try {
      const result = await requestJson<{ detail: string }>(`/api/admin/providers/${encodeURIComponent(providerId)}/test`, { method: "POST", body: JSON.stringify(model ? { model } : {}) });
      setNotice(result.detail); await loadData();
    } catch (testError) { setError(testError instanceof Error ? testError.message : "The provider test failed."); await loadData(); }
    finally { setBusy(null); }
  }

  async function removeProvider(provider: Provider) {
    if (!window.confirm(`Remove the ${provider.label} credentials? AI generation will fall back to the deployment key, if one exists.`)) return;
    setBusy(`provider:remove:${provider.providerId}`); setError(""); setNotice("");
    try { await requestJson(`/api/admin/providers/${encodeURIComponent(provider.providerId)}`, { method: "DELETE" }); setNotice("Provider removed."); selectProvider(catalog[0]?.id ?? ""); await loadData(); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : "The provider could not be removed."); }
    finally { setBusy(null); }
  }

  async function saveGooglePlayOAuth(event: React.FormEvent) {
    event.preventDefault();
    setBusy("google-play-oauth:save"); setError(""); setNotice("");
    try {
      await requestJson<GooglePlayOAuthConfig>("/api/admin/integrations/google-play", { method: "PUT", body: JSON.stringify(googlePlayOAuthForm) });
      setGooglePlayOAuthForm((current) => ({ ...current, clientSecret: "" }));
      setNotice("Google Play OAuth configuration saved. The secret is encrypted and will not be shown again.");
      await loadData();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The Google Play OAuth configuration could not be saved."); }
    finally { setBusy(null); }
  }

  async function testGooglePlayOAuth() {
    setBusy("google-play-oauth:test"); setError(""); setNotice("");
    try {
      const result = await requestJson<{ detail: string }>("/api/admin/integrations/google-play", { method: "POST" });
      setNotice(result.detail); await loadData();
    } catch (testError) { setError(testError instanceof Error ? testError.message : "The Google Play OAuth configuration could not be checked."); await loadData(); }
    finally { setBusy(null); }
  }

  async function removeGooglePlayOAuth() {
    if (!window.confirm("Remove the shared Google Play OAuth configuration? Existing product connections will remain until they are changed, but new authorization cannot start.")) return;
    setBusy("google-play-oauth:remove"); setError(""); setNotice("");
    try {
      await requestJson("/api/admin/integrations/google-play", { method: "DELETE" });
      setGooglePlayOAuth(null);
      setGooglePlayOAuthForm({ clientId: "", clientSecret: "", enabled: true });
      setNotice("Google Play OAuth configuration removed.");
      await loadData();
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "The Google Play OAuth configuration could not be removed."); }
    finally { setBusy(null); }
  }

  if (loading && !overview) return <main className="admin-loading"><div className="admin-loading-orbit">✦</div><p>Loading Sorted administration…</p></main>;

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/workspace"><span className="brand-mark">S</span><span><strong>sorted</strong><small>control plane</small></span></a>
        <p className="admin-sidebar-label">Manage Sorted</p>
        <nav className="admin-nav" aria-label="Admin sections">
          {tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}
        </nav>
        <div className="admin-sidebar-footer"><span className="admin-shield">✓</span><div><strong>Owner controls</strong><small>Changes are audited</small></div></div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar"><div><span className="admin-kicker">Sorted / administration</span><strong>{overview?.currentAdmin.name || "Administrator"}</strong></div><div className="admin-top-actions"><a href="/workspace">Back to workspace ↗</a><span className="admin-avatar">{(overview?.currentAdmin.email || "A").slice(0, 1).toUpperCase()}</span></div></header>
        <div className="admin-content">
          <div className="admin-heading"><div><p className="eyebrow">Private control plane</p><h1>{tabs.find((item) => item.id === tab)?.label}</h1><p>Manage the people, providers, and operating environment behind Sorted.</p></div><StatusPill good={Boolean(overview?.readiness.openCode)}>{overview?.readiness.openCode ? "AI runtime ready" : "AI runtime needs setup"}</StatusPill></div>
          {error && <div className="error-banner admin-banner">{error}</div>}
          {notice && <div className="notice admin-banner">{notice}</div>}

          {tab === "overview" && overview && <OverviewPanel overview={overview} onNavigate={setTab} />}
          {tab === "users" && <UsersPanel users={users} busy={busy} onAction={runUserAction} />}
          {tab === "providers" && <ProvidersPanel providers={providers} catalog={catalog} form={providerForm} busy={busy} selectedDefinition={selectedDefinition} onSelect={selectProvider} onChange={setProviderForm} onSave={saveProvider} onTest={testProvider} onRemove={removeProvider} />}
          {tab === "integrations" && <IntegrationsPanel config={googlePlayOAuth} form={googlePlayOAuthForm} busy={busy} onChange={setGooglePlayOAuthForm} onSave={saveGooglePlayOAuth} onTest={testGooglePlayOAuth} onRemove={removeGooglePlayOAuth} />}
          {tab === "environment" && overview && <EnvironmentPanel overview={overview} />}
        </div>
      </main>
    </div>
  );
}

function OverviewPanel({ overview, onNavigate }: { overview: Overview; onNavigate: (tab: Tab) => void }) {
  const metrics = [[overview.counts.users, "Registered users", "violet"], [overview.counts.verifiedUsers, "Verified accounts", "mint"], [overview.counts.products, "Products in workspace", "blue"], [overview.counts.configuredProviders, "Enabled AI providers", "amber"]];
  const readyCount = Object.values(overview.readiness).filter(Boolean).length;
  return <>
    <div className="admin-metric-grid">{metrics.map(([value, label, tone]) => <div className={`admin-metric ${tone}`} key={String(label)}><span className="admin-metric-value">{value}</span><span className="admin-metric-label">{label}</span><i /></div>)}</div>
    <div className="admin-dashboard-grid">
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">System pulse</p><h2>{readyCount}/{Object.keys(overview.readiness).length} foundations ready</h2></div><button className="text-button" onClick={() => onNavigate("environment")}>Review environment →</button></div><div className="admin-readiness-list">{Object.entries(overview.readiness).map(([key, value]) => <div key={key}><span className={`admin-readiness-icon ${value ? "ready" : "missing"}`}>{value ? "✓" : "!"}</span><span>{readinessLabel(key)}</span><strong>{value ? "Ready" : "Needs attention"}</strong></div>)}</div></section>
      <section className="admin-section admin-runtime-card"><p className="eyebrow">AI routing</p><h2>{overview.runtime.source === "managed" ? `${overview.runtime.providerId} provider active` : overview.runtime.source === "environment" ? "Deployment key active" : "No AI key connected"}</h2><p>{overview.runtime.model ? `${overview.runtime.model} · ${overview.runtime.baseUrl || "managed endpoint"}` : overview.runtime.baseUrl || "Add a provider in AI providers to enable generation."}</p><button className="secondary-button" onClick={() => onNavigate("providers")}>Manage providers</button></section>
    </div>
    <section className="admin-section admin-audit-section"><div className="admin-section-heading"><div><p className="eyebrow">Accountability</p><h2>Recent admin activity</h2></div><span className="admin-muted">Last 12 actions</span></div>{overview.audit.length ? <div className="admin-audit-list">{overview.audit.map((item) => <div key={item.id}><span className="admin-audit-mark">•</span><div><strong>{item.summary}</strong><small>{item.action} · {formatDate(item.createdAt)}</small></div></div>)}</div> : <p className="admin-empty">Administrative changes will appear here.</p>}</section>
  </>;
}

function UsersPanel({ users, busy, onAction }: { users: User[]; busy: string | null; onAction: (user: User, action: "suspend" | "restore" | "revoke-sessions" | "promote-admin" | "revoke-admin") => void }) {
  return <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Access and accounts</p><h2>People using Sorted</h2><p>Control access without touching their workspace content.</p></div><span className="admin-muted">{users.length} accounts</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Activity</th><th>Access</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="admin-user-cell"><span className="admin-user-avatar">{user.email.slice(0, 1).toUpperCase()}</span><div><strong>{user.name || "Unnamed user"}</strong><small>{user.email}</small></div></div></td><td><span>{user.productCount} product{user.productCount === 1 ? "" : "s"}</span><small>{user.sessionCount} active session{user.sessionCount === 1 ? "" : "s"}</small></td><td><div className="admin-status-stack"><StatusPill good={!user.suspended}>{user.suspended ? "Suspended" : "Active"}</StatusPill>{user.isAdmin && <span className="admin-role">Admin{user.isEnvironmentAdmin ? " · protected" : ""}</span>}</div></td><td><div className="admin-action-row"><button className="secondary-button compact" disabled={busy === `user:${user.id}`} onClick={() => onAction(user, user.suspended ? "restore" : "suspend")}>{user.suspended ? "Restore" : "Suspend"}</button><button className="icon-action" title="Revoke active sessions" disabled={busy === `user:${user.id}`} onClick={() => onAction(user, "revoke-sessions")}>⟳</button>{user.isAdmin ? <button className="icon-action" title="Revoke administrator access" disabled={user.isEnvironmentAdmin || busy === `user:${user.id}`} onClick={() => onAction(user, "revoke-admin")}>⌁</button> : <button className="icon-action" title="Grant administrator access" disabled={busy === `user:${user.id}`} onClick={() => onAction(user, "promote-admin")}>＋</button>}</div></td></tr>)}</tbody></table>{!users.length && <p className="admin-empty">No accounts have been created yet.</p>}</div></section>;
}

function ProvidersPanel({ providers, catalog, form, busy, selectedDefinition, onSelect, onChange, onSave, onTest, onRemove }: { providers: Provider[]; catalog: ProviderDefinition[]; form: ProviderForm; busy: string | null; selectedDefinition?: ProviderDefinition; onSelect: (id: string) => void; onChange: React.Dispatch<React.SetStateAction<ProviderForm>>; onSave: (event: React.FormEvent) => void; onTest: (id: string, model?: string) => void; onRemove: (provider: Provider) => void }) {
  const modelOptions = selectedDefinition?.models ?? [];
  const hasCurrentModel = modelOptions.some((option) => option.id === form.model);
  const fallbackSlots = [...form.fallbackModels, "", ""].slice(0, 3);
  const savedProvider = providers.find((provider) => provider.providerId === form.providerId);
  const testKey = (model?: string) => model ? "provider:test:" + form.providerId + ":" + model : "provider:test:" + form.providerId;
  const testButton = (model: string | undefined, label: string) => {
    if (!savedProvider || !model) return null;
    const key = testKey(model);
    return <button className="secondary-button compact" type="button" disabled={busy === key} onClick={() => onTest(form.providerId, model)}>{busy === key ? "Testing…" : label}</button>;
  };
  return <div className="admin-provider-layout">
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="eyebrow">Credentials and routing</p><h2>AI providers</h2><p>Store keys centrally and test them here. Sorted prefers an enabled OpenCode entry; when it is absent, the most recently saved enabled provider can serve generation using its configured model.</p></div></div>
      <form className="admin-provider-form" onSubmit={onSave}>
        <label>Provider<select value={form.providerId} onChange={(event) => onSelect(event.target.value)}>{catalog.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <div className="admin-form-grid">
          <label>Display label<input value={form.label} onChange={(event) => onChange((current) => ({ ...current, label: event.target.value }))} placeholder={selectedDefinition?.name} /></label>
          <label>Active model{modelOptions.length ? <select value={form.model} onChange={(event) => onChange((current) => ({ ...current, model: event.target.value }))}>{!hasCurrentModel && form.model && <option value={form.model}>Current: {form.model}</option>}{modelOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select> : <input value={form.model} onChange={(event) => onChange((current) => ({ ...current, model: event.target.value }))} placeholder={selectedDefinition?.defaultModel} />}</label>
        </div>
        {modelOptions.length > 0 && <div className="admin-routing-card">
          <div className="admin-section-heading"><div><p className="eyebrow">Fallback order</p><p>Used automatically when the active model fails. This routing applies to the whole Sorted workspace.</p></div></div>
          <div className="admin-routing-row admin-routing-active">{testButton(form.model, "Test active model")}</div>
          {fallbackSlots.map((modelId, index) => <div className="admin-routing-row" key={"fallback-" + index}>
            <label>Fallback {index + 1}<select value={modelId} onChange={(event) => { const next = [...fallbackSlots]; next[index] = event.target.value; onChange((current) => ({ ...current, fallbackModels: next.filter(Boolean).filter((id, position, list) => list.indexOf(id) === position && id !== current.model) })); }}><option value="">None</option>{modelOptions.filter((option) => option.id !== form.model).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            {testButton(modelId, "Test")}
          </div>)}
        </div>}
        <label>Base URL<input type="url" value={form.baseUrl} onChange={(event) => onChange((current) => ({ ...current, baseUrl: event.target.value }))} placeholder={selectedDefinition?.defaultBaseUrl} /></label>
        <label>API key <span className="admin-optional">(leave blank to keep the saved key)</span><input type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => onChange((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Enter a new key to rotate it" /></label>
        <label className="admin-checkbox"><input type="checkbox" checked={form.enabled} onChange={(event) => onChange((current) => ({ ...current, enabled: event.target.checked }))} />Use this provider for Sorted AI generation</label>
        <div className="admin-form-actions"><button className="primary-button" disabled={busy === "provider:save" || !form.providerId}>{busy === "provider:save" ? "Saving…" : "Save provider"}</button>{selectedDefinition && <span>{selectedDefinition.description}</span>}</div>
      </form>
    </section>
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="eyebrow">Configured keys</p><h2>Provider status</h2></div><span className="admin-muted">Secrets are never displayed</span></div>
      <div className="admin-provider-list">{providers.map((provider) => <div className="admin-provider-row" key={provider.providerId}><div className="admin-provider-icon">✦</div><div className="admin-provider-copy"><strong>{provider.label}</strong><small>{provider.providerId} · {provider.model}</small>{provider.fallbackModels.length > 0 && <small>Fallbacks: {provider.fallbackModels.join(", ")}</small>}<small>{provider.apiKeyHint} · tested {formatDate(provider.lastTestedAt)}</small>{provider.lastError && <em>{provider.lastError}</em>}</div><div className="admin-provider-actions"><StatusPill good={provider.enabled}>{provider.enabled ? "Enabled" : "Paused"}</StatusPill><button className="secondary-button compact" disabled={busy === testKey(provider.model)} onClick={() => onTest(provider.providerId)}>{busy === testKey(provider.model) ? "Testing…" : "Test"}</button><button className="icon-action danger" disabled={busy === "provider:remove:" + provider.providerId} onClick={() => onRemove(provider)} title="Remove provider">×</button></div></div>)}{!providers.length && <p className="admin-empty">No managed providers yet. The existing deployment key remains available until you add one.</p>}</div>
    </section>
  </div>;
}

function IntegrationsPanel({ config, form, busy, onChange, onSave, onTest, onRemove }: { config: GooglePlayOAuthConfig | null; form: GooglePlayOAuthForm; busy: string | null; onChange: React.Dispatch<React.SetStateAction<GooglePlayOAuthForm>>; onSave: (event: React.FormEvent) => void; onTest: () => void; onRemove: () => void }) {
  const configured = Boolean(config?.configured);
  return <div className="admin-integration-layout">
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="eyebrow">Shared app configuration</p><h2>Google Play OAuth</h2><p>Configure this once for Sorted. Each product owner will later authorize their own Google Play account; this client setup does not grant access by itself.</p></div><StatusPill good={configured && Boolean(config?.enabled)}>{configured ? (config?.enabled ? "Configured" : "Paused") : "Not configured"}</StatusPill></div>
      <form className="admin-provider-form" onSubmit={onSave}>
        <label>OAuth client ID<input value={form.clientId} onChange={(event) => onChange((current) => ({ ...current, clientId: event.target.value }))} placeholder="1234567890-…apps.googleusercontent.com" autoComplete="off" /></label>
        <label>Client secret <span className="admin-optional">({configured ? "leave blank to keep the saved secret" : "required for first setup"})</span><input type="password" value={form.clientSecret} onChange={(event) => onChange((current) => ({ ...current, clientSecret: event.target.value }))} placeholder={configured ? `Saved ${config?.clientSecretHint || "secret"}` : "Paste the Google OAuth client secret"} autoComplete="new-password" /></label>
        <label className="admin-checkbox"><input type="checkbox" checked={form.enabled} onChange={(event) => onChange((current) => ({ ...current, enabled: event.target.checked }))} />Allow Sorted users to connect Google Play accounts</label>
        <div className="admin-form-actions"><button className="primary-button" disabled={busy === "google-play-oauth:save"}>{busy === "google-play-oauth:save" ? "Saving…" : "Save configuration"}</button><span>Secrets are encrypted before they are stored.</span></div>
      </form>
      {config?.lastError && <p className="admin-integration-error">{config.lastError}</p>}
    </section>
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="eyebrow">Google Cloud setup</p><h2>OAuth details</h2><p>Use these exact values when you create the web OAuth client in Google Cloud.</p></div></div>
      <div className="admin-secret-field"><span>Authorized redirect URI</span><code>{config?.redirectUri || "https://sort3d.space/api/connections/google-play/callback"}</code></div>
      <div className="admin-secret-field"><span>Requested scopes</span><div className="admin-scope-list">{(config?.scopes ?? ["openid", "email", "https://www.googleapis.com/auth/androidpublisher"]).map((scope) => <code key={scope}>{scope}</code>)}</div></div>
      <div className="admin-integration-note"><strong>What happens next</strong><p>Users can connect a Google Play account from a product’s Connections area. Authorization is stored per product and never shared between workspaces.</p></div>
      <div className="admin-form-actions admin-integration-actions">{configured && <button className="secondary-button" type="button" disabled={busy === "google-play-oauth:test"} onClick={onTest}>{busy === "google-play-oauth:test" ? "Checking…" : "Check configuration"}</button>}{configured && <button className="icon-action danger" type="button" disabled={busy === "google-play-oauth:remove"} onClick={onRemove} title="Remove Google Play OAuth configuration">×</button>}<span>{config?.lastTestedAt ? `Checked ${formatDate(config.lastTestedAt)}` : "Not checked yet"}</span></div>
    </section>
  </div>;
}

function EnvironmentPanel({ overview }: { overview: Overview }) {
  return <><section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Deployment health</p><h2>Environment readiness</h2><p>These checks describe whether the current Cloudflare environment can support the Sorted workspace. Deployment variables are read-only here.</p></div></div><div className="admin-runtime-grid">{Object.entries(overview.readiness).map(([key, value]) => <div className="admin-runtime-item" key={key}><div><span className={`admin-readiness-icon ${value ? "ready" : "missing"}`}>{value ? "✓" : "!"}</span><strong>{readinessLabel(key)}</strong></div><StatusPill good={value}>{value ? "Ready" : "Needs attention"}</StatusPill><small>{environmentHelp(key)}</small></div>)}</div></section><section className="admin-section admin-security-note"><span className="admin-shield large">✓</span><div><p className="eyebrow">Credential policy</p><h2>Managed AI credentials are protected</h2><p>Provider keys are encrypted before they enter D1, never returned to the browser, and can be rotated or removed from AI providers. The original deployment key remains a fallback until you replace it.</p></div></section></>;
}

function readinessLabel(key: string) { return ({ betterAuthSecret: "Authentication secret", d1: "Workspace database", resend: "Email delivery", openCode: "AI runtime", adminAllowlist: "Admin bootstrap" } as Record<string, string>)[key] ?? key; }
function environmentHelp(key: string) { return ({ betterAuthSecret: "BETTER_AUTH_SECRET is available and strong enough for sessions and encrypted provider keys.", d1: "The Sorted D1 binding is available to the Worker.", resend: "Resend delivery is configured for account emails.", openCode: "At least one AI credential can be used for generation.", adminAllowlist: "SORTED_ADMIN_EMAILS can bootstrap the first administrator." } as Record<string, string>)[key] ?? ""; }
