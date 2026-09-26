import { categoryCounts, techCounts, topRanked } from "@/lib/data";
import { categories } from "@/lib/domain";
import { llmsText } from "@/lib/markdown";
import { textResponse } from "@/lib/text-response";

// A guide to the site for AI assistants (llmstxt.org), with the current top 50.
export async function GET() {
  const [ranked, counts, techs] = await Promise.all([
    topRanked(50),
    categoryCounts(),
    techCounts(),
  ]);
  return textResponse(llmsText(ranked, counts, categories, techs), { type: "text/plain" });
}
