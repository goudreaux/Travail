#!/usr/bin/env node
// Snapshots the codebase's size + git history into src/lib/code-stats.json
// at build time. The /admin/developer page reads from this — keeps the
// stats fresh on every deploy without needing filesystem access at runtime
// (Vercel serverless can't reliably walk the repo).

import { execSync } from 'node:child_process'
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function walkLines(dir, exts) {
  let lines = 0
  let files = 0
  if (!existsSync(dir)) return { lines, files }
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      const sub = walkLines(full, exts)
      lines += sub.lines
      files += sub.files
    } else if (exts.some(e => entry.endsWith(e))) {
      const text = readFileSync(full, 'utf8')
      lines += text.split('\n').length
      files++
    }
  }
  return { lines, files }
}

function safe(cmd, fallback = '') {
  try { return execSync(cmd, { cwd: repoRoot, encoding: 'utf8' }).trim() }
  catch { return fallback }
}

const tsAll = walkLines(path.join(repoRoot, 'src'), ['.ts', '.tsx'])
const pages = walkLines(path.join(repoRoot, 'src/app'), ['.tsx']).files
const apiRoutes = walkLines(path.join(repoRoot, 'src/app/api'), ['.ts'])
const components = walkLines(path.join(repoRoot, 'src/components'), ['.tsx'])
const lib = walkLines(path.join(repoRoot, 'src/lib'), ['.ts'])
const migrations = walkLines(path.join(repoRoot, 'supabase/migrations'), ['.sql'])
const css = walkLines(path.join(repoRoot, 'src/app'), ['.css'])

const commits = parseInt(safe('git rev-list --count HEAD', '0'), 10)
const firstCommitISO = safe('git log --reverse --format=%cI | head -1')
const lastCommitISO = safe('git log -1 --format=%cI')
const branch = safe('git rev-parse --abbrev-ref HEAD', 'main')
const lastCommitHash = safe('git rev-parse --short HEAD', '')
const lastCommitMessage = safe('git log -1 --format=%s', '')

const recentCommits = safe('git log -10 --format=%h%x09%cI%x09%s')
  .split('\n')
  .filter(Boolean)
  .map(line => {
    const [hash, iso, ...rest] = line.split('\t')
    return { hash, iso, message: rest.join('\t') }
  })

const totalLines = tsAll.lines + css.lines + migrations.lines

const stats = {
  generatedAt: new Date().toISOString(),
  branch,
  lastCommit: {
    hash: lastCommitHash,
    message: lastCommitMessage,
    iso: lastCommitISO,
  },
  totals: {
    totalLines,
    tsLines: tsAll.lines,
    tsFiles: tsAll.files,
    cssLines: css.lines,
    migrationLines: migrations.lines,
    migrations: migrations.files,
    commits,
    pages,
    apiRoutes: apiRoutes.files,
    apiLines: apiRoutes.lines,
    components: components.files,
    componentLines: components.lines,
    libFiles: lib.files,
    libLines: lib.lines,
  },
  firstCommitISO,
  recentCommits,
}

const outPath = path.join(repoRoot, 'src/lib/code-stats.json')
writeFileSync(outPath, JSON.stringify(stats, null, 2))
console.log(`code-stats: wrote ${outPath} (${totalLines.toLocaleString()} total lines, ${commits} commits)`)
