const fs = require('node:fs');
const path = require('node:path');

const PATCH_MARKER = '// PhotoSync: defer initial linking state updates until commit.';

function replaceOnce(source, from, to) {
  if (!source.includes(from) || source.indexOf(from) !== source.lastIndexOf(from)) {
    throw new Error('Expo Router linking code changed. Review the lifecycle patch before installing.');
  }
  return source.replace(from, to);
}

function patchNativeLinking(source) {
  if (source.includes(PATCH_MARKER)) return source;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  let result = source.replace(/\r\n/g, '\n');
  result = replaceOnce(result,
    '    const independent = (0, native_1.useNavigationIndependentTree)();',
    `    const independent = (0, native_1.useNavigationIndependentTree)();
    ${PATCH_MARKER}
    const initialLinkMounted = (0, react_1.useRef)(false);
    const queuedInitialLink = (0, react_1.useRef)(undefined);
    const reportInitialLink = (0, react_1.useCallback)((path) => {
        queuedInitialLink.current = path;
        if (initialLinkMounted.current) {
            queuedInitialLink.current = undefined;
            onUnhandledLinking(path);
        }
    }, [onUnhandledLinking]);
    (0, react_1.useEffect)(() => {
        initialLinkMounted.current = true;
        if (queuedInitialLink.current !== undefined) {
            const path = queuedInitialLink.current;
            queuedInitialLink.current = undefined;
            onUnhandledLinking(path);
        }
        return () => { initialLinkMounted.current = false; };
    }, [onUnhandledLinking]);`);
  // Only change the initial URL path. Live link subscription handling stays intact.
  const start = result.indexOf('    const getInitialState =');
  const end = result.indexOf('    (0, react_1.useEffect)(() => {', start);
  if (start < 0 || end < 0) throw new Error('Could not locate Expo Router initial linking handler.');
  let initialHandler = result.slice(start, end);
  const callback = 'onUnhandledLinking((0, extractPathFromURL_1.extractExpoPathFromURL)(prefixes, url));';
  if (initialHandler.split(callback).length !== 3) {
    throw new Error('Expo Router initial URL callbacks changed. Review the lifecycle patch.');
  }
  initialHandler = initialHandler.replaceAll(callback,
    'reportInitialLink((0, extractPathFromURL_1.extractExpoPathFromURL)(prefixes, url));');
  initialHandler = replaceOnce(initialHandler,
    '[getStateFromURL, onUnhandledLinking, prefixes]', '[getStateFromURL, reportInitialLink, prefixes]');
  result = result.slice(0, start) + initialHandler + result.slice(end);
  return result.replace(/\n/g, eol);
}

function applyPatch() {
  const packageRoot = path.dirname(require.resolve('expo-router/package.json'));
  const { version } = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (!version.startsWith('57.')) {
    console.log(`Expo Router ${version}: SDK 57 linking patch skipped; review on SDK migration.`);
    return;
  }
  const target = path.join(packageRoot, 'build/fork/useLinking.native.js');
  const original = fs.readFileSync(target, 'utf8');
  const patched = patchNativeLinking(original);
  if (patched !== original) fs.writeFileSync(target, patched);
  console.log(`Expo Router ${version}: initial linking lifecycle guard applied.`);
}

module.exports = { patchNativeLinking };
if (require.main === module) applyPatch();
