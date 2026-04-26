import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  sourcemap: true,
  minify: !watch,
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: ['webview/index.tsx'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  outfile: 'dist/webview.js',
  format: 'iife',
  sourcemap: true,
  minify: !watch,
};

if (watch) {
  const [extCtx, webCtx] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
  ]);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
  console.log('Build complete.');
}
