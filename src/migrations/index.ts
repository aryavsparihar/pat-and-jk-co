import * as migration_20260912_200332_initial from './20260912_200332_initial'
import * as migration_20260918_171527_admin_gate from './20260918_171527_admin_gate'

export const migrations = [
  {
    up: migration_20260912_200332_initial.up,
    down: migration_20260912_200332_initial.down,
    name: '20260912_200332_initial',
  },
  {
    up: migration_20260918_171527_admin_gate.up,
    down: migration_20260918_171527_admin_gate.down,
    name: '20260918_171527_admin_gate',
  },
]
