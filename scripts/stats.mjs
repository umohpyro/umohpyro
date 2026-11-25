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

const days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
const today = new Date().toISOString().slice(0, 10);
let longest = 0;
let run = 0;
for (const d of days) {
  run = d.contributionCount > 0 ? run + 1 : 0;
  longest = Math.max(longest, run);
}
let current = 0;
let i = days.length - 1;
if (days[i]?.date === today && days[i].contributionCount === 0) i--; // today may not have happened yet
for (; i >= 0 && days[i].contributionCount > 0; i--) current++;

const bytes = {};
for (const r of u.repositories.nodes)
  for (const e of r.languages.edges)
    if (!HIDE.has(e.node.name)) bytes[e.node.name] = (bytes[e.node.name] ?? 0) + e.size;
const langs = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 4);
const total = langs.reduce((a, [, n]) => a + n, 0) || 1;

const nf = (n) => n.toLocaleString("en-US");
const stats = [
  [nf(c.contributionCalendar.totalContributions), "contributions in the last year"],
  [nf(current), `day streak (longest ${nf(longest)})`],
  [nf(u.pullRequests.totalCount), "pull requests, all time"],
  [nf(u.followers.totalCount), "followers"],
];
const privateShare = nf(c.restrictedContributionsCount);
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
<text x="864" y="276" font-family="${font}" font-size="14" fill="${t.muted}">${privateShare} of the year's contributions are in private repositories.</text>
</svg>`;
}

mkdirSync("assets", { recursive: true });
for (const [name, t] of Object.entries(themes)) writeFileSync(`assets/stats-${name}.svg`, svg(t));
console.log("wrote stats", { total: c.contributionCalendar.totalContributions, current, longest, langs: langs.map(([n]) => n) });
