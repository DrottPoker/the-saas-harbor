import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowUpRight, CalendarDays, Users, TrendingUp } from "lucide-react";
import { publicSaas } from "@/lib/data";
import { Avatar } from "@/components/harbor";
import { Button } from "@/components/ui/button";
import { formatDate, formatUsd } from "@/lib/domain";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const item = await publicSaas(id);
  return item ? { title: item.name, description: item.tagline } : {};
}

export default async function SaasProfile({ params }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const item = await publicSaas(id);
  if (!item) notFound();
  return (
    <div className="detail-shell">
      <Link className="back-link" href="/discover">
        ← Explore the harbor
      </Link>
      <section className="product-header">
        <Avatar path={item.logo_path} name={item.name ?? "SaaS"} large />
        <div>
          <span className="category-badge">{item.category}</span>
          <h1>{item.name}</h1>
          <p>{item.tagline}</p>
        </div>
        <Button asChild>
          <a href={item.website ?? "#"} target="_blank" rel="noopener noreferrer nofollow">
            Visit website <ArrowUpRight size={16} />
          </a>
        </Button>
      </section>
      <div className="public-metric-grid">
        <div>
          <TrendingUp size={19} />
          <span>Monthly revenue</span>
          <strong>{item.mrr_cents == null ? "Not shared" : formatUsd(item.mrr_cents)}</strong>
          <small>
            {item.mrr_cents == null ? "The maker keeps this private" : "USD · Self-reported"}
          </small>
        </div>
        <div>
          <Users size={19} />
          <span>Paying customers</span>
          <strong>{item.customers?.toLocaleString("en-US") ?? "Not shared"}</strong>
          <small>{item.customers == null ? "The maker keeps this private" : "Self-reported"}</small>
        </div>
        <div>
          <CalendarDays size={19} />
          <span>Launch date</span>
          <strong>{formatDate(item.launched_on)}</strong>
          <small>{item.launched_on ? "Shared by the maker" : "The maker keeps this private"}</small>
        </div>
      </div>
      {(item.mrr_cents != null || item.customers != null || item.launched_on != null) && (
        <p className="metric-date">
          Metrics updated {formatDate(item.reported_at)}. Self-reported by the owner, not
          independently verified.
        </p>
      )}
      <div className="story-grid">
        <section>
          <p className="eyebrow">BEHIND THE PRODUCT</p>
          <h2>The story</h2>
          <p className="product-story">{item.description}</p>
        </section>
        <aside className="maker-card">
          <p className="eyebrow">MEET THE MAKER</p>
          <Avatar path={item.owner_avatar_path} name={item.owner_name ?? "Maker"} />
          <h3>{item.owner_name}</h3>
          <Link className="text-link" href={`/makers/${item.owner_id}`}>
            View maker profile <ArrowUpRight size={15} />
          </Link>
          <hr />
          <p className="small muted">
            Joined the harbor
            <br />
            {formatDate(item.created_at)}
          </p>
        </aside>
      </div>
    </div>
  );
}
