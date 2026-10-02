/**
 * For maintenance scripts run with `payload run` (plain Node, outside Next.js). The KYC modules
 * start with `import 'server-only'`, which Next.js uses to stop them ever reaching the browser
 * bundle; under plain Node that import has nothing to resolve to. These scripts only ever run on
 * a trusted machine, so here it resolves to an empty module.
 */
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export%20{}', format: 'module', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
