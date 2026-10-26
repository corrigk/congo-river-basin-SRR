// Copy the requirements decomposition into this site (src/s3/decomp/snapshot.json) so the Decomposition tab works
// offline and on a first visit. Run after finalizing a baseline in ../congo-srr-requirements:
//   npm run sync:decomp
// The tab also checks the live requirements site and shows a newer baseline when it finds one.
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(process.argv[2] || '../congo-srr-requirements');
const pick = ['published.json', 'working.json'].map(f => path.join(repo, 'data', f)).find(f => fs.existsSync(f));
if (!pick) throw new Error(`No data/published.json or data/working.json in ${repo}`);
const data = JSON.parse(fs.readFileSync(pick, 'utf8'));
const out = { format: data.format, baseline: data.baseline || null, synced: new Date().toISOString(), source: path.basename(pick), reqs: data.reqs, links: data.links };
fs.writeFileSync(new URL('../src/s3/decomp/snapshot.json', import.meta.url), `${JSON.stringify(out)}\n`);
console.log(`snapshot: ${out.reqs.length} requirements, ${out.links.length} links from ${path.relative(process.cwd(), pick)}${out.baseline ? ` (baseline "${out.baseline.name}")` : ' (working copy, not finalized)'}`);
