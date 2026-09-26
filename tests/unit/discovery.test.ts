import { beforeAll, describe, expect, it } from "vitest";
import type { Listing, Profile } from "../../src/lib/data";
import { categories, categoryFromSlug, categorySlug } from "../../src/lib/domain";
import { escapeMarkdown, llmsText, makerMarkdown, productMarkdown } from "../../src/lib/markdown";
import { websiteRel } from "../../src/lib/seo";
import {
  categoryJsonLd,
  makerJsonLd,
  productJsonLd,
  serializeJsonLd,
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
    screenshot_path: null,
    screenshot_taken_at: null,
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
      }),
    );
    expect(text).toContain("- Monthly recurring revenue: not shared");
    expect(text).not.toContain("MRR at month end");
    expect(text).not.toContain("$");
    expect(
      productMarkdown(listing({ revenue_status: "unverified", mrr_cents: null })),
    ).not.toContain("Last verified");
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
    expect(llmsText([], new Map(), categories)).toContain("No product shares verified MRR yet.");
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
