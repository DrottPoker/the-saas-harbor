import { beforeAll, describe, expect, it } from "vitest";
import type { Listing, Profile } from "../../src/lib/data";
import { categories, categoryFromSlug, categorySlug } from "../../src/lib/domain";
import { escapeMarkdown, llmsText, makerMarkdown, productMarkdown } from "../../src/lib/markdown";
import { listMetadata, productSummary, profileDescription, websiteRel } from "../../src/lib/seo";
import {
  categoryJsonLd,
  faqJsonLd,
  leaderboardJsonLd,
  makerJsonLd,
  productJsonLd,
  serializeJsonLd,
  siteJsonLd,
  techJsonLd,
} from "../../src/lib/structured-data";
import { techFromSlug } from "../../src/lib/tech";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://harbor.example";
});

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    slug: "querybird",
    name: "QueryBird",
    tagline: "SQL reports for small teams",
    description: "Write a query once.\nGet a report every Monday.",
    category: "Developer Tools",
    website: "https://querybird.example",
    logo_path: null,
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    owner_id: "a0000000-0000-4000-8000-000000000001",
    owner_name: "Tomas Rivera",
    owner_slug: "tomas-rivera",
    owner_avatar_path: null,
    mrr_cents: 420_000,
    customers: 37,
    launched_on: "2025-11-01",
    verified_at: "2026-09-25T08:00:00Z",
    livemode: true,
    provider: "stripe",
    revenue_status: "verified",
    mrr_history: [
      { month: "2026-07", mrr_cents: 380_000 },
      { month: "2026-08", mrr_cents: 410_000 },
    ],
    mrr_growth_pct: 4.5,
    tech_stack: ["postgresql", "go", "gone-now"],
    verified_domain: null,
    domain_verified_at: null,
    revenue_30d_cents: null,
    revenue_12m_cents: null,
    revenue_total_cents: null,
    revenue_history: null,
    rank: 1,
    ...overrides,
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    slug: "tomas-rivera",
    name: "Tomas Rivera",
    headline: "Builds tools for data teams",
    location: "Lisbon",
    bio: "# Not a heading\n- not a list",
    website: "https://tomas.example",
    linkedin_url: "",
    github_url: "https://github.com/tomas",
    x_url: "",
    social_url: "",
    skills: ["SQL", "Go"],
    avatar_path: null,
    suspended_at: null,
    suspended_note: "",
    suspended_reason: null,
    updated_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

describe("category addresses", () => {
  it("turn names into slugs and back", () => {
    expect(categorySlug("AI & Machine Learning")).toBe("ai-machine-learning");
    expect(categorySlug("Developer Tools")).toBe("developer-tools");
    for (const category of categories)
      expect(categoryFromSlug(categorySlug(category))).toBe(category);
  });
  it("know only the listed categories", () => {
    expect(categoryFromSlug("crypto")).toBeNull();
    expect(categoryFromSlug("Developer-Tools")).toBeNull();
  });
});

