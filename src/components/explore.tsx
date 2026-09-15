import Link from "next/link";
import { ArrowRight, Search, SlidersHorizontal, Trophy, Sparkles, Grid2X2, ShieldCheck } from "lucide-react";
import { listings, PAGE_SIZE, safePage } from "@/lib/data";
import { categories } from "@/lib/domain";
import { EmptyState, HarborArt, ListingCard, RankedList } from "./harbor";
import { Button } from "./ui/button";

export async function Explore({ mode, params }: { mode: "ranked" | "discover" | "newest"; params: Record<string, string | undefined> }) {
  const ranked = mode === "ranked";
  const category = categories.includes(params.category as typeof categories[number]) ? params.category! : "";
  const page = safePage(params.page);
  const search = (params.q ?? "").slice(0, 80);
  const { rows, count, error } = await listings({ ranked, category, page, search });
  const path = ranked ? "/" : mode === "newest" ? "/newest" : "/discover";
  function url(nextCategory: string, nextPage = 1) {
    const query = new URLSearchParams();
    if (nextCategory) query.set("category", nextCategory);
    if (search) query.set("q", search);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `${path}${query.size ? `?${query}` : ""}`;
  }
  return <div className="page-shell">
    {ranked ? <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="live-dot"/> INDEPENDENT MINDS. REAL PRODUCTS.</p><h1>Small teams.<br/>Big possibilities<span className="coral">.</span></h1><p className="hero-description">Discover the SaaS people are building.<br/>Meet the makers. Follow the journey.</p><div className="hero-actions"><Button size="lg" asChild><Link href="/dashboard/saas/new">Find your place in the harbor <ArrowRight size={16}/></Link></Button><Link className="text-link" href="/discover">Explore SaaS <ArrowUpRightIcon/></Link></div><p className="hero-footnote">Every stage is welcome. Every maker has a story.</p></div><HarborArt/></section> : <section className="page-intro"><p className="eyebrow">{mode === "newest" ? "FRESHLY DOCKED" : "FIND YOUR NEXT FAVORITE"}</p><h1>{mode === "newest" ? "New to the harbor." : "Good things are being built."}</h1><p>{mode === "newest" ? "The latest SaaS to join our community, newest first." : "Explore independent software and the people behind it. Shared numbers are optional."}</p></section>}
    <section className="explore-section"><div className="section-title"><div><p className="eyebrow">{ranked ? "BUILDING IN THE OPEN" : "THE DIRECTORY"}</p><h2>{ranked ? "The SaaS leaderboard" : mode === "newest" ? "Just arrived" : "Explore the harbor"}</h2><p>{ranked ? "Ranked by publicly shared monthly recurring revenue in USD." : "Independent products. Discover something worth a closer look."}</p></div><div className="count-label"><span className="live-dot"/>{count} {ranked ? "ranked" : "listed"} {count === 1 ? "SaaS" : "SaaS"}</div></div>
    <div className="explore-toolbar"><div className="view-tabs"><Link href="/" className={ranked ? "active" : ""}><Trophy size={16}/> Leaderboard</Link><Link href="/discover" className={mode === "discover" ? "active" : ""}><Grid2X2 size={16}/> All SaaS</Link><Link href="/newest" className={mode === "newest" ? "active" : ""}><Sparkles size={16}/> New arrivals</Link></div><form className="search-form" action={path}><Search size={17}/><input aria-label="Search SaaS" name="q" placeholder="Search the harbor..." defaultValue={search}/>{category && <input type="hidden" name="category" value={category}/>}<button aria-label="Search" type="submit"><ArrowRight size={17}/></button></form></div>
    <div className="category-filters" aria-label="Filter by category"><SlidersHorizontal size={15}/><Link href={url("")} className={!category ? "active" : ""}>All categories</Link>{categories.map(item => <Link href={url(item)} key={item} className={category === item ? "active" : ""}>{item}</Link>)}</div>
    {error ? <div className="notice error" role="alert">{error}</div> : !rows.length ? <EmptyState filtered={!!category || !!search || page > 1} ranked={ranked}/> : ranked ? <RankedList items={rows}/> : <div className="listing-grid">{rows.map(item => <ListingCard key={item.id} item={item}/>)}</div>}
    {count > PAGE_SIZE && <nav className="pagination" aria-label="Pagination">{page > 1 && <Link href={url(category, page - 1)}>Previous</Link>}<span>Page {page} of {Math.ceil(count / PAGE_SIZE)}</span>{page * PAGE_SIZE < count && <Link href={url(category, page + 1)}>Next <ArrowRight size={15}/></Link>}</nav>}
    <div className="transparency-note"><ShieldCheck size={19}/><p><strong>A little transparency goes a long way.</strong> All revenue is self-reported by makers and shown with its update date. Private metrics stay private.</p><Link href="/about">How it works <ArrowRight size={14}/></Link></div></section>
    <section className="bottom-cta"><div><p className="eyebrow">YOU BUILT SOMETHING. THAT MATTERS.</p><h2>There&apos;s a berth with your name on it.</h2><p>Pre-revenue or profitable, side project or full-time. You belong here.</p></div><Button asChild variant="outline" size="lg"><Link href="/dashboard/saas/new">Add your SaaS <ArrowRight size={16}/></Link></Button></section>
  </div>;
}
function ArrowUpRightIcon() { return <ArrowRight size={15} style={{ transform: "rotate(-35deg)" }}/>; }
