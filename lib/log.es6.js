import clc from 'cli-color';
clc.grey = clc.xterm(234);

let log = {};
for (let c of ['red', 'yellow', 'green', 'grey']) {
  log[c] = (msg) => console.log(clc[c](msg));
  log[`_${c}`] = clc[c];
}

export { log };
