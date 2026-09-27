-- Visits from Android apps, and Google search told apart from Google's other sites.
--
-- An Android app that opens a link in the browser gives android-app://<package>/ as the referrer.
-- The site dropped those, so visits from the Reddit app counted as direct. It now keeps them as
-- android-app:<package> (referrerHost in src/lib/analytics.ts). Known apps count as their site
-- here, so the Reddit app and reddit.com share a channel and a source name; the mapping is applied
-- when reports are read, so a newly known app also names its earlier visits. Other apps are
-- referrals named by their package.
--
-- Google search matched every host under google.<tld>, so docs.google.com and accounts.google.com
-- counted as search. It is now google.<tld> itself, and Google's other sites are referrals named by
-- their host. Some more sites get a channel and a name, among them the apps' sites.

-- The site a visit's referrer stands for: the stored host, or a known app's site. Null for none and
-- for an app without a known site.
create function private.analytics_referrer_site(p_referrer text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_referrer is null then null
    when p_referrer not like 'android-app:%' then lower(p_referrer)
    else case substr(lower(p_referrer), 13)
      -- Search
      when 'com.google.android.googlequicksearchbox' then 'google.com'
      when 'com.google.android.apps.searchlite' then 'google.com'
      when 'com.microsoft.bing' then 'bing.com'
      when 'com.duckduckgo.mobile.android' then 'duckduckgo.com'
      -- Email
      when 'com.google.android.gm' then 'mail.google.com'
      when 'com.microsoft.office.outlook' then 'outlook.live.com'
      when 'com.yahoo.mobile.client.android.mail' then 'mail.yahoo.com'
      when 'ch.protonmail.android' then 'mail.proton.me'
      -- AI assistants
      when 'com.openai.chatgpt' then 'chatgpt.com'
      when 'ai.perplexity.app.android' then 'perplexity.ai'
      when 'com.anthropic.claude' then 'claude.ai'
      when 'com.google.android.apps.bard' then 'gemini.google.com'
      when 'com.microsoft.copilot' then 'copilot.microsoft.com'
      when 'ai.x.grok' then 'grok.com'
      when 'com.deepseek.chat' then 'deepseek.com'
      -- Social networks and messaging
      when 'com.reddit.frontpage' then 'reddit.com'
      when 'com.twitter.android' then 'x.com'
      when 'com.facebook.katana' then 'facebook.com'
      when 'com.facebook.lite' then 'facebook.com'
      when 'com.facebook.orca' then 'messenger.com'
      when 'com.instagram.android' then 'instagram.com'
      when 'com.instagram.barcelona' then 'threads.com'
      when 'com.linkedin.android' then 'linkedin.com'
      when 'com.zhiliaoapp.musically' then 'tiktok.com'
      when 'com.ss.android.ugc.trill' then 'tiktok.com'
      when 'com.google.android.youtube' then 'youtube.com'
      when 'com.pinterest' then 'pinterest.com'
      when 'xyz.blueskyweb.app' then 'bsky.app'
      when 'com.tumblr' then 'tumblr.com'
      when 'com.snapchat.android' then 'snapchat.com'
      when 'com.quora.android' then 'quora.com'
      when 'com.discord' then 'discord.com'
      when 'org.telegram.messenger' then 't.me'
      when 'com.whatsapp' then 'whatsapp.com'
      when 'com.whatsapp.w4b' then 'whatsapp.com'
      when 'com.simon.harmonichackernews' then 'news.ycombinator.com'
      when 'io.github.hidroh.materialistic' then 'news.ycombinator.com'
      when 'com.medium.reader' then 'medium.com'
      when 'com.substack.app' then 'substack.com'
      -- Other
      when 'com.github.android' then 'github.com'
      when 'com.slack' then 'slack.com'
    end
  end
$$;
revoke execute on function private.analytics_referrer_site(text) from public, anon, authenticated;

-- Where a visit came from, as a channel. Campaign tags win over the referring site or app.
create or replace function private.analytics_channel(p_referrer text, p_utm_source text,
  p_utm_medium text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_medium text := lower(coalesce(p_utm_medium, ''));
  v_source text := lower(coalesce(p_utm_source, ''));
  v_host text := coalesce(private.analytics_referrer_site(p_referrer), '');
begin
  if v_medium ~ '^(cpc|ppc|paid|paidsearch|paid[-_ ]?(search|social)|display|cpm|banner|ads?)$' then
    return 'Paid';
  end if;
  if v_medium in ('email', 'e-mail', 'newsletter') or v_source in ('email', 'newsletter')
    or v_host ~ '(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.proton\.me)$' then
    return 'Email';
  end if;
  if v_source ~ '^(chatgpt(\.com)?|openai|perplexity(\.ai)?|claude(\.ai)?|gemini|copilot)$'
    or v_host ~ '(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|phind\.com|poe\.com|you\.com|deepseek\.com|meta\.ai|grok\.com|mistral\.ai)$' then
    return 'AI assistants';
  end if;
  if v_medium in ('organic', 'search') or v_source ~ '^(google|bing|duckduckgo|yahoo|ecosia)$'
    or v_host ~ '^(www\.)?google\.[a-z.]+$'
    or v_host ~ '(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.com|yandex\.[a-z.]+|baidu\.com|ecosia\.org|search\.brave\.com|startpage\.com|qwant\.com|kagi\.com|naver\.com|seznam\.cz)$' then
    return 'Organic search';
  end if;
  if v_medium in ('social', 'social-media', 'social_media', 'sm')
    or v_source ~ '^(twitter|x|facebook|fb|instagram|linkedin|reddit|hackernews|hn|youtube|tiktok|threads|bluesky|mastodon|producthunt|indiehackers|discord|telegram|whatsapp)$'
    or v_host ~ '(^|\.)(t\.co|x\.com|twitter\.com|facebook\.com|fb\.com|messenger\.com|instagram\.com|linkedin\.com|lnkd\.in|reddit\.com|news\.ycombinator\.com|youtube\.com|youtu\.be|tiktok\.com|threads\.net|threads\.com|bsky\.app|mastodon\.social|pinterest\.[a-z.]+|quora\.com|tumblr\.com|snapchat\.com|discord\.com|discordapp\.com|t\.me|whatsapp\.com|producthunt\.com|indiehackers\.com|medium\.com|substack\.com)$' then
    return 'Organic social';
  end if;
  if p_referrer is null and p_utm_source is null then
    return 'Direct';
  end if;
  return 'Referral';
end;
$$;

-- Where a visit came from, by name: known sites and apps get their usual name, other sites their
-- host or tag, and other apps their package. Null is a visit without either.
create or replace function private.analytics_source(p_referrer text, p_utm_source text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_site text := private.analytics_referrer_site(p_referrer);
  v text := lower(coalesce(p_utm_source, v_site));
begin
  if v is null then
    return case when p_referrer like 'android-app:%'
      then substr(lower(p_referrer), 13) || ' (Android app)' end;
  end if;
  return case
    when v ~ '(^|\.)mail\.google\.com$' then 'Gmail'
    when v ~ '(^|\.)gemini\.google\.com$' or v = 'gemini' then 'Gemini'
    when v ~ '^(www\.)?google\.[a-z.]+$' or v = 'google' then 'Google'
    when v ~ '(^|\.)bing\.com$' or v = 'bing' then 'Bing'
    when v ~ '(^|\.)duckduckgo\.com$' or v = 'duckduckgo' then 'DuckDuckGo'
    when v ~ '(^|\.)mail\.yahoo\.com$' then 'Yahoo Mail'
    when v ~ '(^|\.)yahoo\.com$' or v = 'yahoo' then 'Yahoo'
    when v ~ '(^|\.)yandex\.[a-z.]+$' then 'Yandex'
    when v ~ '(^|\.)baidu\.com$' then 'Baidu'
    when v ~ '(^|\.)ecosia\.org$' or v = 'ecosia' then 'Ecosia'
    when v ~ '(^|\.)search\.brave\.com$' then 'Brave Search'
    when v ~ '(^|\.)kagi\.com$' then 'Kagi'
    when v ~ '(^|\.)(chatgpt\.com|openai\.com)$' or v in ('chatgpt', 'openai') then 'ChatGPT'
    when v ~ '(^|\.)perplexity\.ai$' or v = 'perplexity' then 'Perplexity'
    when v ~ '(^|\.)claude\.ai$' or v = 'claude' then 'Claude'
    when v ~ '(^|\.)copilot\.microsoft\.com$' or v = 'copilot' then 'Copilot'
    when v ~ '(^|\.)grok\.com$' then 'Grok'
    when v ~ '(^|\.)deepseek\.com$' then 'DeepSeek'
    when v ~ '(^|\.)(t\.co|x\.com|twitter\.com)$' or v in ('twitter', 'x') then 'X'
    when v ~ '(^|\.)(facebook\.com|fb\.com)$' or v in ('facebook', 'fb') then 'Facebook'
    when v ~ '(^|\.)messenger\.com$' then 'Messenger'
    when v ~ '(^|\.)instagram\.com$' or v = 'instagram' then 'Instagram'
    when v ~ '(^|\.)(linkedin\.com|lnkd\.in)$' or v = 'linkedin' then 'LinkedIn'
    when v ~ '(^|\.)reddit\.com$' or v = 'reddit' then 'Reddit'
    when v ~ '(^|\.)news\.ycombinator\.com$' or v in ('hackernews', 'hn') then 'Hacker News'
    when v ~ '(^|\.)(youtube\.com|youtu\.be)$' or v = 'youtube' then 'YouTube'
    when v ~ '(^|\.)tiktok\.com$' or v = 'tiktok' then 'TikTok'
    when v ~ '(^|\.)(threads\.net|threads\.com)$' or v = 'threads' then 'Threads'
    when v ~ '(^|\.)bsky\.app$' or v = 'bluesky' then 'Bluesky'
    when v ~ '(^|\.)pinterest\.[a-z.]+$' then 'Pinterest'
    when v ~ '(^|\.)tumblr\.com$' then 'Tumblr'
    when v ~ '(^|\.)snapchat\.com$' then 'Snapchat'
    when v ~ '(^|\.)quora\.com$' then 'Quora'
    when v ~ '(^|\.)t\.me$' or v = 'telegram' then 'Telegram'
    when v ~ '(^|\.)whatsapp\.com$' or v = 'whatsapp' then 'WhatsApp'
    when v ~ '(^|\.)producthunt\.com$' or v = 'producthunt' then 'Product Hunt'
    when v ~ '(^|\.)indiehackers\.com$' or v = 'indiehackers' then 'Indie Hackers'
    when v ~ '(^|\.)github\.com$' or v = 'github' then 'GitHub'
    when v ~ '(^|\.)medium\.com$' then 'Medium'
    when v ~ '(^|\.)substack\.com$' then 'Substack'
    when v ~ '(^|\.)(discord\.com|discordapp\.com)$' or v = 'discord' then 'Discord'
    when v ~ '(^|\.)slack\.com$' then 'Slack'
    when v ~ '(^|\.)(outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com)$' then 'Outlook'
    when v ~ '(^|\.)mail\.proton\.me$' then 'Proton Mail'
    else coalesce(p_utm_source, v_site)
  end;
end;
$$;
