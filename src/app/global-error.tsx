"use client";
import "./globals.css";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, LOCALE_INFO, splitLocale, type Locale } from "@/i18n/config";

// Replaces the root layout, and with it the messages, so its few words are here in every language.
const words: Record<Locale, { title: string; body: string; retry: string }> = {
  en: { title: "The SaaS Harbor could not load", body: "Please try again in a moment.", retry: "Try again" },
  zh: { title: "The SaaS Harbor 无法加载", body: "请稍后重试。", retry: "重试" },
  hi: { title: "The SaaS Harbor लोड नहीं हो सका", body: "कृपया थोड़ी देर में फिर से कोशिश करें।", retry: "फिर से कोशिश करें" },
  ar: { title: "تعذّر تحميل The SaaS Harbor", body: "حاول مرة أخرى بعد قليل.", retry: "حاول مرة أخرى" },
  es: { title: "No se pudo cargar The SaaS Harbor", body: "Inténtalo de nuevo en un momento.", retry: "Intentar de nuevo" },
  ru: { title: "Не удалось загрузить The SaaS Harbor", body: "Попробуйте ещё раз через минуту.", retry: "Попробовать снова" },
  ja: { title: "The SaaS Harborを読み込めませんでした", body: "しばらくしてから再度お試しください。", retry: "再試行" },
}; // prettier-ignore

// Replaces the root layout when it fails, so it renders its own document. It has no inline
// theme script: the nonce the policy requires is not available here, and the theme then follows
// the operating system.
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  const locale =
    typeof window === "undefined"
      ? DEFAULT_LOCALE
      : (splitLocale(window.location.pathname).locale ?? DEFAULT_LOCALE);
  const text = words[locale];
  return (
    <html lang={LOCALE_INFO[locale].lang} dir={LOCALE_INFO[locale].dir}>
      <body>
        <title>{`${text.title}`}</title>
        <main className="mx-auto max-w-md px-4 pt-32 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">{text.title}</h1>
          <p className="mt-2 text-muted-foreground">{text.body}</p>
          <Button onClick={() => retry()} className="mt-8">
            {text.retry}
          </Button>
        </main>
      </body>
    </html>
  );
}
