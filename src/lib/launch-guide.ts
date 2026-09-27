// The guide at /where-to-launch: places founders list and launch a new SaaS. Each entry says only
// what the site's own pages said on GUIDE_CHECKED, and leaves out prices, which change often.
// Update an entry when a site changes its terms, and move the date.

export const GUIDE_PUBLISHED = "2026-09-27";
export const GUIDE_CHECKED = "2026-09-27";

export type LaunchPlace = {
  id: string;
  name: string;
  /** An absolute address, or a path on this site when `internal` is set. */
  url: string;
  internal?: boolean;
  summary: string;
  how: string;
  cost: string;
  bestFor: string;
  tip?: string;
};

export type LaunchGroup = { id: string; title: string; intro: string; places: LaunchPlace[] };

export const launchOrder = [
  "Before launch, collect a waiting list on a page of your own. BetaList, which is paid, shows startups before and around their launch to early adopters.",
  "As soon as people can use the product, list it in directories that stay up, such as The SaaS Harbor, SaaSHub and AlternativeTo. Some review each submission by hand for weeks or months, so submit early.",
  "Share what you built where the rules allow it: Show HN, Indie Hackers and the subreddits that welcome it.",
  "Pick a launch day once the product works well and you have people to tell, and prepare the text, images and first comment in advance. Free queues on some launch sites run for months, so book early.",
  "Once you have customers, add review sites such as G2 and Capterra, and verify your revenue to show that people pay for the product.",
];

const launchDays: LaunchGroup = {
  id: "launch-days",
  title: "Launch days",
  intro:
    "A launch day puts a product in front of people who come to see what is new that day or week. It works best when the product can be tried at once and you have people ready to look and comment. Most launch sites rank by votes, and asking people to vote breaks their rules.",
  places: [
    {
      id: "product-hunt",
      name: "Product Hunt",
      url: "https://www.producthunt.com/launch",
      summary:
        "A daily leaderboard of new tech products, where members upvote and comment on each day's launches.",
      how: "You post from a personal account, not a company account, and schedule a day up to 30 days ahead; a new account waits a week before it can post. Each launch day starts at 12:01 AM Pacific time. Product Hunt's team chooses which launches are featured on the homepage, and the others stay listed.",
      cost: "Free.",
      bestFor:
        "Live products that people can use today. Waiting lists and pre-launch products are not featured.",
      tip: "Launch it yourself and ask your network to visit and comment, but not to upvote. A relaunch needs six months and a significant update.",
    },
    {
      id: "peerlist",
      name: "Peerlist Launchpad",
      url: "https://help.peerlist.io/individual/launchpad/introduction",
      summary:
        "A weekly launch leaderboard inside Peerlist, a professional network for people who build software.",
      how: "You add the project to your Peerlist profile, complete every field, and launch it in the week that opens each Monday. Only verified personal profiles can launch, not companies.",
      cost: "Peerlist's help pages mention no launch fee; verifying your identity may cost a small fee.",
      bestFor: "Individual developers, designers and makers.",
      tip: "Answer questions and ask for feedback during the week. Messaging strangers for upvotes counts as spam.",
    },
    {
      id: "uneed",
      name: "Uneed",
      url: "https://www.uneed.best/how-it-works",
      summary: "A daily launch site where the community upvotes new products.",
      how: "You submit the product and then choose how to launch. A free launch gets a date 30 days to 5 months ahead and must reach a minimum upvote score that day to stay published; paid launches get an earlier or chosen date.",
      cost: "Free, with paid options to launch sooner.",
      bestFor: "Any web product or SaaS, including B2B.",
      tip: "Uneed suggests Tuesday to Thursday for B2B products, and votes keep counting after launch day.",
    },
    {
      id: "microlaunch",
      name: "Microlaunch",
      url: "https://microlaunch.net",
      summary:
        "A launch site where products stay on a monthly leaderboard for 30 days, with ratings and critiques from the community.",
      how: "Free launches wait in a queue. Paid launches skip it and add promotion.",
      cost: "Free, with paid options.",
      bestFor: "Early products that want feedback over a month rather than a single day.",
    },
    {
      id: "devhunt",
      name: "DevHunt",
      url: "https://devhunt.org/the-story",
      summary:
        "A weekly launch site for developer tools, where developers vote with their GitHub accounts.",
      how: "You submit your tool and it launches in a weekly round. DevHunt says a free launch waits about six months; paying lets you choose the week.",
      cost: "Free, with a paid option to choose your launch week.",
      bestFor:
        "Developer tools only: open-source projects, APIs, SDKs, libraries, editors, and testing and monitoring tools.",
    },
  ],
};

