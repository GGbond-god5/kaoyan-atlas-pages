const fs = require('fs');
const path = require('path');
const katex = require(path.join(__dirname, '../../assets/katex/katex.js'));
const root = path.join(__dirname, '../..');
const dirs = ['math', 'english', 'mechanics', 'politics'];
let total = 0;
const errors = [];
function walk(o, file, where) {
  if (typeof o === 'string') {
    const re = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
    let m;
    while ((m = re.exec(o))) {
      const tex = m[1] != null ? m[1] : m[2];
      total++;
      try {
        katex.renderToString(tex, { throwOnError: true, displayMode: m[2] != null });
      } catch (e) {
        errors.push({ file, where, tex: tex.slice(0, 80), msg: e.message.slice(0, 100) });
      }
    }
  } else if (Array.isArray(o)) {
    o.forEach((v, i) => walk(v, file, where + '[' + i + ']'));
  } else if (o && typeof o === 'object') {
    for (const k in o) walk(o[k], file, where + '/' + k);
  }
}
for (const d of dirs) {
  const dir = path.join(root, 'src/chapters', d);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    walk(data, d + '/' + f, '');
  }
}
const bankDir = path.join(root, 'src/bank');
for (const f of fs.readdirSync(bankDir).filter(x => /^imported-.*\.json$/.test(x))) {
  const data = JSON.parse(fs.readFileSync(path.join(bankDir, f), 'utf8'));
  walk(data, 'bank/' + f, '');
}
console.log(JSON.stringify({ total, errors: errors.length, sample: errors }, null, 2));
