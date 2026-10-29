# Multilingual search plan

Reviewed 2026-10-29. This is an intent and language plan based on the product, public search-result checks and the owner's verified Search Console property. It contains no invented search volumes, keyword difficulty scores or ranking promises. Private Search Console query and performance data are not published in this repository.

## Pages and intent

Each intent has an existing page in every language. Do not create thin pages for spelling variants or repeat keywords unnaturally.

| Intent                                 | Page                                 | Content that supports it                                          |
| -------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| Discover independent software          | `/`, `/browse`                       | Product directory, categories, product summaries and links        |
| Submit a product without a listing fee | `/list-your-saas`                    | Free listing, how to submit, what is public and FAQs              |
| Compare verified recurring revenue     | `/`                                  | Verified MRR, ranking rules and provider connections              |
| Find launch and promotion channels     | `/where-to-launch`                   | Launch platforms, communities, directories and their requirements |
| Find software for a task or technology | `/categories/<slug>`, `/tech/<slug>` | Translated category names, introductions and real products        |

## Language targets

These are phrases to validate with impressions, queries and clicks after crawling, not measured demand estimates. Keep SaaS and MRR where developers use them; explain the financial term in local-language page copy.

| Language           | Discovery                        | Free submission                      | Revenue comparison               | Launch research        |
| ------------------ | -------------------------------- | ------------------------------------ | -------------------------------- | ---------------------- |
| English            | SaaS directory; SaaS products    | submit SaaS for free; list your SaaS | verified MRR leaderboard         | where to launch a SaaS |
| Simplified Chinese | SaaS 产品目录; SaaS 工具导航     | 免费提交 SaaS 产品; 免费收录 SaaS    | SaaS 收入排行榜; 已验证 MRR      | SaaS 产品发布平台      |
| Hindi              | SaaS डायरेक्टरी; SaaS प्रोडक्ट   | अपना SaaS मुफ़्त में लिस्ट करें      | सत्यापित MRR रैंकिंग             | SaaS कहाँ लॉन्च करें   |
| Arabic             | دليل منتجات SaaS; أدوات SaaS     | أضف منتج SaaS مجانًا                 | ترتيب الإيرادات الشهرية الموثّقة | أين أطلق منتج SaaS     |
| Spanish            | directorio SaaS; productos SaaS  | publicar SaaS gratis                 | ranking de MRR verificado        | dónde lanzar un SaaS   |
| Russian            | каталог SaaS; SaaS-сервисы       | добавить SaaS бесплатно              | рейтинг SaaS по MRR              | где запустить SaaS     |
| Japanese           | SaaSディレクトリ; SaaSプロダクト | SaaS無料掲載; SaaS登録               | MRRランキング; 検証済みMRR       | SaaSの公開先           |

The home-page titles and descriptions cover discovery and free submission naturally, rather than naming only a revenue leaderboard. Submission and launch pages retain their distinct intent. Category and technology pages use their translated names; internal searches remain `noindex` and filtered lists point to the appropriate canonical list.

Japanese phrases describe the existing page intent in natural Japanese; no Japanese search-volume study is claimed. The `/ja` pages have their own titles, descriptions, canonical URLs, hreflang and structured data, just like the other languages.

Public search checks found directory/product-discovery language on [Shovel.tools in Chinese](https://shovel.tools/zh/), [Buildear in Spanish](https://buildear.com/) and [SaaS Nation's Russian catalog](https://catalog.saas-nation.com/). Hindi results for SaaS directory terms were mixed with English and unrelated directories; Arabic `دليل` also finds tutorials and business-software guides. These observations support keeping precise product qualifiers and the familiar SaaS term. They do not establish traffic or search volume, and no competitor copy is reproduced.

## Technical implementation

- English retains its addresses. Other versions use `/zh`, `/hi`, `/ar`, `/es` and `/ru`, with reciprocal hreflang and self-canonical addresses.
- All seven sitemaps are public and listed in robots.txt. Submit all seven in Search Console for the verified domain property.
- Visible text, titles and descriptions are translated. User-written product descriptions and profile text keep their original language; a translated interface does not create translated product copy.
- JSON-LD uses each page's canonical address, language and translated labels, including breadcrumbs and ranked product links. Schema.org identifiers, brand names, external destinations and user-written content retain their original meaning.
- The organization and website have stable root-domain identities. `WebSite.inLanguage` lists the supported languages; each localized home page has its own `WebPage` with the actual page language. The root website URL remains suitable for Google's site-name markup.
- No `meta keywords` tag or hidden keyword text is added. No ratings, prices or search demand are invented for rich results.

## Indexing and measurement

The owner confirmed on 2026-10-29 that `thesaasharbor.com` is already verified in Search Console. Its existing browser session was used to inspect the property. Sitemap submission, successful fetching, indexing and ranking are separate states: record the result Google actually reports, and never describe submission as indexed pages.

On 2026-10-29 all five localized sitemaps were submitted in that property. Google subsequently reported successful processing and 309 discovered URLs in each; the pre-existing English sitemap also had Success status. An initial Chinese sitemap fetch error cleared after successful live URL Inspection and resubmission. No claim of complete page indexing or local-language rankings follows from those sitemap results.

After the language versions are crawled, compare non-brand queries, impressions, clicks and CTR by language path and country over a consistent period. Use URL Inspection to distinguish discovery, indexing eligibility and Google's selected canonical. Treat country and language separately: Hindi does not cover every Indian searcher, and a Chinese page does not prove visibility in Baidu. Check Bing/Yandex/Baidu separately if those are target acquisition channels.

Use existing relevant pages for new query opportunities first. Change titles to reflect demonstrated intent and useful page content, rather than adding unsupported superlatives or repeating synonyms. No recurring monitoring or new analytics data collection is introduced.

## References

- [Google: multilingual and multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google: localized versions and hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google: structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google: site-name structured data](https://developers.google.com/search/docs/appearance/site-names)
- [Google: supported meta tags, including unsupported meta keywords](https://developers.google.com/search/docs/crawling-indexing/special-tags)
- [Google: Sitemaps report](https://support.google.com/webmasters/answer/7451001)
