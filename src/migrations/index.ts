import * as migration_20260912_200332_initial from './20260912_200332_initial'

export const migrations = [
  {
    up: migration_20260912_200332_initial.up,
    down: migration_20260912_200332_initial.down,
    name: '20260912_200332_initial',
  },
]
