import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {writeFileSync, readFileSync, rmSync, copyFileSync} from 'node:fs';
import {join} from 'node:path';

const base = fileURLToPath(new URL('../', import.meta.url));
const src = join(base, 'src');
const outdir = join(base, 'dist');

rmSync(outdir, {recursive: true});
await esbuild(true);
await esbuild(false);

async function esbuild(esm) {
	const jsExtension = esm ? '.mjs' : '.cjs';
	const typeExtension = `.d.${esm ? 'm' : 'c'}ts`;
	const outExtension = {'.js': jsExtension};
	const format = esm ? 'esm' : 'cjs';
	await build({
		bundle: true,
		entryPoints: [join(src, 'index.js')],
		//external: ['ethers', 'node:*'],
		packages: 'external',
		format,
		outExtension,
		outdir,
	});
	await build({
		bundle: true,
		entryPoints: [join(src, 'serve.js')],
		external: ['*'],
		format,
		outExtension,
		outdir,
	});
	for (let types of ['index', 'serve']) {
		fix_js_ext(join(outdir, types + jsExtension), jsExtension);
		const typesFile = join(outdir, types + typeExtension);
		copyFileSync(join(base, 'build', `${types}.d.ts`), typesFile);
		fix_js_ext(typesFile, jsExtension);
	}
}

function fix_js_ext(file, ext) {
	let code0 = readFileSync(file, {encoding: 'utf8'});
	// this is total dogshit
	let code1 = code0.replaceAll(/\.js(['"];)/g, (_, x) => ext + x);
	if (code0 !== code1) {
		writeFileSync(file, code1);
		console.log(`Fixed Extensions: ${file}`);
	}
}
