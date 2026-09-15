import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { publicClient } from "@/lib/supabase/server";
import { listings, PAGE_SIZE, safePage } from "@/lib/data";
import { Avatar, ListingCard } from "@/components/harbor";
export default async function Maker({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data: profile, error } = await client.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("This maker could not be loaded.");
  if (!profile) notFound();
  const page = safePage((await searchParams).page);
  const result = await listings({ owner: id, page });
  return <div className="detail-shell"><Link className="back-link" href="/discover">← Explore the harbor</Link><section className="maker-profile"><Avatar path={profile.avatar_path} name={profile.name} large/><p className="eyebrow">INDEPENDENT MAKER</p><h1>{profile.name}</h1><p>{profile.bio || "Building something worth sharing."}</p><div className="maker-links">{profile.website && <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow">Website <ArrowUpRight size={15}/></a>}{profile.social_url && <a href={profile.social_url} target="_blank" rel="noopener noreferrer nofollow">Social profile <ArrowUpRight size={15}/></a>}</div></section><div className="section-title"><h2>In {profile.name}&apos;s harbor</h2><span className="small muted">{result.count} products</span></div>{result.error ? <p role="alert" className="notice error">{result.error}</p> : !result.rows.length ? <p className="notice">No SaaS shared yet. Watch this space.</p> : <div className="listing-grid">{result.rows.map(item => <ListingCard key={item.id} item={item}/>)}</div>}{result.count > PAGE_SIZE && <nav className="pagination" aria-label="Pagination">{page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}<span>Page {page}</span>{page * PAGE_SIZE < result.count && <Link href={`?page=${page + 1}`}>Next</Link>}</nav>}</div>;
}
