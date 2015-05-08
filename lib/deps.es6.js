import path from 'path';
//import B from 'bluebird';
import _ from 'lodash';
import semver from 'semver';
import { getDependencies } from './future';
import { readDeps, manifestForPackage, NPM_TMPDIR } from './npm';

async function getDepMapLocally (packDir) {
  // get the single-level depMap from readDeps, that looks like:
  // {
  //    'package@version1': '/path/to/module/directory',
  //    'package@version2': '/path/to/module/directory',
  // }
  let depMap = await readDeps(packDir);

  // then expand it so it's easier to work with:
  // {
  //    'package': {
  //        'version1': '/path/to/module/directory',
  //        'version2': '/path/to/module/directory',
  //    }
  //  }
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
  // if we have this exact version in the cache, just return it
  if (pack && ver && db[pack] && db[pack][ver]) {
    //console.log(`Found ${pack}@${ver} in cache db`);
    return [_.clone(db[pack][ver]), db];
  } else if (!ver) {
    // if we don't have a version, we at least need to get the manifest
    // from the latest version to see if there's anything in the cache
    //console.log("No version, getting manifest");
  }

  let manifest;
  if (!modulesDir) {
    // if we don't have modulesDir, it means that we are at the top level
    // of checking deps, which means we need to get the package.json from
    // npm
    manifest = await manifestForPackage(pack, ver);
    modulesDir = path.resolve(NPM_TMPDIR, "node_modules");
  } else {
    // if we have modulesDir, it means we recursed into here or otherwise
    // already have a dependency tree on disk that we can explore, so we
    // just directly retrieve the package.json without another npm hit
    manifest = require(path.resolve(modulesDir, pack, "package.json"));
  }
  let submodulesDir = path.resolve(modulesDir, pack, "node_modules");

  // now that we have package.json, we know exactly what version of the
  // module we're looking for, so we can check our cache and return the
  // dependency data directly if it's already there
  if (db[pack] && db[pack][manifest.version]) {
    console.log(`Found ${pack}@${manifest.version} in cache db`);
    return [_.clone(db[pack][manifest.version]), db];
  }

  // now we can get the dependency information using David
  let deps = await getDependencies(manifest);
  let depList = {}, outdated = {}, subDeps = {};
  // for each of the module's deps, classify them according to whether they're
  // outdated, and if so, what they should be upgraded to (latest stable)
  for (let [subPack, info] of _.pairs(deps)) {
    if (!semver.satisfies(info.stable, info.required)) {
      outdated[subPack] = {requirement: info.required, upgrade: info.stable};
    }
    depList[subPack] = info.required;
  }

  //if we already have a dependency map that we've read off the
  // directory structure from the top-level module, we can just use it.
  // Otherwise we need to get it from the directory structure. The reason for
  // this is that naive recursion won't work since npm reuses modules; getting
  // this dependency map means that if we're looking for module@version and
  // don't find it in node_modules, we can look it up using this map since it
  // must have existed somewhere in the directory structure
  if (!depMap) {
    depMap = await getDepMapLocally(path.resolve(modulesDir, pack));
  }

  // now we recurse into each of the dependencies to get _their_ outdated info.
  // the main thing we need for this is the specific version of the subdep
  for (let [dep, req] of _.pairs(depList)) {
    let usedDepVer;
    try {
      // first we try to find the package.json manifest for the dep naively,
      // i.e., in the node_modules dir of the current module
      usedDepVer = require(path.resolve(submodulesDir, dep, "package.json")).version;
    } catch (e) {
      // sometimes this doesn't work (see comment about depMap above), so we
      // look for a semver-satisfying match in the depMap we've built
      console.log(`Could not find package.json for dep ${dep}, looking for suitable one in depMap`);
      let possibleMatches = depMap[dep];
      if (!possibleMatches) {
        // if we don't end up having anything, this is really bad and means
        // the module doesn't work or our code is bad, so we barf out
        throw new Error("Could not find any matching module");
      }
      // otherwise we pick the first match we come across
      for (let [ver, packDir] of _.pairs(possibleMatches)) {
        if (semver.satisfies(ver, req)) {
          usedDepVer = require(path.resolve(packDir, "package.json")).version;
          submodulesDir = path.resolve(packDir, "..");
          break;
        }
      }
    }
    // depsForPackage returns the db but we don't care about it here
    [subDeps[dep],] = await depsForPackage(dep, usedDepVer, db, dev, submodulesDir, depMap);
  }

  // once we have all the dep data for this module, including what we've
  // recursively set above, add it to the cache db so we don't have to do any
  // work with it in the future
  let depData = {deps: depList, outdated, subDeps};
  //console.log(`Setting ${pack}@${manifest.version} in cache with ${_.size(outdated)} outdated deps`);
  if (!db[pack]) {
    db[pack] = {};
  }
  db[pack][manifest.version] = depData;
  return [depData, db];
}

function hasOutdatedPackage (deps) {
  // if the current package we're looking at has outdated deps of its own
  // say so straightaway
  if (_.size(deps.outdated) > 0) {
    return true;
  }
  // otherwise so we have outdated packages if any subdeps that we care
  // about have outdated packages
  for (let data of _.values(deps.subDeps)) {
    if (hasOutdatedPackage(data)) {
      return true;
    }
  }
  return false;
}

function careAboutPackage (pack, subDeps, restrictTo) {
  if (!restrictTo) {
    return true;
  }
  if (_.contains(restrictTo, pack)) {
    return true;
  }
  for (let [subPack, data] of _.pairs(subDeps)) {
    if (careAboutPackage(subPack, data.subDeps, restrictTo)) {
      return true;
    }
  }
  return false;
}

function outdatedPackages (deps, restrictTo) {
  let outdated = null;
  if (hasOutdatedPackage(deps, restrictTo)) {
    outdated = {outdated: {}};
    if (_.size(deps.outdated) > 0) {
      outdated.outdated = deps.outdated;
    }
    outdated.subs = {};
    for (let [pack, data] of _.pairs(deps.subDeps)) {
      if (!careAboutPackage(pack, data.subDeps, restrictTo)) {
        continue;
      } else {
      }
      let subOutdated = outdatedPackages(data, restrictTo);
      if (subOutdated !== null) {
        outdated.subs[pack] = subOutdated;
      }
    }
  }
  return outdated;
}

export { depsForPackage, outdatedPackages };
