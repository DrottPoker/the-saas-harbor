import type en from "@/messages/en";
import type { Locale } from "./config";

// Message keys and languages are checked against the English messages wherever they are used.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
