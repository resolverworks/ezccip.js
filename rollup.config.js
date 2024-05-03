import {defineConfig} from 'rollup';

export default defineConfig([
	{
		input: './src/index.js',
		output: [
			{
				file: './dist/index.mjs',
				format: 'es',
				sourcemap: true
			},
			{
				file: './dist/index.cjs',
				format: 'cjs',
				sourcemap: true
			},
		],
		external: /^(@|node:|ethers)/
	}
]);
