"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="prose-shell"><p className="eyebrow">A BRIEF DETOUR</p><h1>We couldn&apos;t load this page.</h1><p>Please try again. If this keeps happening, check the Supabase connection and the setup instructions.</p><Button onClick={reset}>Try again</Button></section>; }
