declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENCODE_API_KEY?: string;
    OPENCODE_BASE_URL?: string;
    OPENCODE_MODEL?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    RESEND_API_KEY?: string;
    SORTED_AUTH_EMAIL_FROM?: string;
    SORTED_AUTH_EMAIL_ENABLED?: string;
  }
}
