// Writes assets/stats-light.svg and assets/stats-dark.svg from the GitHub API.
// Needs STATS_TOKEN (a token with read:user only). Totals only: no repository names are ever written.
import { writeFileSync, mkdirSync } from "node:fs";

const token = process.env.STATS_TOKEN;
const login = process.env.STATS_USER ?? "umohpyro";
if (!token) throw new Error("STATS_TOKEN is not set");

// Languages that come from school work, not what I build now.
const HIDE = new Set(["C", "Python", "Shell", "Makefile", "Jupyter Notebook"]);

const query = `query($login:String!){user(login:$login){
  followers{totalCount}
  pullRequests{totalCount}
  contributionsCollection{
    restrictedContributionsCount
    contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}
  }
  repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,first:100){
    totalCount
    nodes{languages(first:6,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}
  }
}}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "profile-stats",
  },
  body: JSON.stringify({ query, variables: { login } }),
});
const body = await res.json();
if (!res.ok || body.errors)
  throw new Error("GitHub API failed: " + JSON.stringify(body.errors ?? res.status));
const u = body.data.user;
const c = u.contributionsCollection;

// The calendar covers one year, so a record needs every year since the account began.
const gql = async (q, variables) => {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-stats" },
    body: JSON.stringify({ query: q, variables }),
  });
  const b = await r.json();
  if (!r.ok || b.errors) throw new Error("GitHub API failed: " + JSON.stringify(b.errors ?? r.status));
  return b.data;
};
const created = new Date((await gql(`query($l:String!){user(login:$l){createdAt}}`, { l: login })).user.createdAt);
const byDate = new Map();
for (let y = created.getUTCFullYear(); y <= new Date().getUTCFullYear(); y++) {
  const from = new Date(Date.UTC(y, 0, 1)).toISOString();
  const to = new Date(Math.min(Date.UTC(y, 11, 31, 23, 59, 59), Date.now())).toISOString();
  const d = await gql(
    `query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`,
    { l: login, f: from, t: to },
  );
  for (const w of d.user.contributionsCollection.contributionCalendar.weeks)
    for (const day of w.contributionDays) byDate.set(day.date, day.contributionCount);
}
const days = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, contributionCount]) => ({ date, contributionCount }));
const allTime = days.reduce((a, d) => a + d.contributionCount, 0); // every day since the account began, private work included
const activeDays = days.filter((d) => d.contributionCount > 0).length;
const today = new Date().toISOString().slice(0, 10);
const streaks = []; // every run of days with at least one contribution
let start = null;
for (let k = 0; k <= days.length; k++) {
  const on = k < days.length && days[k].contributionCount > 0;
  if (on && start === null) start = k;
  if (!on && start !== null) {
    streaks.push({ len: k - start, end: days[k - 1].date });
    start = null;
  }
}
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const live = streaks.at(-1) && (streaks.at(-1).end === today || streaks.at(-1).end === yesterday) ? streaks.at(-1) : null;
const current = live?.len ?? 0;
const earlier = streaks.filter((s) => s !== live).reduce((m, s) => Math.max(m, s.len), 0); // best streak that is over
const longest = Math.max(current, earlier);

const bytes = {};
for (const r of u.repositories.nodes)
  for (const e of r.languages.edges)
    if (!HIDE.has(e.node.name)) bytes[e.node.name] = (bytes[e.node.name] ?? 0) + e.size;
const langs = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 4);
const total = langs.reduce((a, [, n]) => a + n, 0) || 1;

const nf = (n) => n.toLocaleString("en-US");
const stats = [
  [nf(allTime), `contributions since ${created.getUTCFullYear()}`],
  [nf(c.contributionCalendar.totalContributions), "contributions in the last year"],
  [
    nf(current),
    current > earlier
      ? `day streak, a new record (was ${nf(earlier)})`
      : `day streak now (record ${nf(longest)})`,
  ],
  [nf(activeDays), "days with at least one contribution"],
];
const stamp = new Date().toISOString().slice(0, 10);

const themes = {
  light: { ground: "#fbf7f5", card: "#ffffff", ink: "#300402", muted: "#6f504c", hair: "#e6d2cb", link: "#0a6f66", fill: "#0e8f83" },
  dark: { ground: "#0f0302", card: "#170706", ink: "#ededed", muted: "#b3a39f", hair: "#36201c", link: "#3ed6c6", fill: "#0e8f83" },
};
const font = `Figtree, ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif`;
const mono = `'Geist Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function svg(t) {
  const tile = ([n, l], x, y) =>
    `<text x="${x + 26}" y="${y + 66}" font-family="${font}" font-size="50" font-weight="600" letter-spacing="-2.5" fill="${t.ink}">${esc(n)}</text>` +
    `<text x="${x + 26}" y="${y + 100}" font-family="${font}" font-size="17" fill="${t.muted}">${esc(l)}</text>`;
  const rows = langs
    .map(([name, n], k) => {
      const y = 150 + k * 32;
      const w = Math.max(8, Math.round((n / langs[0][1]) * 440));
      return (
        `<text x="864" y="${y}" font-family="${font}" font-size="17" fill="${t.ink}">${esc(name)}</text>` +
        `<rect x="994" y="${y - 11}" width="440" height="10" rx="5" fill="${t.hair}"/>` +
        `<rect x="994" y="${y - 11}" width="${w}" height="10" rx="5" fill="${t.fill}"/>` +
        `<text x="1520" y="${y}" font-family="${mono}" font-size="14" fill="${t.muted}" text-anchor="end">${Math.round((n / total) * 100)}%</text>`
      );
    })
    .join("");
  const label = `GitHub in numbers: ${stats.map(([n, l]) => `${n} ${l}`).join(", ")}. Updated ${stamp}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="330" viewBox="0 0 1600 330" role="img" aria-label="${esc(label)}">
<rect width="1600" height="330" fill="${t.ground}"/>
<text x="48" y="52" font-family="${mono}" font-size="13" letter-spacing="1.8" fill="${t.link}">GITHUB IN NUMBERS</text>
<text x="1552" y="52" font-family="${mono}" font-size="13" fill="${t.muted}" text-anchor="end">Updated ${stamp}</text>
<rect x="48.5" y="76.5" width="760" height="217" rx="20" fill="${t.card}" stroke="${t.hair}"/>
<path d="M428.5 77V293M49 185.5H808" stroke="${t.hair}"/>
${tile(stats[0], 48, 77)}${tile(stats[1], 429, 77)}${tile(stats[2], 48, 186)}${tile(stats[3], 429, 186)}
<rect x="836.5" y="76.5" width="715" height="217" rx="20" fill="${t.card}" stroke="${t.hair}"/>
<text x="864" y="110" font-family="${font}" font-size="17" fill="${t.muted}">Languages, by code in public repositories</text>
${rows}
<text x="864" y="276" font-family="${font}" font-size="14" fill="${t.muted}">Contributions include work in private repositories.</text>
</svg>`;
}

mkdirSync("assets", { recursive: true });
for (const [name, t] of Object.entries(themes)) writeFileSync(`assets/stats-${name}.svg`, svg(t));
console.log("wrote stats", { allTime, activeDays, total: c.contributionCalendar.totalContributions, current, earlier, longest, streaks: streaks.length, langs: langs.map(([n]) => n) });
