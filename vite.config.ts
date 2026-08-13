import { execSync } from 'node:child_process'
import path from 'path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Stamps the built HTML with the commit it was built from, so "is this deploy
 * actually my change?" is answerable with
 *
 *   curl -s https://…pages.dev | grep build-commit
 *
 * rather than inferred from behaviour. This exists because a preview and
 * production were indistinguishable over HTTP — both served the scaffold's
 * title and nothing else identifying the build — so a deploy that had not
 * finished looked exactly like one that had.
 *
 * Cloudflare Pages sets CF_PAGES_* during its own build and is trusted first;
 * a local build falls back to git. `-dirty` marks uncommitted *tracked* changes
 * so a local stamp never claims to be a clean commit it isn't — untracked files
 * are ignored on purpose, since `docs/` is permanently untracked here by design
 * and would otherwise mark every local build dirty.
 */
function buildStamp(): { commit: string; branch: string } {
  const git = (args: string) => {
    try {
      return execSync(`git ${args}`, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return ''
    }
  }

  const ciCommit = process.env.CF_PAGES_COMMIT_SHA
  const commit = ciCommit || git('rev-parse HEAD')
  const dirty = !ciCommit && git('status --porcelain --untracked-files=no') !== ''

  return {
    commit: commit ? commit.slice(0, 7) + (dirty ? '-dirty' : '') : 'unknown',
    branch: process.env.CF_PAGES_BRANCH || git('rev-parse --abbrev-ref HEAD') || 'unknown',
  }
}

/**
 * Resolved per transform rather than once at config load: this config is also
 * what vitest loads, and shelling out to git on every test run would be paid
 * for by every test, not by the one build that needs it.
 */
function buildStampPlugin(): Plugin {
  return {
    name: 'build-stamp',
    transformIndexHtml() {
      const { commit, branch } = buildStamp()
      return [
        { tag: 'meta', attrs: { name: 'build-commit', content: commit }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'build-branch', content: branch }, injectTo: 'head' },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), buildStampPlugin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
