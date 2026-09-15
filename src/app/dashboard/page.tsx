import Link from "next/link";
import { ArrowUpRight, Plus, Settings2 } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { Avatar, EmptyState } from "@/components/harbor";
import { Button } from "@/components/ui/button";
export const metadata = { title: "My harbor" };
export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, client } = await requireUser();
  const params = await searchParams;
  const [{ data: profile, error: profileError }, { data: products, error }] = await Promise.all([client.from("profiles").select("*").eq("id", user.id).maybeSingle(), client.from("saas").select("id,name,tagline,logo_path").eq("owner_id", user.id).order("created_at", { ascending: false })]);
  if (error || profileError) throw new Error("Your harbor could not be loaded.");
  return <div className="page-shell dashboard"><div className="dashboard-heading"><div><p className="eyebrow">YOUR CORNER OF THE HARBOR</p><h1>{profile ? `Welcome, ${profile.name}.` : "Make yourself at home."}</h1><p className="muted">Your products, your progress, your story.</p></div><Button asChild><Link href="/dashboard/saas/new"><Plus size={16}/> Add a SaaS</Link></Button></div>{params.saved && <p className="notice success" role="status">Your SaaS has been saved. Its public information is now available in the harbor.</p>}
    <div className="profile-strip"><Avatar path={profile?.avatar_path} name={profile?.name ?? "Maker"}/><div><h2>{profile?.name ?? "Set up your maker profile"}</h2><p>{profile?.bio || "A name, a photo, and a little about what drives you."}</p></div><Link className="text-link" href="/dashboard/profile"><Settings2 size={16}/> Edit profile</Link>{profile && <Link className="text-link" href={`/makers/${user.id}`}>View public profile <ArrowUpRight size={16}/></Link>}</div>
    <div className="section-title"><h2>Your SaaS</h2><span className="muted small">{products?.length ?? 0} products</span></div>{!products?.length ? <EmptyState/> : <div className="listing-grid">{products.map(product => <article className="listing-card dashboard-card" key={product.id}><Avatar path={product.logo_path} name={product.name}/><h3>{product.name}</h3><p>{product.tagline}</p><div className="card-bottom"><Link className="text-link" href={`/dashboard/saas/${product.id}`}>Edit SaaS <Settings2 size={14}/></Link><Link className="text-link" href={`/saas/${product.id}`}>Public page <ArrowUpRight size={14}/></Link></div></article>)}</div>}
  </div>;
}
