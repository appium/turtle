import fs from 'fs';
import npm from 'npm';
import B from 'bluebird';
import david from 'david';

const mkdir = B.promisify(fs.mkdir);
const writeFile = B.promisify(fs.writeFile);
const getDependencies = B.promisify(david.getDependencies);
const getUpdatedDependencies = B.promisify(david.getUpdatedDependencies);

async function mkdirp (dir, mode = 0o0744) {
  try {
    await mkdir(dir, mode);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

function loadNpm () {
  return B.promisify(npm.load)({});
}

export { mkdir, mkdirp, writeFile, loadNpm, getDependencies,
         getUpdatedDependencies };

