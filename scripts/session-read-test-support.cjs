const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, ...globals, require(name) {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

function sharedReadImports(supabase, accountId = 'test-account') {
  if (supabase) {
    supabase.auth ??= {};
    supabase.auth.onAuthStateChange ??= () => ({ data: { subscription: { unsubscribe() {} } } });
    supabase.auth.getSession ??= async () => ({ data: { session: accountId ? { user: { id: accountId } } : null }, error: null });
  }
  return {
    '@/services/session-read-cache': loadSource('src/services/session-read-cache.ts'),
    '@/services/auth-session-scope': loadSource('src/services/auth-session-scope.ts'),
  };
}

module.exports = { loadSource, sharedReadImports };
