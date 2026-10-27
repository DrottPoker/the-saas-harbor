"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errors");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Shell size="narrow" className="pt-24 text-center sm:pt-32">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("body")}</p>
      {/* retry() re-fetches server data; reset() would only re-render the failed result. */}
      <Button onClick={() => retry()} className="mt-8">
        {t("retry")}
      </Button>
    </Shell>
  );
}
