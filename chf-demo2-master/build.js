// build.js — transforme les modules CommonJS/JSX en un seul bundle.js pour le navigateur.
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['app/AppHospitaliere.js'],
  bundle: true,
  outfile: 'public/bundle.js',
  loader: { '.js': 'jsx' },
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  target: ['es2018'],
  // React / ReactDOM / Firebase / xlsx / Chart.js / jsPDF sont chargés en CDN (globaux window.*)
  // dans public/index.html : on ne les inclut donc pas dans le bundle.
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('👀 esbuild en mode watch (Ctrl+C pour arrêter)...');
  } else {
    await esbuild.build(options);
    console.log('✅ Bundle généré : public/bundle.js');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
