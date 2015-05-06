import yargs from 'yargs';
import path from 'path';
import { asyncify } from 'asyncbox';
import { mkdirp, writeFile, rmrf } from './future';
import { depsForPackage } from './deps';

const HOMEDIR = process.env.HOME;

async function main () {
  const [proj, ver] = yargs.argv._[0].split("@");
  const clearCache = yargs.argv.clear;
  const devDeps = yargs.argv.dev;
  if (!proj) {
    console.error("Must pass in the name of the NPM package");
    process.exit(1);
  }

  const dbDir = path.resolve(HOMEDIR, ".turtle");
  await mkdirp(dbDir);
  const dbPath = path.resolve(dbDir, "db.json");
  if (clearCache) {
    console.log("Clearing cache");
    await rmrf(dbPath);
  }
  let db = {};
  try {
    db = require(dbPath);
    console.log("(Using existing turtle database)");
  } catch (e) {}
  let [deps, newDb] = await depsForPackage(proj, ver, db, devDeps);
  await writeFile(dbPath, JSON.stringify(newDb));
  console.log(require('util').inspect(deps, {depth: 10}));
}

if (require.main === module) {
  asyncify(main);
}
