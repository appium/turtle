import yargs from 'yargs';
import path from 'path';
import { asyncify } from 'asyncbox';
import { mkdir } from './future';

const HOMEDIR = process.env.HOME;

async function main () {
  const proj = yargs.argv._[0];
  if (!proj) {
    console.error("Must pass in the name of the NPM package");
    process.exit(1);
  }
  const dbDir = path.resolve(HOMEDIR, ".turtle");
  try {
    await mkdir(dbDir, 0o0744);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const dbPath = path.resolve(dbDir, "db.json");
  let db = {};
  try {
    db = require(dbPath);
    console.log("(Using existing turtle database)");
  } catch (e) {}
}

if (require.main === module) {
  asyncify(main);
}
