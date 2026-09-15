import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/harbor";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import "./globals.css";

export const metadata: Metadata = { title: { default: "The SaaS Harbor | A home for what you're building", template: "%s | The SaaS Harbor" }, description: "Discover independent SaaS, meet the makers, and explore a transparent leaderboard of self-reported monthly revenue." };
export const dynamic = "force-dynamic";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><div className="header-inner"><Brand/><Navigation/><div className="header-actions">{user ? <><Link className="account-link" href="/dashboard">My harbor</Link><form action={signOut}><button className="signout" type="submit">Sign out</button></form></> : <Link className="account-link" href="/auth">Sign in</Link>}<Button asChild className="add-button"><Link href="/dashboard/saas/new"><Plus size={16}/> Add your SaaS</Link></Button></div></div></header><main id="main">{children}</main><footer className="site-footer"><div><Brand/><p>A home for what you&apos;re building.</p></div><div className="footer-right"><Link href="/about">About the harbor <ArrowUpRight size={14}/></Link><span>Built for makers. Open to everyone.</span><small>Revenue is self-reported, never independently verified.</small></div></footer></body></html>;
}
