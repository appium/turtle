import path from 'path';
//import B from 'bluebird';
import _ from 'lodash';
import semver from 'semver';
import { getDependencies } from './future';
import { readDeps, manifestForPackage, NPM_TMPDIR } from './npm';

async function getDepMapLocally (packDir) {
  let depMap = await readDeps(packDir);
  let newDepMap = {};
  for (let [packVer, file] of _.pairs(depMap)) {
    let [specPack, specVer] = packVer.split("@");
    if (!newDepMap[specPack]) {
      newDepMap[specPack] = {};
    }
    newDepMap[specPack][specVer] = file;
  }
  return newDepMap;
}

async function depsForPackage (pack, ver, db, dev = false, modulesDir = null, depMap = null) {
  console.log(`Getting deps for ${pack}@${ver ? ver : 'latest'}`);
  if (pack && ver && db[pack] && db[pack][ver]) {
    console.log(`Found ${pack}@${ver} in cache db`);
    return [_.clone(db[pack][ver]), db];
  } else if (!ver) {
    console.log("No version, getting manifest");
  }
  let deps = {}, devDeps = {}, manifest, submodulesDir;
  if (!modulesDir) {
    manifest = await manifestForPackage(pack, ver);
    modulesDir = path.resolve(NPM_TMPDIR, "node_modules");
  } else {
    manifest = require(path.resolve(modulesDir, pack, "package.json"));
  }
  submodulesDir = path.resolve(modulesDir, pack, "node_modules");
  if (!depMap) {
    depMap = await getDepMapLocally(path.resolve(modulesDir, pack));
  }
  if (db[pack] && db[pack][manifest.version]) {
    console.log(`Found ${pack}@${manifest.version} in cache db`);
    return [_.clone(db[pack][manifest.version]), db];
  }
  deps = await getDependencies(manifest);
  if (dev) {
    console.log("doing dev stuff!");
    devDeps = await getDependencies(manifest, {dev: true});
    deps = Object.assign(deps, devDeps);
  }
  let depList = {};
  let outdated = {};
  for (let [subPack, info] of _.pairs(deps)) {
    if (!semver.satisfies(info.stable, info.required)) {
      outdated[subPack] = {requirement: info.required, upgrade: info.stable};
    }
    depList[subPack] = info.required;
  }
  if (!db[pack]) {
    db[pack] = {};
  }
  let subDeps = {};
  for (let [dep, req] of _.pairs(depList)) {
    let usedDepVer;
    try {
      usedDepVer = require(path.resolve(submodulesDir, dep, "package.json")).version;
    } catch (e) {
      console.log(`Could not find package.json for dep ${dep}, looking for suitable one in depMap`);
      let possibleMatches = depMap[dep];
      if (!possibleMatches) {
        throw new Error("Could not find any matching module");
      }
      for (let [ver, packDir] of _.pairs(possibleMatches)) {
        if (semver.satisfies(ver, req)) {
          usedDepVer = require(path.resolve(packDir, "package.json")).version;
          submodulesDir = path.resolve(packDir, "..");
          break;
        }
      }
    }
    [subDeps[dep],] = await depsForPackage(dep, usedDepVer, db, dev, submodulesDir, depMap);
  }
  let depData = {deps: depList, outdated, subDeps};
  console.log(`Setting ${pack}@${manifest.version} in cache with ${_.size(outdated)} outdated deps`);
  db[pack][manifest.version] = depData;
  return [depData, db];
}

export { depsForPackage };