const communities: LaunchGroup = {
  id: "communities",
  title: "Communities",
  intro:
    "Communities reward taking part more than announcing. Share what you built where the rules allow it, stay to answer questions, and read each community's rules before you post.",
  places: [
    {
      id: "show-hn",
      name: "Hacker News (Show HN)",
      url: "https://news.ycombinator.com/showhn.html",
      summary: "A Hacker News post type for something you made that other people can try.",
      how: "You submit a story whose title starts with Show HN. It appears among the newest Show HN posts, and on the Show HN page once it has a few points.",
      cost: "Free.",
      bestFor:
        "Working products and demos for a technical audience, including open source. Sign-up pages, newsletters and blog posts are off topic.",
      tip: "Make it easy to try without signing up, stay in the thread to answer, and do not ask friends to upvote.",
    },
    {
      id: "indie-hackers",
      name: "Indie Hackers",
      url: "https://www.indiehackers.com/products",
      summary:
        "A community of founders building profitable online businesses, with posts, groups and a product directory.",
      how: "You write posts about what you are building and add your product to the directory, where revenue is self-reported. New accounts may have to wait before they can post.",
      cost: "Free, with an optional paid membership that includes posting from the first day.",
      bestFor: "Bootstrapped founders who share their progress over time rather than on one day.",
      tip: "Write titles that are useful to others, and leave your company name out unless it is well known.",
    },
    {
      id: "reddit",
      name: "Reddit",
      url: "https://www.reddit.com/r/SaaS",
      summary:
        "Subreddits such as r/SaaS, r/SideProject, r/startups and r/indiehackers, where founders share projects and ask for feedback.",
      how: "Each subreddit sets its own rules. Several allow promotion only in a pinned thread or only now and then, and remove other promotional posts.",
      cost: "Free.",
      bestFor: "Feedback from other founders, as long as you follow each subreddit's rules.",
      tip: "Read the rules in the sidebar before you post, and ask a question others can learn from rather than announcing.",
    },
  ],
};

