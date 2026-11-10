// Downloads Natural Earth (pinned release) and writes the processed files.
//
//   npm run data:geo                       # download + build
//   npm run data:geo -- --source ./myfiles # use already-downloaded raw files
//
// Offline? Download the two GeoJSON files named in geography.config.js by
// hand, put them in one folder and pass --source <folder>.

import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { geographyConfig as cfg, NATURAL_EARTH_VERSION } from "../src/config/geography.config.js";
import { buildFromRaw } from "../src/services/geography/geoBuild.js";

export async function writeProcessed(outDir, built, extraMeta = {}) {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, "admin1"), { recursive: true });

  const meta = {
    ...cfg.meta,
    version: NATURAL_EARTH_VERSION,
    builtAt: new Date().toISOString(),
    countryCount: built.index.countries.length,
    divisionCount: built.index.divisions.length,
    ...extraMeta,
  };
  await fs.writeFile(path.join(outDir, "index.json"), JSON.stringify({ meta, ...built.index }));
  await fs.writeFile(path.join(outDir, "countries.json"), JSON.stringify(built.countriesFC));
  for (const [countryId, fc] of built.shards) {
    await fs.writeFile(path.join(outDir, "admin1", `${countryId}.json`), JSON.stringify(fc));
  }
  return meta;
}

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const { size } = await fs.stat(dest);
  if (size < 1_000_000) throw new Error(`${dest} is only ${size} bytes — download looks truncated.`);
}

async function main() {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf("--source");
  let rawDir = cfg.rawDir;

  if (srcIdx !== -1) {
    rawDir = path.resolve(args[srcIdx + 1] ?? "");
  } else {
    for (const s of Object.values(cfg.sources)) {
      const dest = path.join(rawDir, s.file);
      try {
        await fs.access(dest);
        console.log(`Using cached ${s.file}`);
      } catch {
        await download(s.url, dest);
      }
    }
  }

  const read = async (s) => JSON.parse(await fs.readFile(path.join(rawDir, s.file), "utf8"));
  const [countriesFC, admin1FC] = await Promise.all([read(cfg.sources.countries), read(cfg.sources.admin1)]);

  const built = buildFromRaw(countriesFC, admin1FC, {
    precision: cfg.coordinatePrecision,
    focusRatio: cfg.focusAreaRatio,
  });

  console.log("Build report:", JSON.stringify(built.report));
  const { minCountries, minDivisions } = cfg.sanity;
  if (built.index.countries.length < minCountries || built.index.divisions.length < minDivisions) {
    throw new Error(
      `Sanity check failed: ${built.index.countries.length} countries (min ${minCountries}), ` +
        `${built.index.divisions.length} divisions (min ${minDivisions}). Raw files may be incomplete or the schema changed.`
    );
  }

  const meta = await writeProcessed(cfg.processedDir, built);
  const withDivs = built.index.countries.filter((c) => c.adminDivisionsAvailable).length;
  console.log(
    `Done: ${meta.countryCount} countries (${withDivs} with admin-1 boundaries), ${meta.divisionCount} divisions → ${cfg.processedDir}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
