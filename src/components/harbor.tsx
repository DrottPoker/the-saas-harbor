import Link from "next/link";
import Image from "next/image";
import { Anchor, ArrowUpRight, Compass, Plus, Waves } from "lucide-react";
import { Button } from "./ui/button";
import { imageUrl } from "@/lib/images";
import { formatDate, formatUsd } from "@/lib/domain";
import type { Listing } from "@/lib/data";

export function Brand() { return <Link href="/" className="brand"><span className="brand-icon"><Anchor size={23}/></span><span>The SaaS<span className="brand-second">Harbor<span className="coral">.</span></span></span></Link>; }
export function Avatar({ path, name, large = false }: { path?: string | null; name: string; large?: boolean }) {
  const url = imageUrl(path);
  return <span className={`avatar ${large ? "avatar-large" : ""}`}>{url ? <Image src={url} alt={name} width={large ? 88 : 48} height={large ? 88 : 48} unoptimized/> : <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>}</span>;
}
export function EmptyState({ filtered = false, ranked = false }: { filtered?: boolean; ranked?: boolean }) {
  return <div className="empty-state"><span className="empty-icon"><Compass size={34} strokeWidth={1.3}/></span><p className="eyebrow">{filtered ? "KEEP EXPLORING" : "EVERY JOURNEY STARTS SOMEWHERE"}</p><h3>{filtered ? "No SaaS found here. Yet." : ranked ? "The first spot is waiting." : "Be the first to drop anchor."}</h3><p>{filtered ? "Try another category or a different product name." : ranked ? "Add your SaaS and share your MRR to start the leaderboard." : "Bring your product to the harbor and tell the world what you are building."}</p><Button asChild variant="outline"><Link href={filtered ? "/discover" : "/dashboard/saas/new"}>{filtered ? "Explore all SaaS" : "Add your SaaS"}<Plus size={15}/></Link></Button></div>;
}
export function ListingCard({ item }: { item: Listing }) {
  return <Link href={`/saas/${item.id}`} className="listing-card"><div className="card-top"><Avatar path={item.logo_path} name={item.name ?? "SaaS"}/><ArrowUpRight className="card-arrow" size={19}/></div><span className="category-badge">{item.category}</span><h3>{item.name}</h3><p>{item.tagline}</p><div className="card-bottom"><span>by {item.owner_name}</span><strong>{item.mrr_cents != null ? `${formatUsd(item.mrr_cents)} / mo` : "MRR not shared"}</strong></div>{item.mrr_cents != null && <span className="card-disclosure">Self-reported · {formatDate(item.reported_at)}</span>}</Link>;
}
export function RankedList({ items }: { items: Listing[] }) {
  return <div className="ranking-table"><div className="ranking-head"><span>RANK</span><span>PRODUCT</span><span>CATEGORY</span><span>MONTHLY REVENUE</span></div>{items.map(item => <Link className="ranking-row" key={item.id} href={`/saas/${item.id}`}><span className={`rank ${item.rank && item.rank <= 3 ? "rank-top" : ""}`}>{String(item.rank).padStart(2, "0")}</span><div className="rank-product"><Avatar path={item.logo_path} name={item.name ?? "SaaS"}/><div><h3>{item.name}</h3><p>{item.tagline}</p></div></div><span className="rank-category category-badge">{item.category}</span><div className="rank-money"><strong>{formatUsd(item.mrr_cents ?? 0)}</strong><span>Self-reported</span><small>{formatDate(item.reported_at)}</small></div></Link>)}</div>;
}
export function HarborArt() {
  return <div className="harbor-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-dot dot-one"/><div className="art-dot dot-two"/><div className="art-mark"><Anchor size={72} strokeWidth={1.2}/></div><div className="art-note"><span className="live-dot"/> A home for independent SaaS</div><Waves className="art-waves" size={210} strokeWidth={0.6}/><span className="art-coordinate">BUILD · LAUNCH · GROW</span></div>;
}
