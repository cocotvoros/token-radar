// Pulse Radar — token launch radar (token-radar-01).
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
//
// Reads the sealed DefiLlama snapshot, ranks every genuine pre-token protocol
// by implied launch value, and writes the board, the dashboard's data, the
// dashboard, the screenshots and the judge's dossier into the output directory.
// Node 22, standard library only, no network, deterministic: two runs from the
// same snapshot write the same bytes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`pulse radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(out, { recursive: true });

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`pulse radar: the board fails the gate: ${issue}\n`);
  process.exit(1);
}

/** Copy a directory tree, regular files only, in sorted order. */
function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src).sort()) {
    const from = join(src, name);
    const to = join(dst, name);
    if (statSync(from).isDirectory()) copyTree(from, to);
    else if (statSync(from).isFile()) copyFileSync(from, to);
  }
}

const boardDoc = {
  title: 'Pulse Radar — token launch radar',
  as_of: snapshot.as_of,
  floor_usd: snapshot.floor_usd,
  row_count: board.length,
  watchlist_covered: snapshot.watchlist.length,
  comparables: radar.comparables.length,
  universe: radar.universe,
  validation: radar.validation,
  tournament: radar.tournament,
  curve: radar.curve,
  rows: board,
};
writeFileSync(join(out, 'board.json'), JSON.stringify(boardDoc, null, 2) + '\n');
writeFileSync(join(out, 'data.js'), dataScript(radar));
copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65536 }));

const chosenCore = radar.tournament.candidates.find((c) => c.name === radar.tournament.chosen) ?? radar.tournament.candidates[0]!;
const dossierBytes = statSync(join(out, 'dossier.json')).size;
process.stdout.write(
  `pulse radar: ${board.length} rows, ${radar.comparables.length} comparables, ` +
  `top ${board[0]!.slug} at $${board[0]!.implied_value_usd.toLocaleString('en-US')}, ` +
  `universe ${radar.universe.ranked}+${radar.universe.set_aside}+${radar.universe.already_trading}=${radar.universe.total}, ` +
  `holdout typical miss x${radar.validation.typical_miss_factor.toFixed(2)}, spearman ${radar.validation.spearman.toFixed(2)}, ` +
  `LOO chosen core miss x${chosenCore.typical_miss_factor.toFixed(2)}, ${chosenCore.within_2x}/${radar.tournament.n} within 2x, curve R2 ${radar.curve.r2.toFixed(2)}, ` +
  `${radar.validation.recompute_match}, dossier ${dossierBytes} bytes\n`,
);