describe("structured data", () => {
  it("describes the site and the organization behind it, with a raster logo", () =>
    expect(siteJsonLd()).toMatchObject({
      "@graph": [
        {
          "@type": "Organization",
          "@id": "https://harbor.example/#organization",
          url: "https://harbor.example/",
          logo: { url: "https://harbor.example/logo.png", width: 512, height: 512 },
        },
        {
          "@type": "WebSite",
          "@id": "https://harbor.example/#website",
          name: "The SaaS Harbor",
          publisher: { "@id": "https://harbor.example/#organization" },
        },
      ],
    }));

  it("lists the leaderboard's first page in rank order", () =>
    expect(
      leaderboardJsonLd([listing(), listing({ slug: "second", name: "Second", rank: 2 })]),
    ).toMatchObject({
      "@type": "CollectionPage",
      url: "https://harbor.example/",
      mainEntity: {
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: [
          { position: 1, name: "QueryBird", url: "https://harbor.example/saas/querybird" },
          { position: 2, name: "Second", url: "https://harbor.example/saas/second" },
        ],
      },
    }));

  it("gives a revenue ranking its own address and name", () =>
    expect(
      leaderboardJsonLd([listing()], {
        path: "/?by=12m",
        name: "SaaS ranked by verified revenue, 12 months",
      }),
    ).toMatchObject({
      url: "https://harbor.example/?by=12m",
      name: "SaaS ranked by verified revenue, 12 months",
      mainEntity: { itemListElement: [{ position: 1, name: "QueryBird" }] },
    }));

  it("repeats a page's questions and answers", () =>
    expect(
      faqJsonLd("/list-your-saas", "List your SaaS for free", [
        { question: "Is it free?", answer: "Yes." },
      ]),
    ).toMatchObject({
      "@type": "FAQPage",
      url: "https://harbor.example/list-your-saas",
      isPartOf: { "@id": "https://harbor.example/#website" },
      mainEntity: [
        {
          "@type": "Question",
          name: "Is it free?",
          acceptedAnswer: { "@type": "Answer", text: "Yes." },
        },
      ],
    }));

  it("ties every page to the site", () => {
    const site = { "@id": "https://harbor.example/#website" };
    expect(productJsonLd(listing())).toMatchObject({ isPartOf: site });
    expect(makerJsonLd(profile())).toMatchObject({ isPartOf: site });
    expect(categoryJsonLd("Design", [])).toMatchObject({ isPartOf: site });
    expect(leaderboardJsonLd([])).toMatchObject({ isPartOf: site });
  });

  it("describes a product with its category, maker and addresses", () =>
    expect(productJsonLd(listing())).toMatchObject({
      url: "https://harbor.example/saas/querybird",
      mainEntity: {
        "@type": "SoftwareApplication",
        name: "QueryBird",
        applicationCategory: "DeveloperApplication",
        applicationSubCategory: "Developer Tools",
        url: "https://querybird.example",
        datePublished: "2025-11-01",
        creator: { name: "Tomas Rivera", url: "https://harbor.example/users/tomas-rivera" },
      },
      breadcrumb: {
        itemListElement: [
          { item: "https://harbor.example/discover" },
          { item: "https://harbor.example/categories/developer-tools" },
          { item: "https://harbor.example/saas/querybird" },
        ],
      },
    }));

  it("links a maker's profiles and leaves out empty ones", () => {
    expect(makerJsonLd(profile())).toMatchObject({
      "@type": "ProfilePage",
      mainEntity: { sameAs: ["https://tomas.example", "https://github.com/tomas"] },
    });
    expect(JSON.parse(serializeJsonLd(makerJsonLd(profile({ location: "" }))))).not.toHaveProperty(
      "mainEntity.homeLocation",
    );
  });

  it("lists a category's ranked products in order", () =>
    expect(
      categoryJsonLd("Developer Tools", [
        listing(),
        listing({ slug: "second", name: "Second", rank: 7 }),
      ]),
    ).toMatchObject({
      mainEntity: {
        itemListElement: [
          { position: 1, url: "https://harbor.example/saas/querybird" },
          { position: 2, url: "https://harbor.example/saas/second" },
        ],
      },
    }));

  it("lists a technology's ranked products under the technology overview", () =>
    expect(techJsonLd(techFromSlug("go")!, [listing()])).toMatchObject({
      url: "https://harbor.example/tech/go",
      name: "SaaS built with Go",
      breadcrumb: {
        itemListElement: [
          { item: "https://harbor.example/tech" },
          { item: "https://harbor.example/tech/go" },
        ],
      },
      mainEntity: {
        itemListElement: [{ position: 1, url: "https://harbor.example/saas/querybird" }],
      },
    }));

  it("cannot close its script element", () =>
    expect(serializeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("<"));
});

describe("markdown", () => {
  it("escapes structure in text makers wrote", () => {
    expect(escapeMarkdown("# Title\n- item\n1. first\n[link](https://x.example) *bold* <b>")).toBe(
      "\\# Title\n\\- item\n1\\. first\n\\[link\\](https://x.example) \\*bold\\* \\<b\\>",
    );
    expect(escapeMarkdown("Up 20% - in 3 months")).toBe("Up 20% - in 3 months");
    // A tilde fence would open a code block that swallows the rest of the file.
    expect(escapeMarkdown("~~~\nnot code ~~struck~~")).toBe(
      "\\~\\~\\~\nnot code \\~\\~struck\\~\\~",
    );
  });

  it("describes a product with its shared figures and history", () => {
    const text = productMarkdown(listing());
    expect(text).toContain("# QueryBird\n\n> SQL reports for small teams");
    expect(text).toContain("- Page: https://harbor.example/saas/querybird");
    expect(text).toContain(
      "- Founder: [Tomas Rivera](https://harbor.example/users/tomas-rivera.md)",
    );
    expect(text).toContain("- Monthly recurring revenue: $4,200");
    expect(text).toContain("- Change over 30 days: +4.5%");
    expect(text).toContain("- Paying customers: 37");
    expect(text).toContain("| August 2026 | $4,100 |");
    expect(text).toContain("written by the users who list them");
  });

  it("adds revenue besides MRR where the founder shares it", () => {
    expect(productMarkdown(listing())).not.toContain("Revenue, last 30 days");
    const text = productMarkdown(
      listing({
        revenue_status: "private",
        mrr_cents: null,
        mrr_growth_pct: null,
        revenue_30d_cents: 510_000,
        revenue_12m_cents: 4_800_000,
        revenue_total_cents: null,
      }),
    );
    expect(text).toContain("- Monthly recurring revenue: not shared");
    expect(text).toContain("- Revenue, last 30 days: $5,100");
    expect(text).toContain("- Revenue, last 12 months: $48,000");
    expect(text).toContain("- Revenue, all time: not shared");
    expect(text).toContain("- Verified with: Stripe");
  });

  it("lists revenue by month where it is shared, split where every month is", () => {
    const months = [
      { month: "2026-07", cents: 120_000, subscription_cents: 100_000, one_time_cents: 20_000 },
      { month: "2026-08", cents: 150_000, subscription_cents: 110_000, one_time_cents: 40_000 },
    ];
    const shared = { revenue_30d_cents: 150_000, revenue_history: months };
    expect(productMarkdown(listing({ revenue_history: months }))).not.toContain(
      "### Revenue by month",
    );
    const split = productMarkdown(listing(shared));
    expect(split).toContain(
      "### Revenue by month\n\n| Month | Subscriptions | One-time purchases | Revenue |",
    );
    expect(split).toContain("| August 2026 | $1,100 | $400 | $1,500 |");
    const total = productMarkdown(
      listing({ ...shared, revenue_history: [months[0], { month: "2026-08", cents: 150_000 }] }),
    );
    expect(total).toContain("| Month | Revenue |");
    expect(total).toContain("| July 2026 | $1,200 |");
  });

  it("says when the founder verified the website's domain", () => {
    expect(
      productMarkdown(
        listing({
          verified_domain: "querybird.example",
          domain_verified_at: "2026-09-26T06:00:00Z",
        }),
      ),
    ).toContain(
      "- Domain: querybird.example, verified with a DNS record, last checked Sep 26, 2026",
    );
    expect(productMarkdown(listing())).toContain("- Domain: not verified");
  });

  it("lists the tech stack by group, linking each technology", () => {
    const text = productMarkdown(listing());
    expect(text).toContain(
      "## Tech stack\n\n- Backend: [Go](https://harbor.example/tech/go)\n- Databases: [PostgreSQL](https://harbor.example/tech/postgresql)",
    );
    expect(text).not.toContain("gone-now");
    expect(productMarkdown(listing({ tech_stack: [] }))).not.toContain("## Tech stack");
  });

  it("says why a figure is missing and shows no history for it", () => {
    const text = productMarkdown(
      listing({
        revenue_status: "private",
        mrr_cents: null,
        customers: null,
        mrr_growth_pct: null,
        launched_on: null,
      }),
    );
    expect(text).toContain("- Monthly recurring revenue: not shared");
    // Every figure the page shows says so, as on the HTML page, rather than going missing.
    expect(text).toContain("- Paying customers: not shared");
    expect(text).toContain("- Launched: not shared");
    expect(text).not.toContain("MRR at month end");
    expect(text).not.toContain("$");
    expect(text).not.toContain("Verified with");
    // An unverified product reads the same as a private one.
    for (const revenue_status of ["unverified", "stale"]) {
      const other = productMarkdown(listing({ revenue_status, mrr_cents: null, customers: null }));
      expect(other).toContain("- Monthly recurring revenue: not shared");
      expect(other).not.toContain("Last verified");
      // The domain may still read not verified; the revenue section may not.
      const revenue = other.split("## Revenue")[1].split("\n## ")[0];
      expect(revenue).not.toMatch(/verif|out of date/i);
    }
  });

  it("keeps a product name from breaking the page", () => {
    const text = productMarkdown(listing({ name: "Evil](https://evil.example) # x" }));
    expect(text).toContain("# Evil\\](https://evil.example) # x");
    expect(text).not.toContain("[Evil]");
  });

  it("describes a maker with products, experience and skills", () => {
    const text = makerMarkdown(
      profile(),
      [listing(), listing({ slug: "private-one", name: "Private One", revenue_status: "private" })],
      [
        {
          id: "r1",
          profile_id: "a0000000-0000-4000-8000-000000000001",
          title: "Founder",
          organization: "QueryBird",
          description: "",
          starts_on: "2024-01-01",
          ends_on: null,
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      { mrr: 420_000, customers: 37 },
    );
    expect(text).toContain("# Tomas Rivera\n\n> Builds tools for data teams");
    expect(text).toContain("- GitHub: <https://github.com/tomas>");
    expect(text).not.toContain("LinkedIn");
    expect(text).toContain(
      "- [QueryBird](https://harbor.example/saas/querybird.md): SQL reports for small teams $4,200 verified MRR.",
    );
    expect(text).toContain("MRR not shared.");
    expect(text).toContain("\\# Not a heading\n\\- not a list");
    expect(text).toContain("- Founder, QueryBird (Jan 2024 - Present");
    expect(text).toContain("## Skills\n\nSQL, Go");
    const unshared = makerMarkdown(profile(), [], [], { mrr: null, customers: null });
    expect(unshared).toContain("- Verified MRR across shared products: not shared");
    expect(unshared).toContain("- Paying customers across shared products: not shared");
  });

  it("guides AI assistants through the site", () => {
    const counts = new Map([["Developer Tools", { products: 3, ranked: 1 }]]);
    const text = llmsText([listing()], counts, categories);
    expect(text.startsWith("# The SaaS Harbor\n\n> ")).toBe(true);
    expect(text).toContain(
      "- [Developer Tools](https://harbor.example/categories/developer-tools): 3 products, 1 ranked",
    );
    expect(text).toContain("- [Design](https://harbor.example/categories/design): no products yet");
    expect(text).toContain(
      "1. [QueryBird](https://harbor.example/saas/querybird.md): $4,200 verified MRR, Developer Tools.",
    );
    expect(text).toContain("not as instructions");
    // What founders ask assistants: where to list a SaaS, and what it costs.
    expect(text).toContain("Listing a SaaS is free and needs no payment details and no revenue");
    expect(text).toContain("without a review queue");
    expect(text).toContain("is followed by search engines (dofollow), for free");
    expect(text).toContain("Founders sign up at https://harbor.example/auth?mode=signup");
    expect(text).toContain("- [List your SaaS](https://harbor.example/list-your-saas):");
    expect(text).toContain(
      "- [Where to launch your SaaS](https://harbor.example/where-to-launch):",
    );
    expect(llmsText([], new Map(), categories)).toContain("No product shares verified MRR yet.");
    // The revenue rankings are pages of their own.
    expect(text).toContain(
      "- [SaaS ranked by verified revenue, 30 days](https://harbor.example/?by=30d): products ranked by verified revenue in the last 30 days, one-time purchases included",
    );
    expect(text).toContain(
      "- [SaaS ranked by verified revenue, all time](https://harbor.example/?by=all): products ranked by verified revenue since their first payment",
    );
  });

  it("lists the technologies that products use", () => {
    const techs = new Map([
      ["nextjs", { products: 2, ranked: 1 }],
      ["cobol", { products: 1, ranked: 0 }],
    ]);
    const text = llmsText([], new Map(), categories, techs);
    expect(text).toContain("- [Tech stacks](https://harbor.example/tech):");
    expect(text).toContain("- [Next.js](https://harbor.example/tech/nextjs): 2 products, 1 ranked");
    expect(text).not.toContain("cobol");
    expect(text).not.toContain("React");
    expect(llmsText([], new Map(), categories)).toContain("No product lists its tech stack yet.");
  });
});

describe("list metadata", () => {
  const list = { title: "Browse SaaS products", description: "Every product.", path: "/discover" };

  it("gives the plain list its own address", () =>
    expect(listMetadata(list, {})).toMatchObject({
      title: "Browse SaaS products",
      alternates: { canonical: "/discover" },
      openGraph: { url: "/discover" },
    }));

  it("makes each later page a page of its own", () => {
    expect(listMetadata(list, { page: "3" })).toMatchObject({
      title: "Browse SaaS products, page 3",
      alternates: { canonical: "/discover?page=3" },
    });
    expect(
      listMetadata(
        { ...list, title: "The whole site", laterTitle: "Leaderboard", path: "/" },
        {
          page: "2",
        },
      ),
    ).toMatchObject({ title: "Leaderboard, page 2", alternates: { canonical: "/?page=2" } });
    // An invalid or first page is the plain list.
    expect(listMetadata(list, { page: "x" })).toMatchObject({
      alternates: { canonical: "/discover" },
    });
  });

  it("points filtered lists at the plain one and keeps searches out of the index", () => {
    for (const params of [{ category: "Design", page: "2" }, { tech: "go" }])
      expect(listMetadata(list, params)).toMatchObject({
        title: "Browse SaaS products",
        alternates: { canonical: "/discover" },
      });
    expect(listMetadata(list, {})).not.toHaveProperty("robots");
    expect(listMetadata(list, { q: "query", page: "2" })).toMatchObject({
      robots: { index: false, follow: true },
      alternates: { canonical: "/discover" },
    });
    expect(listMetadata(list, { q: "  " })).not.toHaveProperty("robots");
  });
});

describe("product titles and descriptions", () => {
  it("carry verified MRR and paying customers", () =>
    expect(productSummary(listing())).toEqual({
      title: "QueryBird: $4,200 verified MRR",
      description: "SQL reports for small teams. Verified MRR $4,200 from 37 paying customers.",
    }));

  it("end the tagline as a sentence without doubling its punctuation", () => {
    expect(productSummary(listing({ tagline: "Reports, fast!" })).description).toMatch(
      /^Reports, fast! Verified/,
    );
    expect(productSummary(listing({ tagline: "Reports." })).description).toMatch(
      /^Reports\. Verified/,
    );
  });

  it("leave out figures of zero", () =>
    expect(productSummary(listing({ mrr_cents: 0, customers: 0 }))).toEqual({
      title: "QueryBird",
      description: "SQL reports for small teams.",
    }));

  it("show revenue from all payments when there is no MRR", () =>
    expect(
      productSummary(
        listing({
          mrr_cents: 0,
          customers: 0,
          revenue_12m_cents: 90_000,
          revenue_total_cents: 150_050,
        }),
      ),
    ).toEqual({
      title: "QueryBird: $1,500.50 verified revenue",
      description: "SQL reports for small teams. Verified revenue, all time: $1,500.50.",
    }));

  it("add revenue beside MRR", () =>
    expect(productSummary(listing({ revenue_total_cents: 5_000_000 })).description).toBe(
      "SQL reports for small teams. Verified MRR $4,200 from 37 paying customers. Verified revenue, all time: $50,000.",
    ));

  it("show only what is shared and verified", () => {
    for (const overrides of [{ mrr_cents: null }, { revenue_status: "stale" }])
      expect(productSummary(listing({ ...overrides, customers: null }))).toEqual({
        title: "QueryBird",
        description: "SQL reports for small teams.",
      });
  });
});

describe("profile descriptions", () => {
  const person = { name: "Tomas Rivera", headline: "Builds tools for data teams", bio: "" };

  it("name the products the user is the founder of", () => {
    expect(profileDescription(person, ["QueryBird"])).toBe(
      "Builds tools for data teams. Founder of QueryBird.",
    );
    expect(profileDescription(person, ["A", "B"])).toBe(
      "Builds tools for data teams. Founder of A and B.",
    );
    expect(profileDescription(person, ["A", "B", "C", "D", "E"])).toBe(
      "Builds tools for data teams. Founder of A, B, C and 2 more.",
    );
  });

  it("start with the About section when there is no headline", () =>
    expect(
      profileDescription({ ...person, headline: "", bio: "I build things" }, ["QueryBird"]),
    ).toBe("I build things. Founder of QueryBird."));

  it("fall back to the name", () => {
    expect(profileDescription({ ...person, headline: "" }, ["QueryBird"])).toBe(
      "Tomas Rivera, founder of QueryBird, on The SaaS Harbor.",
    );
    expect(profileDescription({ ...person, headline: "" }, [])).toBe(
      "Tomas Rivera on The SaaS Harbor",
    );
    expect(profileDescription(person, [])).toBe("Builds tools for data teams.");
  });
});

describe("the link to a product's website", () => {
  it("is followed only while the product's revenue is verified", () => {
    expect(websiteRel("verified")).toBe("noopener");
    expect(websiteRel("private")).toBe("noopener");
    for (const status of ["stale", "unverified", null, undefined])
      expect(websiteRel(status)).toBe("noopener nofollow");
  });
  it("keeps the referrer, so founders see the visits", () => {
    expect(websiteRel("verified")).not.toContain("noreferrer");
    expect(websiteRel("unverified")).not.toContain("noreferrer");
  });
});
