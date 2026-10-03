import type { Reporter, TestModule } from 'vitest/node'

/**
 * In CI, a skipped test is a failure. A test can be skipped by `.skip` or `.todo`, by `skipIf`,
 * or because its file's setup failed (Vitest then skips every test in the file), and a run with
 * skipped tests can look green at a glance. This names each one and fails the run.
 *
 * Locally it stays quiet, so `vitest -t "…"` can still run a few tests on purpose.
 */
export default class NoSkippedTests implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    if (!process.env.CI) return
    const skipped: string[] = []
    for (const testModule of testModules) {
      for (const test of testModule.children.allTests()) {
        const state = test.result().state
        if (state === 'skipped' || state === 'pending') {
          skipped.push(`${testModule.moduleId.replace(process.cwd(), '.')} › ${test.fullName}`)
        }
      }
    }
    if (skipped.length === 0) return
    console.error(
      `\n✕ ${skipped.length} test(s) did not run. In CI every test must run:\n` +
        skipped.map((s) => `  - ${s}`).join('\n') +
        '\n',
    )
    process.exitCode = 1
  }
}
