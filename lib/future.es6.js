import fs from 'fs';
import B from 'bluebird';

const mkdir = B.promisify(fs.mkdir);

export { mkdir };

