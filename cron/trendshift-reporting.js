#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const NY_TZ = 'America/New_York';
const REPORT_TIME_HOUR = 8;
const REPORT_TIME_MINUTE = 30;

const ROOT_DIR = path.resolve(__dirname, '..');
const TRENDSHIFT_DIR = path.join(ROOT_DIR, 'data', 'trendshift');
const RAW_DIR = path.join(TRENDSHIFT_DIR, 'raw');
const NORMALIZED_DIR = path.join(TRENDSHIFT_DIR, 'normalized');
const REPORTS_DIR = path.join(TRENDSHIFT_DIR, 'reports');
const HISTORY_PATH = path.join(TRENDSHIFT_DIR, 'history.jsonl');
const INTEREST_PROFILE_PATH = path.join(TRENDSHIFT_DIR, 'interest_profile.json');
const LATEST_JSON_PATH = path.join(TRENDSHIFT_DIR, 'latest.json');
const LATEST_REPORT_PATH = path.join(REPORTS_DIR, 'latest.md');

const stopwords = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your', 'you', 'are', 'was', 'were', 'will',
  'have', 'has', 'had', 'its', 'not', 'but', 'can', 'all', 'new', 'how', 'why', 'what', 'when', 'where',
  'who', 'their', 'they', 'them', 'about', 'using', 'use', 'via', 'than', 'then', 'there', 'been', 'being',
  'more', 'most', 'over', 'under', 'between', 'after', 'before', 'just', 'like', 'make', 'made', 'many',
  'much', 'also', 'our', 'out', 'off', 'one', 'two', 'three', 'first', 'second', 'third', 'best', 'top',
  'daily', 'today', 'week', 'repo', 'repository', 'repositories', 'github', 'hn', 'front', 'page', 'show',
  'ask', 'tell', 'news'
]);

function nowIso() {
  return new Date().toISOString();
}

function nyDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}:${map.second}`,
  };
}

function nyDateString(date = new Date()) {
  return nyDateParts(date).date;
}

async function ensureDirs(dateStr) {
  await fs.mkdir(path.join(RAW_DIR, dateStr), { recursive: true });
  await fs.mkdir(NORMALIZED_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stopwords.has(t));
}

function keywordFreq(items, multiplier = 1) {
  const freq = new Map();
  items.forEach((item, idx) => {
    const weight = Math.max(1, (items.length - idx)) * multiplier;
    tokenize(item.title).forEach((kw) => {
      freq.set(kw, (freq.get(kw) || 0) + weight);
    });
  });
  return freq;
}

function topKeywords(freqMap, limit = 12) {
  return [...freqMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, score]) => ({ keyword, score }));
}

function toMarkdownLink(text, href) {
  if (!href) return text;
  return `[${text}](${href})`;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'trendshift-reporter/1.0',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  return res.json();
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'trendshift-reporter/1.0',
      Accept: 'text/html,*/*;q=0.9',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  return res.text();
}

async function collectExplore() {
  const data = await fetchJson('https://hn.algolia.com/api/v1/search?tags=front_page');
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return hits.map((h, idx) => ({
    rank: idx + 1,
    id: String(h.objectID || h.story_id || h.created_at_i || idx),
    title: h.title || h.story_title || 'Untitled',
    url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    points: Number(h.points || 0),
    comments: Number(h.num_comments || 0),
    author: h.author || null,
    source: 'hn_front_page',
  }));
}

function formatDateForGitHubQuery(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function collectGitHubTrending() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const createdAfter = formatDateForGitHubQuery(sevenDaysAgo);

  try {
    const data = await fetchJson(
      `https://api.github.com/search/repositories?q=created:%3E${createdAfter}&sort=stars&order=desc&per_page=20`
    );
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map((r, idx) => ({
      rank: idx + 1,
      id: r.full_name,
      title: r.full_name,
      url: r.html_url,
      description: r.description || '',
      language: r.language || null,
      stars: Number(r.stargazers_count || 0),
      forks: Number(r.forks_count || 0),
      source: 'github_search_recent_stars',
    }));
  } catch (err) {
    const html = await fetchText('https://github.com/trending?since=daily');
    const repos = [];
    const re = /<h2[^>]*class="h3 lh-condensed"[^>]*>[\s\S]*?<a[^>]*href="\/([^"#?]+\/[^"#?]+)"[\s\S]*?<\/a>[\s\S]*?<\/h2>/g;
    let match;
    while ((match = re.exec(html)) && repos.length < 20) {
      const fullName = match[1].trim().replace(/\s+/g, '');
      repos.push({
        rank: repos.length + 1,
        id: fullName,
        title: fullName,
        url: `https://github.com/${fullName}`,
        description: '',
        language: null,
        stars: 0,
        forks: 0,
        source: 'github_trending_html_fallback',
      });
    }
    if (repos.length === 0) {
      throw err;
    }
    return repos;
  }
}

