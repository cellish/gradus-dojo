// node test/baseline/generate.js — 判定の記録 test/baseline/record.json を作り直す(判定を意図して変えたときだけ)
'use strict';
const fs = require('fs');
const path = require('path');
const rec = require('./run.js').record();
fs.writeFileSync(path.join(__dirname, 'record.json'), JSON.stringify(rec) + '\n');
console.log(Object.entries(rec).map(([k, v]) => `${k} ${v.length}`).join(', '));
