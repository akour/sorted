import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAuthEmailContent } from "../lib/auth-email-content.ts";

describe("Sorted auth email content", () => {
  it("includes verification links in both text and HTML formats", () => {
    const url = "https://sort3d.space/api/auth/verify-email?token=abc&callbackURL=%2Fworkspace";
    const content = createAuthEmailContent("verification", url);

    assert.equal(content.subject, "Verify your Sorted email");
    assert.ok(content.text.includes(url));
    assert.ok(content.html.includes("Verify email"));
    assert.ok(content.html.includes("token=abc&amp;callbackURL="));
  });

  it("escapes untrusted link characters before placing a URL in HTML", () => {
    const url = "https://sort3d.space/reset?next=\"<script>alert(1)</script>&token=abc";
    const content = createAuthEmailContent("password-reset", url);

    assert.equal(content.subject, "Reset your Sorted password");
    assert.ok(content.text.includes(url));
    assert.ok(!content.html.includes("<script>"));
    assert.ok(content.html.includes("&quot;&lt;script&gt;"));
    assert.ok(content.html.includes("&amp;token=abc"));
  });

  it("rejects non-web authentication links", () => {
    assert.throws(() => createAuthEmailContent("verification", "javascript:alert(1)"));
  });
});
