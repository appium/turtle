import path from 'path';
import os from 'os';
//import B from 'bluebird';
import _ from 'lodash';
import semver from 'semver';
import { mkdirp, getDependencies, exec, readdir } from './future';

const NPM_TMPDIR = path.resolve(os.tmpdir(), 'turtle');

async function readDeps (root) {
  let depMap = {};
  let nodeModules = path.resolve(root, "node_modules");
  let submodules;
  try {
    submodules = await readdir(nodeModules);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return {};
  }
  submodules = submodules.filter(s => s[0] !== '.');
  if (submodules.length > 0) {
    for (let s of submodules) {
      let submodDir = path.resolve(nodeModules, s);
      let version = require(path.resolve(submodDir, "package.json")).version;
      depMap[`${s}@${version}`] = submodDir;
      depMap = Object.assign(depMap, await readDeps(submodDir));
    }
  }
  return depMap;
}

function npmInstall (root, pack, ver) {
  let cmd = `npm install --no-bin-links ${pack}`;
  if (ver) {
    cmd += `@${ver}`;
  }
  cmd += ' .';
  return exec(cmd, {cwd: root, env: process.env});
}

async function manifestForPackage (pack, ver, dev = false) {
  await mkdirp(NPM_TMPDIR);
  await npmInstall(NPM_TMPDIR, pack, ver);
  //let packDir = path.resolve(NPM_TMPDIR, "node_modules", pack);
  if (dev) {
    //await installDeps(npm, packDir);
  }
  let manifest = path.resolve(NPM_TMPDIR, "node_modules", pack, "package.json");
  let nodeModulesDir = path.resolve(NPM_TMPDIR, "node_modules", pack, "node_modules");
  return [require(manifest), nodeModulesDir];
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
    [manifest, submodulesDir] = await manifestForPackage(pack, ver);
    modulesDir = path.resolve(NPM_TMPDIR, "node_modules");
  } else {
    manifest = require(path.resolve(modulesDir, pack, "package.json"));
    submodulesDir = path.resolve(modulesDir, pack, "node_modules");
  }
  if (!depMap) {
    depMap = await readDeps(path.resolve(modulesDir, pack));
    let newDepMap = {};
    for (let [packVer, file] of _.pairs(depMap)) {
      let [specPack, specVer] = packVer.split("@");
      if (!newDepMap[specPack]) {
        newDepMap[specPack] = {};
      }
      newDepMap[specPack][specVer] = file;
    }
    depMap = newDepMap;
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
