import _ from 'lodash';
import yargs from 'yargs';
import path from 'path';
import { asyncify } from 'asyncbox';
import { mkdirp, writeFile, rmrf } from './future';
import { depsForPackage, outdatedPackages } from './deps';
import { log } from './log';

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
    log.grey("Clearing cache");
    await rmrf(dbPath);
  }
  let db = {};
  try {
    db = require(dbPath);
  } catch (e) {}
  let [deps, newDb] = await depsForPackage(proj, ver, db, devDeps);
  let outdated = outdatedPackages(deps, restrictTo);
  await writeFile(dbPath, JSON.stringify(newDb));
  printOutdated(proj, ver, outdated);
}

function printOutdated (proj, ver, outdated) {
  if (_.size(outdated.outdated)) {
    log.red(`\n${proj}@${ver} has outdated dependencies:`);
    for (let [sub, changes] of _.pairs(outdated.outdated)) {
      log.red(` - ${sub}: ${changes.requirement} --> ${changes.upgrade}`);
    }
  } else {
    log.green(`\n${proj}@${ver} has no outdated dependencies`);
  }
  if (_.size(outdated.subs)) {
    log.yellow(`\n${proj}@${ver} has submodules which have outdated dependencies:`);
    for (let [sub, subData] of _.pairs(outdated.subs)) {
      log.yellow(` - ${sub}@${subData.version}`);
    }
  }
}

if (require.main === module) {
  asyncify(main);
}
