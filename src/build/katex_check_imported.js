const fs = require('fs');
const path = require('path');
const katex = require(path.join(__dirname, '../../assets/katex/katex.js'));
const file = path.join(__dirname, '../bank/imported-807-2022.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
let total = 0;
const errors = [];
function walk(o, where) {
  if (typeof o === 'string') {
    const re = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
    let m;
    while ((m = re.exec(o))) {
      total++;
      try { katex.renderToString(m[1] != null ? m[1] : m[2], { throwOnError: true }); }
      catch (e) { errors.push({ where, tex: (m[1] || m[2]).slice(0, 70), msg: e.message.slice(0, 80) }); }
    }
  } else if (Array.isArray(o)) o.forEach((v, i) => walk(v, where + '[' + i + ']'));
  else if (o && typeof o === 'object') for (const k in o) walk(o[k], where + '/' + k);
}
walk(data, '');
console.log(JSON.stringify({ total, errors: errors.length, sample: errors.slice(0, 8) }, null, 2));