function compareWithYesterday(currentItems, previousItems, idKey, metricKeys) {
  const previousMap = new Map((previousItems || []).map((item) => [item[idKey], item]));
  return currentItems.map((item) => {
    const prev = previousMap.get(item[idKey]);
    const deltas = {};
    metricKeys.forEach((key) => {
      const currVal = Number(item[key] || 0);
      const prevVal = Number(prev?.[key] || 0);
      deltas[`${key}Delta`] = currVal - prevVal;
    });
    return { ...item, ...deltas, isNew: !prev };
  });
}

function buildEmergingThemes(todayKeywords, yesterdayKeywords) {
  const yesterdayMap = new Map((yesterdayKeywords || []).map((k) => [k.keyword, Number(k.score || 0)]));
  return todayKeywords
    .map((t) => {
      const prev = yesterdayMap.get(t.keyword) || 0;
      return {
        theme: t.keyword,
        score: Number(Number(t.score || 0).toFixed(2)),
        momentum: Number((Number(t.score || 0) - prev * 0.6).toFixed(2)),
        isNew: prev === 0,
      };
    })
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 10);
}

function scorePersonalizedItems(items, profileKeywords) {
  return items
    .map((item) => {
      const tokens = tokenize(`${item.title} ${item.description || ''}`);
      const score = tokens.reduce((sum, t) => sum + Number(profileKeywords[t] || 0), 0);
      return { ...item, personalizedScore: Number(score.toFixed(2)) };
    })
    .filter((item) => item.personalizedScore > 0)
    .sort((a, b) => b.personalizedScore - a.personalizedScore)
    .slice(0, 8);
}

function updateInterestProfile(profile, topThemeList, featuredItems) {
  const updated = {
    version: 1,
    updatedAt: nowIso(),
    keywords: { ...(profile?.keywords || {}) },
    sourceWeights: profile?.sourceWeights || {
      hn_front_page: 1,
      github_search_recent_stars: 1,
      github_trending_html_fallback: 0.8,
    },
  };

  Object.keys(updated.keywords).forEach((k) => {
    updated.keywords[k] = Number((updated.keywords[k] * 0.92).toFixed(4));
    if (updated.keywords[k] < 0.05) delete updated.keywords[k];
  });

  topThemeList.slice(0, 12).forEach((theme, idx) => {
    const boost = (12 - idx) * 0.5;
    updated.keywords[theme.theme] = Number(((updated.keywords[theme.theme] || 0) + boost).toFixed(4));
  });

  featuredItems.slice(0, 10).forEach((item, idx) => {
    const sourceWeight = updated.sourceWeights[item.source] || 1;
    tokenize(`${item.title} ${item.description || ''}`).forEach((kw) => {
      const boost = ((10 - idx) * 0.15) * sourceWeight;
      updated.keywords[kw] = Number(((updated.keywords[kw] || 0) + boost).toFixed(4));
    });
  });

  updated.keywords = Object.fromEntries(
    Object.entries(updated.keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 250)
  );

  return updated;
}

function buildExecutiveSummary(explore, repos, movers, themes) {
  const topExplore = explore.slice(0, 3).map((e) => e.title);
  const topRepos = repos.slice(0, 3).map((r) => r.title);

  const withNumericDelta = movers
    .map((m) => ({
      ...m,
      numericDelta:
        typeof m.starsDelta === 'number'
          ? m.starsDelta
          : typeof m.pointsDelta === 'number'
            ? m.pointsDelta
            : 0,
    }))
    .filter((m) => Number.isFinite(m.numericDelta));

  const positiveMovers = withNumericDelta.filter((m) => m.numericDelta > 0);
  const moverCount = positiveMovers.length;
  const medianDelta =
    positiveMovers.length === 0
      ? 0
      : (() => {
          const sorted = positiveMovers.map((m) => m.numericDelta).sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        })();

  const themeNames = themes.slice(0, 4).map((t) => t.theme);
  return {
    bullets: [
      `Explore pulse: ${topExplore.join('; ') || 'No highlights available'}.`,
      `GitHub signal: ${topRepos.join('; ') || 'No repository highlights available'}.`,
      moverCount === 0
        ? 'Momentum check: baseline snapshot captured; movers will be more meaningful after another daily run.'
        : `Momentum check: ${moverCount} items are up vs prior run (median delta ${Number(medianDelta.toFixed(1))}).`,
      `Theme snapshot: ${themeNames.join(', ') || 'No clear themes yet'}.`,
    ],
  };
}

function tableRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function renderReportMarkdown({
  dateStr,
  generatedAt,
  executive,
  explore,
  repos,
  topMovers,
  themes,
  personalized,
  profile,
  sourceErrors,
}) {
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(generatedAt));

  const lines = [];
  lines.push(`# Trendshift Report — ${dateStr}`);
  lines.push('');
  lines.push(`_Generated: ${dateLabel} (${NY_TZ})_`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  executive.bullets.forEach((b) => lines.push(`- ${b}`));
  lines.push('');

  lines.push('## Front Page (Explore) Highlights');
  lines.push('');
  lines.push(tableRow(['#', 'Story', 'Points', 'Comments', 'Source']));
  lines.push(tableRow(['---', '---', '---:', '---:', '---']));
  explore.slice(0, 10).forEach((item) => {
    lines.push(
      tableRow([
        String(item.rank),
        toMarkdownLink(item.title, item.url),
        String(item.points ?? ''),
        String(item.comments ?? ''),
        toMarkdownLink('HN front page', `https://news.ycombinator.com/item?id=${item.id}`),
      ])
    );
  });
  lines.push('');

  lines.push('## GitHub Trending Repositories Highlights');
  lines.push('');
  lines.push(tableRow(['#', 'Repository', 'Language', 'Stars', 'Forks', 'Source']));
  lines.push(tableRow(['---', '---', '---', '---:', '---:', '---']));
  repos.slice(0, 10).forEach((item) => {
    lines.push(
      tableRow([
        String(item.rank),
        toMarkdownLink(item.title, item.url),
        item.language || '—',
        String(item.stars ?? ''),
        String(item.forks ?? ''),
        toMarkdownLink('GitHub', item.url),
      ])
    );
  });
  lines.push('');

  lines.push('## Top Movers / Momentum');
  lines.push('');
  const moversSorted = [...topMovers]
    .sort((a, b) => (b.starsDelta || b.pointsDelta || 0) - (a.starsDelta || a.pointsDelta || 0))
    .slice(0, 10);
  if (moversSorted.length === 0) {
    lines.push('- Not enough historical data yet; momentum scores will populate after the next run.');
  } else {
    lines.push(tableRow(['Item', 'Type', 'Delta', 'Current', 'Link']));
    lines.push(tableRow(['---', '---', '---:', '---:', '---']));
    moversSorted.forEach((m) => {
      const delta = m.starsDelta ?? m.pointsDelta ?? 0;
      const current = m.stars ?? m.points ?? 0;
      lines.push(
        tableRow([
          m.title,
          m.starsDelta != null ? 'GitHub stars' : 'Explore points',
          `${delta >= 0 ? '+' : ''}${delta}`,
          String(current),
          toMarkdownLink('source', m.url),
        ])
      );
    });
  }
  lines.push('');

  lines.push('## Emerging Themes');
  lines.push('');
  if (themes.length === 0) {
    lines.push('- No strong themes detected yet.');
  } else {
    lines.push(tableRow(['Theme', 'Momentum', 'Today score', 'Status']));
    lines.push(tableRow(['---', '---:', '---:', '---']));
    themes.slice(0, 10).forEach((t) => {
      lines.push(tableRow([t.theme, `${t.momentum >= 0 ? '+' : ''}${t.momentum}`, String(t.score), t.isNew ? 'New' : 'Recurring']));
    });
  }
  lines.push('');

  lines.push('## Organized for You (Personalized)');
  lines.push('');
  const topProfileKeywords = Object.entries(profile.keywords || {})
    .slice(0, 8)
    .map(([k]) => `\`${k}\``)
    .join(', ');
  lines.push(`Active interest profile keywords: ${topProfileKeywords || 'none yet (profile will learn over time).'}`);
  lines.push('');

  if (personalized.length === 0) {
    lines.push('- No direct matches to your current interest profile today; profile will adapt as more reports accumulate.');
  } else {
    lines.push(tableRow(['Item', 'Signal', 'Personalized score', 'Link']));
    lines.push(tableRow(['---', '---', '---:', '---']));
    personalized.forEach((item) => {
      lines.push(
        tableRow([
          item.title,
          item.stars != null ? `GitHub (${item.stars}★)` : `Explore (${item.points} points)`,
          String(item.personalizedScore),
          toMarkdownLink('source', item.url),
        ])
      );
    });
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('### Notes');
  lines.push('- Data sources: Hacker News front page via Algolia API, GitHub repository trend approximation via GitHub Search API (with HTML fallback).');
  lines.push(`- Report day boundary and scheduling are based on ${NY_TZ} (EST/EDT auto-adjusted by IANA timezone rules).`);
  if (sourceErrors && sourceErrors.length > 0) {
    lines.push(`- Source reliability notes: ${sourceErrors.join('; ')}.`);
  }

  return `${lines.join('\n')}\n`;
}

async function run({ scheduled = false, force = false } = {}) {
  const nyNow = nyDateParts(new Date());
  const dateStr = nyNow.date;

  if (scheduled) {
    const isTargetMinute = nyNow.hour === REPORT_TIME_HOUR && nyNow.minute === REPORT_TIME_MINUTE;
    if (!isTargetMinute) {
      console.log(`[trendshift] Scheduled check skipped at ${nyNow.time} ${NY_TZ}; waiting for ${String(REPORT_TIME_HOUR).padStart(2, '0')}:${String(REPORT_TIME_MINUTE).padStart(2, '0')}.`);
      return;
    }
  }

  await ensureDirs(dateStr);

  const reportPath = path.join(REPORTS_DIR, `${dateStr}.md`);
  if (!force && (await fileExists(reportPath))) {
    console.log(`[trendshift] Report already exists for ${dateStr}. Skipping (use --force to regenerate).`);
    return;
  }

  const sourceErrors = [];
  let exploreRaw;
  let githubRaw;

  try {
    exploreRaw = await collectExplore();
  } catch (err) {
    sourceErrors.push(`Explore source failed: ${err.message || String(err)}`);
    exploreRaw = [];
  }

  try {
    githubRaw = await collectGitHubTrending();
  } catch (err) {
    sourceErrors.push(`GitHub source failed: ${err.message || String(err)}`);
    githubRaw = [];
  }

  if (exploreRaw.length === 0 && githubRaw.length === 0) {
    throw new Error('All data sources failed; no report generated.');
  }

  const rawDateDir = path.join(RAW_DIR, dateStr);
  await fs.writeFile(path.join(rawDateDir, 'explore_front_page.json'), JSON.stringify(exploreRaw, null, 2) + '\n');
  await fs.writeFile(path.join(rawDateDir, 'github_trending.json'), JSON.stringify(githubRaw, null, 2) + '\n');

  const previousDate = nyDateString(new Date(new Date().getTime() - 24 * 60 * 60 * 1000));
  const previousNormalizedPath = path.join(NORMALIZED_DIR, `${previousDate}.json`);
  const previousNormalized = await readJson(previousNormalizedPath, null);
  const hasPreviousDay = Boolean(previousNormalized && Array.isArray(previousNormalized.explore) && Array.isArray(previousNormalized.github));

  const exploreWithDeltas = compareWithYesterday(exploreRaw, previousNormalized?.explore || [], 'id', ['points', 'comments']).map((item) => ({
    ...item,
    pointsDelta: hasPreviousDay ? item.pointsDelta : null,
    commentsDelta: hasPreviousDay ? item.commentsDelta : null,
  }));
  const reposWithDeltas = compareWithYesterday(githubRaw, previousNormalized?.github || [], 'id', ['stars', 'forks']).map((item) => ({
    ...item,
    starsDelta: hasPreviousDay ? item.starsDelta : null,
    forksDelta: hasPreviousDay ? item.forksDelta : null,
  }));

  const exploreKeywords = keywordFreq(exploreRaw, 1.2);
  const githubKeywords = keywordFreq(githubRaw, 1.4);
  const mergedKeywords = new Map();
  for (const [k, v] of [...exploreKeywords.entries(), ...githubKeywords.entries()]) {
    mergedKeywords.set(k, (mergedKeywords.get(k) || 0) + v);
  }

  const todayThemeKeywords = topKeywords(mergedKeywords, 20);
  const emergingThemes = buildEmergingThemes(todayThemeKeywords, previousNormalized?.themes || []);

  const profile = await readJson(INTEREST_PROFILE_PATH, {
    version: 1,
    updatedAt: nowIso(),
    keywords: {},
    sourceWeights: {
      hn_front_page: 1,
      github_search_recent_stars: 1,
      github_trending_html_fallback: 0.8,
    },
  });

  const allItems = [...exploreWithDeltas, ...reposWithDeltas];
  const personalized = scorePersonalizedItems(allItems, profile.keywords || {});

  const updatedProfile = updateInterestProfile(profile, emergingThemes, allItems);
  const executive = buildExecutiveSummary(exploreRaw, githubRaw, allItems, emergingThemes);

  const normalized = {
    schemaVersion: 1,
    date: dateStr,
    generatedAt: nowIso(),
    timezone: NY_TZ,
    sourceErrors,
    sources: {
      explore: 'https://hn.algolia.com/api/v1/search?tags=front_page',
      github:
        githubRaw?.[0]?.source === 'github_trending_html_fallback'
          ? 'https://github.com/trending?since=daily'
          : 'https://api.github.com/search/repositories',
    },
    explore: exploreWithDeltas,
    github: reposWithDeltas,
    themes: todayThemeKeywords,
    emergingThemes,
    personalized,
  };

  const topMovers = hasPreviousDay
    ? allItems.filter((i) => Number(i.starsDelta ?? i.pointsDelta ?? 0) !== 0)
    : [];

  const reportMarkdown = renderReportMarkdown({
    dateStr,
    generatedAt: normalized.generatedAt,
    executive,
    explore: exploreWithDeltas,
    repos: reposWithDeltas,
    topMovers,
    themes: emergingThemes,
    personalized,
    profile: updatedProfile,
    sourceErrors,
  });

  await fs.writeFile(path.join(NORMALIZED_DIR, `${dateStr}.json`), JSON.stringify(normalized, null, 2) + '\n');
  await fs.writeFile(reportPath, reportMarkdown);
  await fs.writeFile(LATEST_REPORT_PATH, reportMarkdown);

  const latestSummary = {
    schemaVersion: 1,
    date: dateStr,
    generatedAt: normalized.generatedAt,
    timezone: NY_TZ,
    sourceErrors,
    reportPath: `reports/${dateStr}.md`,
    latestReportPath: 'reports/latest.md',
    topTrends: emergingThemes.slice(0, 8),
    exploreHighlights: exploreWithDeltas.slice(0, 8).map((item) => ({
      title: item.title,
      url: item.url,
      points: item.points,
      comments: item.comments,
      pointsDelta: item.pointsDelta,
      isNew: item.isNew,
    })),
    githubHighlights: reposWithDeltas.slice(0, 8).map((item) => ({
      repo: item.title,
      url: item.url,
      language: item.language,
      stars: item.stars,
      starsDelta: item.starsDelta,
      isNew: item.isNew,
    })),
    topMovers: hasPreviousDay
      ? [...allItems]
          .sort((a, b) => Number(b.starsDelta ?? b.pointsDelta ?? 0) - Number(a.starsDelta ?? a.pointsDelta ?? 0))
          .slice(0, 8)
          .map((item) => ({
            title: item.title,
            url: item.url,
            delta: item.starsDelta ?? item.pointsDelta ?? 0,
            metric: item.starsDelta != null ? 'stars' : 'points',
            current: item.stars ?? item.points ?? 0,
          }))
      : [],
    personalized: personalized.slice(0, 8).map((item) => ({
      title: item.title,
      url: item.url,
      score: item.personalizedScore,
      signal: item.stars != null ? 'github' : 'explore',
    })),
  };

  await fs.writeFile(LATEST_JSON_PATH, JSON.stringify(latestSummary, null, 2) + '\n');
  await fs.writeFile(INTEREST_PROFILE_PATH, JSON.stringify(updatedProfile, null, 2) + '\n');

  const historyRecord = {
    event: 'report_generated',
    date: dateStr,
    generatedAt: normalized.generatedAt,
    timezone: NY_TZ,
    baseline: !hasPreviousDay,
    sourceErrors,
    counts: {
      explore: exploreWithDeltas.length,
      github: reposWithDeltas.length,
      themes: emergingThemes.length,
      personalized: personalized.length,
    },
    paths: {
      rawDir: `raw/${dateStr}`,
      normalized: `normalized/${dateStr}.json`,
      report: `reports/${dateStr}.md`,
      latestReport: 'reports/latest.md',
      latestJson: 'latest.json',
    },
  };

  await fs.appendFile(HISTORY_PATH, JSON.stringify(historyRecord) + '\n');

  console.log(`[trendshift] Report generated for ${dateStr}`);
  console.log(`[trendshift] - ${path.relative(TRENDSHIFT_DIR, reportPath)}`);
  console.log(`[trendshift] - reports/latest.md`);
  console.log(`[trendshift] - latest.json`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  await run({
    scheduled: args.has('--scheduled'),
    force: args.has('--force'),
  });
}

main().catch((err) => {
  console.error('[trendshift] Error:', err?.stack || err);
  process.exit(1);
});
