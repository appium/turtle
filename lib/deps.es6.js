import path from 'path';
import os from 'os';
import B from 'bluebird';
import { loadNpm, mkdirp, getUpdatedDependencies } from './future';

const NPM_TMPDIR = path.resolve(os.tmpdir(), 'turtle');

async function manifestForPackage (pack, ver = null) {
  let npm = await loadNpm();
  await mkdirp(NPM_TMPDIR);
  npm.prefix = NPM_TMPDIR;
  let cmd = pack + (ver ? `@${ver}` : '');
  await B.promisify(npm.commands.install)([cmd]);
  let manifest = path.resolve(NPM_TMPDIR, "node_modules", pack, "package.json");
  return require(manifest);
}

async function depsForPackage (pack, ver, db) {
  console.log(`Getting deps for ${pack}@${ver ? ver : 'latest'}`);
  if (pack && ver && db[pack] && db[pack][ver]) {
    console.log("Found in cache db");
    return [db[pack][ver], db];
  } else if (!ver) {
    console.log("No version, getting manifest");
  }
  let deps = {}, devDeps = {};
  let manifest = await manifestForPackage(pack, ver);
  if (db[pack] && db[pack][manifest.version]) {
    console.log("Found in cache db");
    return [db[pack][manifest.version], db];
  }
  console.log("Getting deps via david");
  deps = await getUpdatedDependencies(manifest);
  devDeps = await getUpdatedDependencies(manifest, {dev: true});
  deps = Object.assign(deps, devDeps);
  if (!db[pack]) {
    db[pack] = {};
  }
  if (!db[pack][manifest.version]) {
    console.log("Setting deps in cache");
    db[pack][manifest.version] = deps;
  }
  return [deps, db];
}

export { depsForPackage };
