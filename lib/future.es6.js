import fs from 'fs';
import npm from 'npm';
import B from 'bluebird';
import david from 'david';
import child_process from 'child_process';

const mkdir = B.promisify(fs.mkdir);
const writeFile = B.promisify(fs.writeFile);
const readdir = B.promisify(fs.readdir);
const getDependencies = B.promisify(david.getDependencies);
const getUpdatedDependencies = B.promisify(david.getUpdatedDependencies);
const exec = B.promisify(child_process.exec);

async function mkdirp (dir, mode = 0o0744) {
  try {
    await mkdir(dir, mode);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

async function rmrf (file) {
  try {
    await B.promisify(fs.unlink)(file);
  } catch (e) {}
}

function loadNpm () {
  return B.promisify(npm.load)({});
}

export { mkdir, mkdirp, writeFile, loadNpm, getDependencies,
         getUpdatedDependencies, rmrf, readdir, exec };

