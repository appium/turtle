import path from 'path';
import os from 'os';
import { mkdirp, exec, readdir } from './future';

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

async function manifestForPackage (pack, ver) {
  await mkdirp(NPM_TMPDIR);
  await npmInstall(NPM_TMPDIR, pack, ver);
  let manifestJson = path.resolve(NPM_TMPDIR, "node_modules", pack, "package.json");
  return require(manifestJson);
}

export { readDeps, npmInstall, manifestForPackage, NPM_TMPDIR };
