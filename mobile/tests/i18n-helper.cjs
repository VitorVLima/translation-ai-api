const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, dependencies = {}) {
  const file = path.resolve(__dirname, relativePath);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const execute = vm.runInNewContext(`(function(require, module, exports) {${output}\n})`, {}, { filename: file });
  execute((request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

const { translations } = load('../src/i18n/translations.ts');
module.exports = load('../src/i18n/translate.ts', { './translations': { translations } });
