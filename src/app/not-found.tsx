import Link from "@/components/link";
import { useTranslations } from "next-intl";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <Shell size="narrow" className="pt-24 text-center sm:pt-32">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("notFoundTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("notFoundBody")}</p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">{t("backToLeaderboard")}</Link>
      </Button>
    </Shell>
  );
}
