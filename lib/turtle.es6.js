import _ from 'lodash';
import yargs from 'yargs';
import path from 'path';
import { asyncify } from 'asyncbox';
import { mkdirp, writeFile, rmrf } from './future';
import { depsForPackage, outdatedPackages } from './deps';
import { log } from './log';
import 'babel/polyfill';

const HOMEDIR = process.env.HOME;

async function main () {
  const [proj, ver] = yargs.argv._[0].split("@");
  const clearCache = yargs.argv.clear;
  const devDeps = yargs.argv.dev;
  let restrictTo = null;
  if (!proj) {
    console.error("Must pass in the name of the NPM package");
    process.exit(1);
  }
  if (yargs.argv.restrict) {
    restrictTo = yargs.argv.restrict.split(",");
    if (!_.contains(restrictTo, proj)) {
      restrictTo.push(proj);
    }
  }
  if (devDeps && !restrictTo) {
    console.error("Can't examine dev deps unless you also restrict the " +
                  "projects we care about using --restrict");
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
  if (devDeps) {
    log.grey("Will install all dependencies including devDependencies");
  }
  let [deps, newDb] = await depsForPackage(proj, ver, db, devDeps, restrictTo);
  let outdated = outdatedPackages(deps, restrictTo);
  await writeFile(dbPath, JSON.stringify(newDb));
  printOutdated(proj, ver, outdated, restrictTo);
}

function printOutdated (proj, ver, outdated, restrictTo) {
  if (restrictTo) {
    log.grey(`\nWill only show data pertaining to the following packages: ` +
             JSON.stringify(restrictTo));
  }
  if (_.size(outdated.outdated)) {
    log.red(`\n${proj}@${ver} has outdated dependencies:`);
    for (let [sub, changes] of _.pairs(outdated.outdated)) {
      log.red(` - ${sub}: ${changes.requirement} --> ${changes.upgrade}`);
    }
  } else {
    log.green(`\n${proj}@${ver} has no outdated dependencies`);
  }
  if (_.size(outdated.subs)) {
    //console.log(require('util').inspect(outdated.subs, {depth: 5}));
    log.yellow(`\n${proj}@${ver} has submodules which have outdated dependencies:`);
    console.log(outdatedTree(outdated.subs));
  }
}

function outdatedTree (subs, depth = 0) {
  function getPadding (d) {
    let pad = 2;
    return ' '.repeat(d * pad);
  }
  let str = '';
  for (let [sub, subData] of _.pairs(subs)) {
    str += log._yellow(`${getPadding(depth)}- ${sub}@${subData.version}\n`);
    if (_.size(subData.outdated)) {
      for (let [subSub, subChanges] of _.pairs(subData.outdated)) {
        let msg = `${subSub}: ${subChanges.requirement} --> ${subChanges.upgrade}`;
        str += log._yellow(`${getPadding(depth + 1)}- ${log._red(msg)}\n`);
      }
    }
    if (_.size(subData.subs)) {
      str += outdatedTree(subData.subs, depth + 1);
    }
  }
  return str;
}

if (require.main === module) {
  asyncify(main);
}
