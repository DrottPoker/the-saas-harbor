import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "./local-supabase.mjs";

// Fictional demo content for the local stack only. Re-running replaces earlier demo accounts.
const DOMAIN = "demo.harbor.test";
const PASSWORD = "harbor-demo-password";

const makers = [
  {
    key: "lena",
    name: "Lena Okafor",
    bio: "Building finance tools for small teams. Previously led product at a payments startup.",
    website: "https://lenaokafor.example",
    products: [
      {
        name: "Ledgerloop",
        tagline: "Month-end close checklists for finance teams under 20 people.",
        category: "Finance",
        mrr: 48200,
        customers: 312,
        launched: "2022-03-14",
        share: ["mrr", "customers", "launch"],
        logo: ["#1f5f5b", "ring"],
        age: 420,
      },
      {
        name: "Paperweight",
        tagline: "Invoice reminders that read like a person wrote them.",
        category: "Finance",
        mrr: 9850,
        customers: 188,
        launched: "2024-01-09",
        share: ["mrr", "launch"],
        age: 190,
      },
    ],
  },
  {
    key: "tomas",
    name: "Tomás Rivera",
    bio: "Former data engineer. I build small tools for people who live in SQL.",
    website: "https://tomasrivera.example",
    products: [
      {
        name: "Querybird",
        tagline: "Ask questions about your Postgres data in plain English and see the SQL.",
        category: "Analytics",
        mrr: 31400,
        customers: 540,
        launched: "2023-05-02",
        share: ["mrr", "customers", "launch"],
        logo: ["#3b4cca", "diamond"],
        age: 300,
      },
      {
        name: "Shiplog",
        tagline: "Changelogs and release notes your customers actually read.",
        category: "Marketing",
        mrr: 6120,
        customers: 97,
        launched: "2024-06-18",
        share: ["mrr"],
        age: 120,
      },
    ],
  },
  {
    key: "priya",
    name: "Priya Natarajan",
    bio: "Solo founder. Bootstrapped, profitable, and writing about it.",
    website: "https://priya.example",
    products: [
      {
        name: "Tallyform",
        tagline: "Forms with conditional logic and payments, without writing code.",
        category: "Productivity",
        mrr: 84300,
        customers: 2140,
        launched: "2021-09-01",
        share: ["mrr", "customers", "launch"],
        logo: ["#b4532a", "bars"],
        age: 600,
      },
      {
        name: "Dialtone",
        tagline: "An AI receptionist that answers the phone for dental clinics.",
        category: "AI & Machine Learning",
        mrr: 15800,
        customers: 64,
        launched: "2025-02-11",
        share: ["customers", "launch"],
        age: 45,
      },
    ],
  },
  {
    key: "mei",
    name: "Mei Chen",
    bio: "Designer who codes. Making tools that help product teams ship polished work.",
    website: "https://meichen.example",
    products: [
      {
        name: "Framecast",
        tagline: "Turn product screenshots into launch videos in a few minutes.",
        category: "Design",
        mrr: 12760,
        customers: 410,
        launched: "2023-11-20",
        share: ["mrr", "customers"],
        logo: ["#7a3fb0", "circle"],
        age: 260,
      },
      {
        name: "Paletteer",
        tagline: "Accessible color systems generated from a single brand color.",
        category: "Design",
        mrr: 2340,
        customers: 150,
        launched: "2024-09-03",
        share: ["mrr", "launch"],
        age: 80,
      },
    ],
  },
  {
    key: "jonas",
    name: "Jonas Berg",
    bio: "Growth marketer turned founder. Based in Gothenburg.",
    website: "https://jonasberg.example",
    products: [
      {
        name: "Sendwise",
        tagline: "Cold email warm-up and deliverability monitoring for small teams.",
        category: "Marketing",
        mrr: 22900,
        customers: 730,
        launched: "2022-10-05",
        share: ["mrr", "customers", "launch"],
        logo: ["#0f7a3d", "square"],
        age: 380,
      },
      {
        name: "Cohortly",
        tagline: "Retention cohorts from your Stripe data in one click.",
        category: "Analytics",
        mrr: 3150,
        customers: 58,
        launched: "2025-04-22",
        share: ["mrr"],
        age: 20,
      },
    ],
  },
  {
    key: "sam",
    name: "Sam Whitfield",
    bio: "Infrastructure person. I like boring software that never pages anyone.",
    website: "https://samwhitfield.example",
    products: [
      {
        name: "Beacon",
        tagline: "Status pages and uptime checks with alerting that respects your sleep.",
        category: "Developer Tools",
        mrr: 17450,
        customers: 620,
        launched: "2022-06-30",
        share: ["mrr", "customers", "launch"],
        logo: ["#c2410c", "circle"],
        age: 450,
      },
      {
        name: "Relay",
        tagline: "A webhook inbox for inspecting, testing and replaying events.",
        category: "Developer Tools",
        mrr: 0,
        customers: 0,
        launched: "2025-09-10",
        share: ["mrr", "launch"],
        age: 6,
      },
    ],
  },
  {
    key: "aisha",
    name: "Aisha Rahman",
    bio: "ML engineer building the unglamorous tooling around language models.",
    products: [
      {
        name: "Promptvault",
        tagline: "Version control and evaluations for production LLM prompts.",
        category: "AI & Machine Learning",
        mrr: 26800,
        customers: 205,
        launched: "2024-02-27",
        share: ["mrr", "customers", "launch"],
        logo: ["#18181b", "diamond"],
        age: 210,
      },
      {
        name: "Minutes",
        tagline: "Meeting notes that turn into assigned tasks automatically.",
        category: "AI & Machine Learning",
        mrr: 4480,
        customers: 132,
        launched: "2025-06-02",
        share: [],
        age: 12,
      },
    ],
  },
  {
    key: "oskar",
    name: "Oskar Lindqvist",
    bio: "Ex-chef writing software for the trades I know.",
    products: [
      {
        name: "Rostra",
        tagline: "Shift scheduling for restaurants, built by a former line cook.",
        category: "Other",
        mrr: 7300,
        customers: 96,
        launched: "2023-08-15",
        share: ["mrr", "customers", "launch"],
        age: 330,
      },
      {
        name: "Kilnbook",
        tagline: "Studio management for ceramic artists: firings, glazes and classes.",
        category: "Other",
        mrr: 890,
        customers: 41,
        launched: "2024-12-01",
        share: ["mrr", "customers"],
        logo: ["#8a5a2b", "bars"],
        age: 60,
      },
    ],
  },
];

