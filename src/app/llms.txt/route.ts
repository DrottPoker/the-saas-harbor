import { categoryCounts, topRanked } from "@/lib/data";
import { categories } from "@/lib/domain";
import { llmsText } from "@/lib/markdown";
import { textResponse } from "@/lib/text-response";

// A guide to the site for AI assistants (llmstxt.org), with the current top 50.
export async function GET() {
  const [ranked, counts] = await Promise.all([topRanked(50), categoryCounts()]);
  return textResponse(llmsText(ranked, counts, categories), { type: "text/plain" });
}
