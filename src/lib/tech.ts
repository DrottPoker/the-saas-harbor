// The technologies a founder can say a product is built with, grouped the way the product editor
// and the product page show them. Each has a page at /tech/<slug> listing the products that use
// it. The database stores the slugs (saas.tech_stack) and checks only their form, so a slug that
// leaves this list is ignored wherever a stack is shown.

export const techGroups = [
  "Frontend",
  "Mobile and desktop",
  "No-code",
  "Backend",
  "Databases",
  "Hosting and infrastructure",
  "Payments",
  "AI",
  "Services",
] as const;
export type TechGroup = (typeof techGroups)[number];
export type Tech = { slug: string; name: string; group: TechGroup };

/** At most this many technologies per product, as the database checks. */
export const TECH_STACK_MAX = 20;

const catalog: Record<TechGroup, [slug: string, name: string][]> = {
  Frontend: [
    ["nextjs", "Next.js"],
    ["react", "React"],
    ["vuejs", "Vue.js"],
    ["nuxt", "Nuxt"],
    ["svelte", "Svelte"],
    ["sveltekit", "SvelteKit"],
    ["angular", "Angular"],
    ["astro", "Astro"],
    ["remix", "Remix"],
    ["solidjs", "Solid.js"],
    ["htmx", "HTMX"],
    ["jquery", "jQuery"],
    ["typescript", "TypeScript"],
    ["javascript", "JavaScript"],
    ["tailwind-css", "Tailwind CSS"],
    ["sass", "Sass"],
    ["redux", "Redux"],
  ],
  "Mobile and desktop": [
    ["react-native", "React Native"],
    ["expo", "Expo"],
    ["flutter", "Flutter"],
    ["swift", "Swift"],
    ["swiftui", "SwiftUI"],
    ["objective-c", "Objective-C"],
    ["kotlin", "Kotlin"],
    ["jetpack-compose", "Jetpack Compose"],
    ["ionic", "Ionic"],
    ["capacitor", "Capacitor"],
    ["xamarin", "Xamarin"],
    ["electron", "Electron"],
    ["tauri", "Tauri"],
    ["unity", "Unity"],
    ["unreal-engine", "Unreal Engine"],
  ],
  "No-code": [
    ["bubble", "Bubble"],
    ["framer", "Framer"],
    ["webflow", "Webflow"],
    ["wordpress", "WordPress"],
    ["shopify", "Shopify"],
  ],
  Backend: [
    ["nodejs", "Node.js"],
    ["bun", "Bun"],
    ["deno", "Deno"],
    ["express", "Express"],
    ["nestjs", "NestJS"],
    ["hono", "Hono"],
    ["python", "Python"],
    ["django", "Django"],
    ["fastapi", "FastAPI"],
    ["flask", "Flask"],
    ["ruby", "Ruby"],
    ["ruby-on-rails", "Ruby on Rails"],
    ["php", "PHP"],
    ["laravel", "Laravel"],
    ["go", "Go"],
    ["rust", "Rust"],
    ["java", "Java"],
    ["spring", "Spring"],
    ["dotnet", ".NET"],
    ["csharp", "C#"],
    ["elixir", "Elixir"],
    ["graphql", "GraphQL"],
  ],
  Databases: [
    ["postgresql", "PostgreSQL"],
    ["mysql", "MySQL"],
    ["sqlite", "SQLite"],
    ["mongodb", "MongoDB"],
    ["redis", "Redis"],
    ["supabase", "Supabase"],
    ["firebase", "Firebase"],
    ["planetscale", "PlanetScale"],
    ["neon", "Neon"],
    ["turso", "Turso"],
    ["convex", "Convex"],
    ["pocketbase", "PocketBase"],
    ["appwrite", "Appwrite"],
    ["clickhouse", "ClickHouse"],
    ["elasticsearch", "Elasticsearch"],
    ["prisma", "Prisma"],
    ["drizzle", "Drizzle"],
  ],
  "Hosting and infrastructure": [
    ["vercel", "Vercel"],
    ["netlify", "Netlify"],
    ["cloudflare", "Cloudflare"],
    ["aws", "AWS"],
    ["google-cloud", "Google Cloud"],
    ["azure", "Azure"],
    ["digitalocean", "DigitalOcean"],
    ["hetzner", "Hetzner"],
    ["fly-io", "Fly.io"],
    ["railway", "Railway"],
    ["render", "Render"],
    ["heroku", "Heroku"],
    ["docker", "Docker"],
    ["kubernetes", "Kubernetes"],
    ["terraform", "Terraform"],
    ["nginx", "Nginx"],
    ["github-actions", "GitHub Actions"],
    ["apache-kafka", "Apache Kafka"],
    ["rabbitmq", "RabbitMQ"],
  ],
  Payments: [
    ["stripe", "Stripe"],
    ["paddle", "Paddle"],
    ["polar", "Polar"],
    ["dodo-payments", "Dodo Payments"],
    ["lemon-squeezy", "Lemon Squeezy"],
    ["paypal", "PayPal"],
    ["revenuecat", "RevenueCat"],
    ["chargebee", "Chargebee"],
  ],
  AI: [
    ["openai", "OpenAI"],
    ["anthropic", "Anthropic"],
    ["google-gemini", "Google Gemini"],
    ["mistral-ai", "Mistral AI"],
    ["hugging-face", "Hugging Face"],
    ["replicate", "Replicate"],
    ["langchain", "LangChain"],
    ["pinecone", "Pinecone"],
  ],
  Services: [
    ["clerk", "Clerk"],
    ["auth0", "Auth0"],
    ["resend", "Resend"],
    ["sendgrid", "SendGrid"],
    ["postmark", "Postmark"],
    ["twilio", "Twilio"],
    ["algolia", "Algolia"],
    ["sentry", "Sentry"],
    ["datadog", "Datadog"],
    ["posthog", "PostHog"],
    ["plausible", "Plausible"],
    ["google-analytics", "Google Analytics"],
    ["mixpanel", "Mixpanel"],
  ],
};

/** Every technology, in the order of its group and then as listed there. */
export const technologies: Tech[] = techGroups.flatMap((group) =>
  catalog[group].map(([slug, name]) => ({ slug, name, group })),
);

const bySlug = new Map(technologies.map((tech) => [tech.slug, tech]));

export function techFromSlug(slug: string) {
  return bySlug.get(slug) ?? null;
}

/**
 * A product's stack by group, in the catalog's order. Slugs that are not in the catalog, which
 * the database cannot rule out, are left out.
 */
export function groupTechStack(slugs: readonly string[] | null | undefined) {
  const chosen = new Set(slugs ?? []);
  return techGroups
    .map((group) => ({
      group,
      items: technologies.filter((tech) => tech.group === group && chosen.has(tech.slug)),
    }))
    .filter((entry) => entry.items.length);
}

/** The known technologies of a stack, in the catalog's order. */
export function knownTech(slugs: readonly string[] | null | undefined) {
  return groupTechStack(slugs).flatMap((entry) => entry.items);
}