function describe(product) {
  return `${product.tagline} ${product.name} started as a side project and is now used by teams who wanted something simpler than the incumbents. It is built and supported by its founder, with a public roadmap and a changelog updated every few weeks.`;
}

// Minimal PNG encoder for simple generated logos.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function logo([hex, shape]) {
  const size = 96;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const d = Math.hypot(dx, dy);
      const mark = {
        circle: d < 20,
        ring: d < 26 && d > 15,
        diamond: Math.abs(dx) + Math.abs(dy) < 24,
        square: Math.abs(dx) < 17 && Math.abs(dy) < 17,
        bars: Math.abs(dy) < 22 && [-14, 0, 14].some((c) => Math.abs(dx - c) < 4.5),
      }[shape];
      const o = y * row + 1 + x * 4;
      raw.set(mark ? [255, 255, 255, 255] : [r, g, b, 255], o);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const local = localSupabase();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(local.url, local.secretKey, options);

const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw new Error("Could not list local users.");
for (const user of existing.users.filter((user) => user.email?.endsWith(`@${DOMAIN}`))) {
  const { data: files } = await admin.storage.from("profile-images").list(user.id);
  if (files?.length)
    await admin.storage.from("profile-images").remove(files.map((f) => `${user.id}/${f.name}`));
  await admin.auth.admin.deleteUser(user.id);
}

const day = 24 * 60 * 60 * 1000;
let count = 0;
for (const maker of makers) {
  const email = `${maker.key}@${DOMAIN}`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error(`Could not create ${email}.`);
  const userId = created.user.id;
  const client = createClient(local.url, local.publishableKey, options);
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const { error: profileError } = await client.from("profiles").upsert({
    id: userId,
    name: maker.name,
    bio: maker.bio,
    website: maker.website ?? "",
    social_url: "",
  });
  if (profileError) throw new Error(`Could not save the profile for ${email}.`);

  for (const product of maker.products) {
    let logoPath = null;
    if (product.logo) {
      logoPath = `${userId}/${randomUUID()}.png`;
      const { error: uploadError } = await client.storage
        .from("profile-images")
        .upload(logoPath, logo(product.logo), { contentType: "image/png" });
      if (uploadError) throw new Error(`Could not upload the logo for ${product.name}.`);
    }
    const { data: id, error: saveError } = await client.rpc("save_saas", {
      p_id: randomUUID(),
      p_name: product.name,
      p_tagline: product.tagline,
      p_description: describe(product),
      p_category: product.category,
      p_website: `https://${product.name.toLowerCase()}.example`,
      p_logo_path: logoPath,
      p_mrr_cents: product.mrr * 100,
      p_customers: product.customers,
      p_launched_on: product.launched,
      p_public_mrr: product.share.includes("mrr"),
      p_public_customers: product.share.includes("customers"),
      p_public_launch: product.share.includes("launch"),
    });
    if (saveError) throw new Error(`Could not save ${product.name}.`);
    // Spread join dates so newest-first listings look realistic.
    const joined = new Date(Date.now() - product.age * day).toISOString();
    const updated = new Date(Date.now() - Math.min(product.age, 9) * day).toISOString();
    await admin.from("saas").update({ created_at: joined }).eq("id", id);
    await admin.from("public_metrics").update({ reported_at: updated }).eq("saas_id", id);
    count++;
  }
  await client.auth.signOut();
}

console.log(
  `Seeded ${makers.length} demo makers and ${count} SaaS. Sign in as <name>@${DOMAIN} with the password "${PASSWORD}".`,
);
