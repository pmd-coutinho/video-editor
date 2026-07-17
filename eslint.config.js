import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.output',
      'dist',
      'node_modules',
      'playwright-report',
      'src/routeTree.gen.ts',
      'test-results',
    ],
  },
  tseslint.configs.recommended,
)
