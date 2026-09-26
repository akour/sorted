import Link from "next/link";

const workflow = [
  {
    number: "01",
    title: "Research",
    text: "Ground the work in your product, audience, competitors, and current store listing.",
    tone: "lavender",
  },
  {
    number: "02",
    title: "Optimize",
    text: "Shape the store listing and answer content around real search intent.",
    tone: "mint",
  },
  {
    number: "03",
    title: "Create",
    text: "Turn the strategy into editable copy, creative briefs, and event packages.",
    tone: "peach",
  },
  {
    number: "04",
    title: "Review & hand off",
    text: "Check every deliverable, then prepare it for the right channel.",
    tone: "blue",
  },
];

function BrandMark() {
  return (
    <span className="marketing-brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function HomePage() {
  return (
    <main className="marketing-site">
      <header className="marketing-header">
        <Link className="marketing-brand" href="/" aria-label="Sorted home">
          <BrandMark />
          <span>sorted</span>
        </Link>

        <nav className="marketing-nav" aria-label="Main navigation">
          <a href="#products">Products</a>
          <a href="#use-cases">Use cases</a>
          <a href="#how-it-works">How it works</a>
          <a href="#why-sorted">Why Sorted</a>
        </nav>

        <div className="marketing-account-nav">
          <Link className="marketing-sign-in" href="/sign-in">Sign in</Link>
          <Link className="marketing-header-cta" href="/sign-up">
            Create account <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      <section className="marketing-hero" aria-labelledby="hero-title">
        <div className="marketing-hero-copy">
          <p className="marketing-kicker"><span /> Organic growth for apps and games</p>
          <h1 id="hero-title">Make organic growth feel <em>sorted.</em></h1>
          <p className="marketing-hero-description">
            Research, store optimization, answer content, creative briefs, and promo events—together in one clear workflow for your mobile products.
          </p>
          <div className="marketing-hero-actions">
            <Link className="marketing-button marketing-button-primary" href="/workspace">
              Explore the workspace <span aria-hidden="true">→</span>
            </Link>
            <a className="marketing-button marketing-button-quiet" href="#how-it-works">
              See how it works <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="marketing-proof-line" aria-label="Product principles">
            <span><i aria-hidden="true">✓</i> Research-led</span>
            <span><i aria-hidden="true">✓</i> Editable by design</span>
            <span><i aria-hidden="true">✓</i> Review before publishing</span>
          </div>
        </div>

        <div className="marketing-hero-visual">
          <div className="marketing-orbit marketing-orbit-one" aria-hidden="true" />
          <div className="marketing-orbit marketing-orbit-two" aria-hidden="true" />
          <div className="product-preview" aria-label="Illustrative preview of a Sorted product workspace">
            <div className="preview-window-bar">
              <div className="preview-window-dots" aria-hidden="true"><i /><i /><i /></div>
              <span>sorted / product workspace</span>
              <span className="preview-menu" aria-hidden="true">···</span>
            </div>
            <div className="preview-body">
              <aside className="preview-sidebar" aria-hidden="true">
                <div className="preview-mini-brand"><BrandMark /></div>
                <span className="preview-side-active">⌂</span>
                <span>◇</span>
                <span>□</span>
                <span>◒</span>
              </aside>
              <div className="preview-content">
                <div className="preview-breadcrumb">Products <span>/</span> Your product</div>
                <div className="preview-title-row">
                  <div>
                    <span className="preview-eyebrow">PRODUCT WORKSPACE</span>
                    <h2>Your growth, in one place.</h2>
                  </div>
                  <span className="preview-review-pill"><i /> Review first</span>
                </div>
                <div className="preview-product-card">
                  <div className="preview-app-icon" aria-hidden="true"><span>✳</span></div>
                  <div className="preview-product-copy"><strong>Your mobile app</strong><small>Product foundation</small></div>
                  <span className="preview-product-more" aria-hidden="true">···</span>
                </div>
                <div className="preview-section-heading"><strong>Growth workflow</strong><span>Open a step to continue <b>↗</b></span></div>
                <div className="preview-steps">
                  <div className="preview-step is-ready">
                    <span className="preview-step-icon">⌕</span><span><strong>Research</strong><small>Audience and search foundation</small></span><b>✓</b>
                  </div>
                  <div className="preview-step is-active">
                    <span className="preview-step-icon">↗</span><span><strong>Optimize</strong><small>ASO, SEO, and answer content</small></span><b>→</b>
                  </div>
                  <div className="preview-step">
                    <span className="preview-step-icon">✦</span><span><strong>Create</strong><small>Copy, briefs, and promo packages</small></span><b>›</b>
                  </div>
                  <div className="preview-step">
                    <span className="preview-step-icon">⇧</span><span><strong>Review & publish</strong><small>Prepare a human-reviewed handoff</small></span><b>›</b>
                  </div>
                </div>
                <div className="preview-footer-note"><span aria-hidden="true">✳</span> Your research and current metadata stay close to the work.</div>
              </div>
            </div>
          </div>
          <div className="preview-caption"><span /> One connected workspace <span>Illustrative product preview</span></div>
        </div>
      </section>

      <section className="marketing-audience" id="products">
        <div className="marketing-section-label"><span>01</span><span>Built around your product</span></div>
        <div className="marketing-audience-heading">
          <h2>One workflow for every<br />kind of mobile product.</h2>
          <p>Keep the thinking and the work connected, whether you’re growing an app, a game, or the content around it.</p>
        </div>
        <div className="marketing-audience-grid" id="use-cases">
          <article className="audience-card audience-card-lilac">
            <span className="audience-icon" aria-hidden="true">▣</span>
            <p className="marketing-card-kicker">FOR APP TEAMS</p>
            <h3>Mobile apps</h3>
            <p>Connect user needs to clearer listings, useful answers, and a steady stream of launch-ready content.</p>
            <a href="#how-it-works">Explore the workflow <span aria-hidden="true">↗</span></a>
          </article>
          <article className="audience-card audience-card-mint">
            <span className="audience-icon" aria-hidden="true">✳</span>
            <p className="marketing-card-kicker">FOR GAME TEAMS</p>
            <h3>Mobile games</h3>
            <p>Plan store updates and reusable promo moments with the product context and creative guidance close by.</p>
            <a href="#how-it-works">Explore the workflow <span aria-hidden="true">↗</span></a>
          </article>
          <article className="audience-card audience-card-peach">
            <span className="audience-icon" aria-hidden="true">⌘</span>
            <p className="marketing-card-kicker">FOR GROWTH LEADS</p>
            <h3>Organic growth</h3>
            <p>Bring ASO, SEO, and answer engine optimization into one evidence-led operating space.</p>
            <a href="#why-sorted">Why Sorted <span aria-hidden="true">↗</span></a>
          </article>
        </div>
      </section>

      <section className="marketing-workflow" id="how-it-works">
        <div className="marketing-section-label"><span>02</span><span>From product context to ready-to-review work</span></div>
        <div className="marketing-workflow-heading">
          <div><p className="marketing-kicker"><span /> A clear path forward</p><h2>Know what to do next.<br /><em>Keep the why attached.</em></h2></div>
          <p>Each step uses the foundation before it, so your output stays connected to the product instead of becoming another disconnected document.</p>
        </div>
        <div className="workflow-cards">
          {workflow.map((step) => (
            <article className={`workflow-card workflow-card-${step.tone}`} key={step.number}>
              <span className="workflow-number">{step.number}</span>
              <div className="workflow-line" aria-hidden="true"><span /></div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
        <div className="workflow-footnote"><span aria-hidden="true">↳</span> Nothing goes live automatically. You can review and edit the work at every step.</div>
      </section>

      <section className="marketing-principles" id="why-sorted">
        <div className="principles-copy">
          <div className="marketing-section-label"><span>03</span><span>Why Sorted</span></div>
          <h2>Less tab hopping.<br /><em>More connected thinking.</em></h2>
          <p>Sorted keeps the product, its research, and the work that follows in view—so a better decision doesn’t get lost between tools.</p>
          <Link className="marketing-text-link" href="/workspace">Take a look inside <span aria-hidden="true">→</span></Link>
        </div>
        <div className="principle-list">
          <article><span className="principle-icon">01</span><div><h3>Grounded in your product</h3><p>Use research and current listing details as the starting point for AI-assisted work.</p></div><span className="principle-check">✓</span></article>
          <article><span className="principle-icon">02</span><div><h3>Made for human review</h3><p>Every generated draft stays visible and editable before you hand it off.</p></div><span className="principle-check">✓</span></article>
          <article><span className="principle-icon">03</span><div><h3>One connected workflow</h3><p>Move from research to optimization, creation, promo planning, and reporting.</p></div><span className="principle-check">✓</span></article>
        </div>
      </section>

      <section className="marketing-final-cta">
        <div className="cta-spark" aria-hidden="true">✳</div>
        <p className="marketing-kicker"><span /> A little more order goes a long way</p>
        <h2>Start with one product.<br /><em>Build from what you know.</em></h2>
        <p>Bring your product context into one place and take the next growth step with clarity.</p>
        <Link className="marketing-button marketing-button-primary" href="/workspace">Explore the workspace <span aria-hidden="true">→</span></Link>
      </section>

      <footer className="marketing-footer">
        <Link className="marketing-brand" href="/" aria-label="Sorted home"><BrandMark /><span>sorted</span></Link>
        <p>Organic growth, in one clear workspace.</p>
        <a href="#hero-title">Back to top <span aria-hidden="true">↑</span></a>
        <small>© {new Date().getFullYear()} Sorted</small>
      </footer>
    </main>
  );
}
