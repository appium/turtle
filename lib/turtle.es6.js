import _ from 'lodash';
import yargs from 'yargs';
import path from 'path';
import clc from 'cli-color';
import { asyncify } from 'asyncbox';
import { mkdirp, writeFile, rmrf } from './future';
import { depsForPackage, outdatedPackages } from './deps';

const HOMEDIR = process.env.HOME;

async function main () {
  const [proj, ver] = yargs.argv._[0].split("@");
  const clearCache = yargs.argv.clear;
  const devDeps = yargs.argv.dev;
  let restrictTo = null;
  if (yargs.argv.restrict) {
    restrictTo = yargs.argv.restrict.split(",");
  }
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
  } catch (e) {}
  let [deps, newDb] = await depsForPackage(proj, ver, db, devDeps);
  let outdated = outdatedPackages(deps, restrictTo);
  await writeFile(dbPath, JSON.stringify(newDb));
  if (_.size(outdated.outdated)) {
    console.log(clc.red("This module has outdated dependencies:"));
    console.log(clc.red(outdated.outdated));
  } else {
    console.log(clc.green("This module has no outdated dependencies"));
  }
  if (_.size(outdated.subs)) {
    console.log(clc.yellow("This module has submodules which have outdated dependencies:"));
    for (let sub of _.keys(outdated.subs)) {
      console.log(` - ${clc.yellow(sub)}`);
    }
  }
  //console.log(require('util').inspect(outdated, {depth: 10}));
}

if (require.main === module) {
  asyncify(main);
}
