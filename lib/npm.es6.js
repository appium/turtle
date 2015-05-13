import path from 'path';
import os from 'os';
import _ from 'lodash';
import { mkdirp, exec, readdir } from './future';
import { log } from './log';

const NPM_TMPDIR = path.resolve(os.tmpdir(), 'turtle', Date.now().toString());

function isMaster (pack, ver) {
  return ver && ver.indexOf('/') > 0;
}

function isLocal (pack, ver) {
  return ver && ver.indexOf('/') === 0;
}

async function readNodeModules (root) {
  let nodeModules = path.resolve(root, "node_modules");
  let submoduleNames;
  try {
    submoduleNames = await readdir(nodeModules);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return [];
  }
  submoduleNames = submoduleNames.filter(s => s[0] !== '.');
  return submoduleNames.map(s => {
    return {
      name: s,
      path: path.resolve(nodeModules, s),
      version: require(path.resolve(nodeModules, s, "package.json")).version
    };
  });
}

async function readDeps (root) {
  let depMap = {};
  let submodules = await readNodeModules(root);
  for (let s of submodules) {
    depMap[`${s.name}@${s.version}`] = s.path;
    depMap = Object.assign(depMap, await readDeps(s.path));
  }
  return depMap;
}

async function npmInstall (root, pack, ver, dev, restrictTo) {
  let packName = pack;
  if (isMaster(pack, ver)) {
    // we have a github master version, so run the command based on the
    // github repo, and omit version since we want master
    pack = ver;
    ver = null;
  }
  let cmd = `npm install ${pack}`;
  if (ver) {
    cmd += `@${ver}`;
  }
  //cmd += ' .';
  log.grey(`Installing using NPM command: ${cmd} (in: ${root})`);
  await exec(cmd, {cwd: root, env: process.env});

  if (dev) {
    await npmInstallAllDeps(path.resolve(root, "node_modules", packName), restrictTo);
  }
}

async function npmInstallAllDeps (root, restrictTo, submodulesExamined = []) {
  let packName = _.last(root.split('/'));
  if (!_.contains(restrictTo, packName)) {
    log.grey(`Not getting all deps for ${packName} because it's not in restrictions`);
    return;
  }
  let cmd = "npm install .";
  log.grey(`Installing all deps using NPM command: ${cmd} (in: ${root})`);
  try {
    await exec(cmd, {cwd: root, env: process.env});
  } catch (e) {
    log.grey("Warning, npm install did not complete successfully");
  }
  let submodules = await readNodeModules(root);
  for (let s of submodules) {
    if (_.contains(submodulesExamined, `${s.name}@${s.version}`)) {
      log.grey(`Already installed deps for ${s.name}@${s.version}, skipping`);
      continue;
    }
    submodulesExamined.push(`${s.name}@${s.version}`);
    await npmInstallAllDeps(s.path, restrictTo, submodulesExamined);
  }
}

async function manifestForPackage (pack, ver, dev, restrictTo) {
  await mkdirp(NPM_TMPDIR);
  let manifestJson;
  if (isLocal(pack, ver)) {
    manifestJson = path.resolve(ver, "package.json");
  } else {
    await npmInstall(NPM_TMPDIR, pack, ver, dev, restrictTo);
    manifestJson = path.resolve(NPM_TMPDIR, "node_modules", pack, "package.json");
  }
  return require(manifestJson);
}

export { readDeps, npmInstall, manifestForPackage, NPM_TMPDIR, isMaster, isLocal };