const directories: LaunchGroup = {
  id: "directories",
  title: "Directories",
  intro:
    "A directory listing stays up after launch day and helps people and search engines find the product later. Some directories review each submission by hand, which can take weeks or months, and several sell faster review or featured places.",
  places: [
    {
      id: "the-saas-harbor",
      name: "The SaaS Harbor",
      url: "/list-your-saas",
      internal: true,
      summary:
        "A free directory of independent SaaS, with a leaderboard of MRR verified through Stripe, Paddle, Polar or Dodo Payments.",
      how: "You create an account and add your product, which is public as soon as you save it, with no review queue. Connecting a payment provider is optional and ranks the product by verified MRR.",
      cost: "Free, with no paid plans. The dofollow link is free and comes with verified revenue.",
      bestFor: "Any SaaS, new or established, including products without revenue yet.",
      tip: "Verify your revenue once you have it: the link to your website is then followed by search engines, even if you keep the figures private.",
    },
    {
      id: "saashub",
      name: "SaaSHub",
      url: "https://www.saashub.com/services/submit",
      summary:
        "A software marketplace for finding alternatives to and comparisons of software, running since 2014.",
      how: "You register and submit the website, categories and competitors, and every product goes through approval. Unreleased products, waiting-list pages and products on free subdomains are rejected.",
      cost: "Free, with a paid featured placement.",
      bestFor: "Released, English-language SaaS with clear competitors.",
      tip: "Name your competitors, since submissions without them go to the bottom of the queue, and verify the product with an email address on its own domain.",
    },
    {
      id: "alternativeto",
      name: "AlternativeTo",
      url: "https://alternativeto.net/faq/",
      summary: "A crowdsourced site that recommends alternatives to known software.",
      how: "You sign up and suggest the app with its platforms, license and description. Every submission is reviewed by hand, and a free one usually waits a few months; a small one-time fee moves it to the front of the queue.",
      cost: "Free, with a paid option to be reviewed sooner.",
      bestFor:
        "Released software, at least in open beta, that is clearly different from what is already listed. English only.",
      tip: "Suggest your app on the pages of the products it competes with, and use a clean address without tracking tags.",
    },
    {
      id: "betalist",
      name: "BetaList",
      url: "https://betalist.com/criteria",
      summary:
        "An editor-curated site that shows upcoming and recently launched startups to early adopters.",
      how: "You submit through a form, choose a plan, and the editors review it. The product must be unreleased, in private beta or recently launched, with a landing page of its own design and a way to sign up.",
      cost: "Paid: BetaList no longer takes free submissions. Rejected startups are refunded.",
      bestFor:
        "Software and hardware startups just before or after launch that want early sign-ups.",
      tip: "BetaList looks for a clear value proposition and a well-designed landing page with a sign-up.",
    },
    {
      id: "taaft",
      name: "There's An AI For That",
      url: "https://theresanaiforthat.com/launch/",
      summary: "A large directory of AI tools.",
      how: "Submissions are reviewed by hand, usually within one or two days, and refunded if the tool is not published. Once a month it also picks one tool for free from a thread on X.",
      cost: "A paid review for each listing, apart from the monthly free pick.",
      bestFor: "AI tools only.",
    },
    {
      id: "trustmrr",
      name: "TrustMRR",
      url: "https://trustmrr.com/faq",
      summary:
        "A database of startups with revenue verified through their payment providers, and a marketplace for buying and selling startups.",
      how: "You connect a read-only key from a supported provider, such as Stripe, Paddle, Polar, Dodo Payments or Lemon Squeezy, and the profile is made from it. You cannot list without such a key.",
      cost: "Free to list, with paid add-ons such as a followed link and more visibility, and paid plans for selling a startup.",
      bestFor: "Founders with revenue who want public proof of it, or who plan to sell.",
    },
  ],
};

const reviewSites: LaunchGroup = {
  id: "review-sites",
  title: "Review sites",
  intro:
    "Business buyers compare software on review sites. They matter once you have customers who can write reviews, and most of what they offer beyond a profile is paid.",
  places: [
    {
      id: "g2",
      name: "G2",
      url: "https://sell.g2.com/create-a-profile",
      summary: "A marketplace of reviews of business software and services.",
      how: "You request the product with a LinkedIn account or a work email address, G2's research team checks it in about three to five business days, and you then claim the profile.",
      cost: "A free profile, with paid plans.",
      bestFor:
        "Live B2B products with customers who can write reviews. G2 does not list consumer products or products in alpha or beta.",
      tip: "A product needs at least 10 reviews to appear on G2's grid for its category, so ask your first customers.",
    },
    {
      id: "capterra",
      name: "Capterra",
      url: "https://www.capterra.com/vendors/",
      summary:
        "A site for comparing and reviewing business software, run by G2 since early 2026 together with GetApp and Software Advice.",
      how: "Getting listed starts from G2's product form. The product must be on sale to the public; a waiting list alone is not accepted.",
      cost: "A free profile; vendors pay per click or per lead for sponsored places.",
      bestFor: "Software on sale to the public that can collect reviews.",
      tip: "Use the product's name exactly as on your website, real screenshots of the product, and neutral text without superlatives.",
    },
  ],
};

export const launchGroups: LaunchGroup[] = [launchDays, communities, directories, reviewSites];

/** Mistakes that cost more than they bring, with Google's own rules as the source. */
export const launchCautions = [
  "Links you pay for. Google's spam policies count bought links as link spam unless they are marked nofollow or sponsored, so a paid followed link can hurt the site it points to.",
  "Hundreds of directories at once. A burst of links from low-quality directories looks like spam to search engines; a few relevant places kept up to date do more.",
  "Paying to be listed or to skip a queue without checking the audience. Look at a site's own traffic and listings before you pay.",
  "Listings you never update. Keep your description, pricing and screenshots current wherever you are listed.",
];

export const SPAM_POLICIES_URL =
  "https://developers.google.com/search/docs/essentials/spam-policies";
