import clc from 'cli-color';

let log = {};
for (let c of ['red', 'yellow', 'green', 'grey']) {
  log[c] = (msg) => console.log(clc[c](msg));
}
log.grey = (msg) => console.log(clc.xterm(234)(msg));

export { log };
