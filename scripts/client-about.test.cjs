const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, imports) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, require: (name) => {
      if (name.startsWith('@/assets/')) return name;
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

function hookHarness() {
  const state = [];
  const reads = [];
  const refreshRef = { current: null };
  let cursor = 0, effect, resume, changed, removals = 0;
  const hook = load('src/hooks/use-client-studio-settings.ts', {
    react: {
      useRef: () => refreshRef,
      useCallback: (callback) => callback,
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
    },
    'expo-router': { useFocusEffect: (callback) => { effect = callback; } },
    'react-native': { AppState: { addEventListener: (_name, callback) => {
      resume = callback; return { remove: () => removals++ };
    } } },
    '@/services/calendar-events': { subscribeToCalendarChanged: (callback) => {
      changed = callback; return () => removals++;
    } },
    '@/services/studio-settings': { getStudioSettings: (options) => new Promise((resolve, reject) => {
      reads.push({ options, resolve, reject });
    }) },
  });
  return {
    reads, render() { cursor = 0; return hook.useClientStudioSettings(); },
    focus: () => effect(), resume: (value) => resume(value),
    changed: (date) => changed(date), removals: () => removals,
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('About fetches actual admin settings on focus and resume, and ignores date-specific slot changes', async () => {
  const h = hookHarness();
  assert.equal(h.render().settings, null);
  const cleanup = h.focus();
  assert.equal(h.reads[0].options.force, true);
  assert.equal(h.reads[0].options.throwOnError, true);
  h.reads[0].resolve({ businessHours: 'Mon-Sat, 9:00 AM - 4:00 PM' });
  await flush();
  assert.equal(h.render().settings.businessHours, 'Mon-Sat, 9:00 AM - 4:00 PM');
  h.resume('background');
  h.changed('2026-10-09');
  assert.equal(h.reads.length, 1);
  h.resume('active');
  h.reads[1].resolve({ businessHours: 'Mon-Sat, 10:00 AM - 5:00 PM' });
  await flush();
  assert.equal(h.render().settings.businessHours, 'Mon-Sat, 10:00 AM - 5:00 PM');
  h.changed();
  assert.equal(h.reads.length, 3);
  cleanup();
  assert.equal(h.removals(), 2);
  h.reads[2].resolve({ businessHours: 'Stale completion' });
  await flush();
  assert.equal(h.render().settings.businessHours, 'Mon-Sat, 10:00 AM - 5:00 PM');
});

test('Failed settings reads stay retryable and older reads cannot replace a newer result', async () => {
  const h = hookHarness();
  h.render();
  let cleanup = h.focus();
  h.reads[0].reject(new Error('Offline'));
  await flush();
  assert.equal(h.render().error, true);
  assert.equal(h.render().settings, null);
  h.render().refresh();
  h.resume('active');
  h.reads[2].resolve({ businessHours: 'Current admin hours' });
  await flush();
  h.reads[1].resolve({ businessHours: 'Older admin hours' });
  await flush();
  assert.equal(h.render().settings.businessHours, 'Current admin hours');
  assert.equal(h.render().error, false);
  cleanup();
});

const jsx = (type, props) => ({ type, props });
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
function about(settings, error = false) {
  const screen = load('src/app/(client)/about.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/hooks/use-bottom-nav-height': { useBottomNavHeight: () => 85 },
    '@/hooks/use-client-nav-scroll': { useClientNavScroll: () => ({}) },
    '@/hooks/use-client-studio-settings': { useClientStudioSettings: () => ({ settings, error, refresh() {} }) },
    'expo-image': { Image: 'Image', ImageBackground: 'ImageBackground' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { View: 'View', ScrollView: 'ScrollView', Text: 'Text', Pressable: 'Pressable', Linking: {} },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) },
    'react-native-svg': {}, '@/styles/about.styles': { aboutStyles: {} },
  });
  return nodes(screen.default());
}

test('About shows the real address in Visit Our Studio and only the saved business hours', () => {
  const tree = about({ businessHours: 'Mon-Sat, 9:00 AM - 4:00 PM' });
  const address = tree.find((node) => node.props?.title === 'Visit Our Studio');
  assert.match(address.props.lines.join(' '), /Lacor Building, Doors 1-3, Sobrecary St/);
  assert.doesNotMatch(address.props.lines.join(' '), /123 Lens/);
  const hours = tree.find((node) => node.props?.title === 'Business Hours');
  assert.equal(hours.props.lines.join('\n'), 'Mon-Sat, 9:00 AM - 4:00 PM');
});

test('Unloaded, missing, and failed business hours never display a fabricated schedule', () => {
  for (const [settings, error, expected] of [
    [null, false, /Loading/], [{ businessHours: '' }, false, /contact the studio/],
    [null, true, /Unable to load/],
  ]) {
    const hours = about(settings, error).find((node) => node.props?.title === 'Business Hours');
    assert.match(hours.props.lines[0], expected);
    assert.equal(typeof hours.props.onPress, error ? 'function' : 'undefined');
  }
});
