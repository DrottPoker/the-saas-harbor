import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy.accountDeleted");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AccountDeleted() {
  const t = await getTranslations("privacy.accountDeleted");
  return (
    <Shell size="narrow">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-4 border-t pt-8 leading-7 text-foreground/85">
        <p>{t("keys")}</p>
        <p>{t("search")}</p>
        <div className="pt-2">
          <Button asChild>
            <Link href="/">{t("back")}</Link>
          </Button>
        </div>
      </div>
    </Shell>
  );
}
