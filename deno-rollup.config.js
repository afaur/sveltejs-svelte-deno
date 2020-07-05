import fs from 'fs';
import path from 'path';
import replace from '@rollup/plugin-replace';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import sucrase from '@rollup/plugin-sucrase';
import typescript from '@rollup/plugin-typescript';
import pkg from './package.json';

const is_publish = !!process.env.PUBLISH;

const ts_plugin = is_publish
  ? typescript({
    include: 'src/**',
    typescript: require('typescript')
  })
  : sucrase({
    transforms: ['typescript']
  });

const external = id => id.startsWith('svelte/');

fs.writeFileSync(`./compiler.d.ts`, `export { compile, parse, preprocess, VERSION } from './types/compiler/index';`);

export default [
  /* runtime */
  {
    input: `src/runtime/index.ts`,
    output: [
      {
        file: `index.mjs`,
        format: 'esm',
        paths: id => id.startsWith('svelte/') && `${id.replace('svelte', '.')}`
      },
      {
        file: `index.js`,
        format: 'cjs',
        paths: id => id.startsWith('svelte/') && `${id.replace('svelte', '.')}`
      }
    ],
    external,
    plugins: [ts_plugin]
  },

  ...fs.readdirSync('src/runtime')
    .filter(dir => fs.statSync(`src/runtime/${dir}`).isDirectory())
    .map(dir => ({
      input: `src/runtime/${dir}/index.ts`,
      output: [
        {
          file: `${dir}/index.mjs`,
          format: 'esm',
          paths: id => id.startsWith('svelte/') && `${id.replace('svelte', '.')}`
        },
        {
          file: `${dir}/index.js`,
          format: 'cjs',
          paths: id => id.startsWith('svelte/') && `${id.replace('svelte', '.')}`
        }
      ],
      external,
      plugins: [
        replace({
          __VERSION__: pkg.version
        }),
        ts_plugin,
        {
          writeBundle(bundle) {
            if (dir === 'internal') {
              const mod = bundle['index.mjs'];
              if (mod) {
                fs.writeFileSync('src/compiler/compile/internal_exports.ts', `// This file is automatically generated\nexport default new Set(${JSON.stringify(mod.exports)});`);
              }
            } else {
              const mod = bundle['index.mjs']
              if (mod) {
                mod.code = mod.code.replace(/\.\/easing/g, `https://rawcdn.githack.com/afaur/sveltejs-svelte-deno/c43aefd723352fd7406dd12546a744d3a7d99f3a/easing/index.mjs`)
                mod.code = mod.code.replace(/\.\/internal/g, `https://rawcdn.githack.com/afaur/sveltejs-svelte-deno/c43aefd723352fd7406dd12546a744d3a7d99f3a/internal/index.mjs`)
                mod.code = mod.code.replace(/\.\/store/g, `https://rawcdn.githack.com/afaur/sveltejs-svelte-deno/c43aefd723352fd7406dd12546a744d3a7d99f3a/store/index.mjs`)
                fs.writeFileSync(path.resolve(dir, mod.fileName), mod.code)
              }
            }

            fs.writeFileSync(`${dir}/package.json`, JSON.stringify({
              main: './index',
              module: './index.mjs',
              types: './index.d.ts'
            }, null, '  '));

            fs.writeFileSync(`${dir}/index.d.ts`, `export * from '../types/runtime/${dir}/index';`);
          }
        }
      ]
    })),

  /* compiler.js */
  {
    input: 'src/compiler/index.ts',
    plugins: [
      replace({
        __VERSION__: pkg.version
      }),
      resolve(),
      commonjs({
        include: ['node_modules/**']
      }),
      json(),
      ts_plugin
    ],
    output: {
      file: 'compiler.mjs',
      // Use esm format since deno supports this.
      format: 'esm',
      name: 'svelte',
      sourcemap: true,
    },
    // Bundle everything as this needs to be ready for deno to consume.
    external: []
  }
];
