// Stand-in for `server-only` in Vitest (vitest.config.ts) and in tsx scripts
// (tsconfig.scripts.json): the real package throws outside React Server
// Components. The Next.js build still resolves the real one.
export {}
