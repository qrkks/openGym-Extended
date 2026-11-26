#!/usr/bin/env node
/* Run after `npm run build:mobile`'s `cap sync`: is what went into the native shells the phone
 * build, whole?
 *
 * A web `vite build` that runs into the same dist/ between the mobile build and `cap sync` (two
 * builds in one worktree) leaves the web index.html beside the mobile chunks, and the APK then
 * opens the web app: no Android-only settings, a service worker, the passkey login screen. Each
 * copy is checked for
 *   - the flavour tag the mobile build writes into index.html (vite.config.js, `opengym-flavor`),
 *   - every script and stylesheet index.html loads, present beside it,
 *   - a stamped service worker (no `__BUILD__` left in sw.js),
 *   - every exercise still and animation the bundle asks for, by name (check-app-media.mjs, #962).
 *
 * Usage: node scripts/check-mobile-bundle.mjs [--android | frontend dir] — exit code 1 on any problem. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkAppMedia, loadCatalogue } from './check-app-media.mjs'

const COPIES = [
  'dist',
  'android/app/src/main/assets/public',
  'ios/App/App/public',
]

export function checkCopy(dir, label = dir) {
  const problems = []
  const html = join(dir, 'index.html')
  if (!existsSync(html)) return [`${label}: no index.html`]
  const text = readFileSync(html, 'utf8')
  if (!/<meta\s+name="opengym-flavor"\s+content="mobile"/.test(text))
    problems.push(`${label}/index.html is not the mobile build (no opengym-flavor meta) — another build ran into dist/?`)
  for (const [, ref] of text.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.(?:js|css))"/g))
    if (!existsSync(join(dir, ref))) problems.push(`${label}/index.html loads ${ref}, which is missing`)
  const sw = join(dir, 'sw.js')
  if (existsSync(sw) && readFileSync(sw, 'utf8').includes('__BUILD__'))
    problems.push(`${label}/sw.js is not stamped (__BUILD__ left in it)`)
  return problems
}

function mobileCopies(root) {
  return COPIES.filter((dir, i) => i === 0 || existsSync(join(root, dir)))
}

export function checkMobileBundle(root, copies = mobileCopies(root)) {
  return copies.flatMap(dir => checkCopy(join(root, dir), dir))
}

/** The exercise media of every copy, against the catalogue (check-app-media.mjs). */
export function checkMobileMedia(root, exdb, copies = mobileCopies(root)) {
  return copies.map(dir => join(root, dir)).filter(existsSync).flatMap(dir => checkAppMedia(dir, exdb))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const androidOnly = process.argv[2] === '--android'
  const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
  const root = resolve(androidOnly ? frontend : process.argv[2] || frontend)
  const copies = androidOnly ? COPIES.slice(0, 2) : mobileCopies(root)
  const problems = checkMobileBundle(root, copies)
  if (!problems.length) problems.push(...checkMobileMedia(root, await loadCatalogue(), copies))
  if (problems.length) {
    for (const p of problems) console.error('✗ ' + p)
    process.exit(1)
  }
  console.log('Mobile bundle OK in ' + copies.join(', ') + '.')
}
