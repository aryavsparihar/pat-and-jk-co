import * as migration_20260912_200332_initial from './20260912_200332_initial'
import * as migration_20260918_171527_admin_gate from './20260918_171527_admin_gate'
import * as migration_20260918_223130_add_technical_email from './20260918_223130_add_technical_email'
import * as migration_20260919_131846_add_business_email from './20260919_131846_add_business_email'
import * as migration_20260924_185422_add_visitor_count from './20260924_185422_add_visitor_count'
import * as migration_20260924_194443_add_venture_opening from './20260924_194443_add_venture_opening'
import * as migration_20260924_201500_phulhaar_mark_and_opening from './20260924_201500_phulhaar_mark_and_opening'
import * as migration_20261002_155740_add_rate_limits from './20261002_155740_add_rate_limits'
import * as migration_20261002_162508_add_office_address from './20261002_162508_add_office_address'
import * as migration_20261002_162600_fill_office_address from './20261002_162600_fill_office_address'
import * as migration_20261002_171410_members_and_applications from './20261002_171410_members_and_applications'

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
  {
    up: migration_20260918_223130_add_technical_email.up,
    down: migration_20260918_223130_add_technical_email.down,
    name: '20260918_223130_add_technical_email',
  },
  {
    up: migration_20260919_131846_add_business_email.up,
    down: migration_20260919_131846_add_business_email.down,
    name: '20260919_131846_add_business_email',
  },
  {
    up: migration_20260924_185422_add_visitor_count.up,
    down: migration_20260924_185422_add_visitor_count.down,
    name: '20260924_185422_add_visitor_count',
  },
  {
    up: migration_20260924_194443_add_venture_opening.up,
    down: migration_20260924_194443_add_venture_opening.down,
    name: '20260924_194443_add_venture_opening',
  },
  {
    up: migration_20260924_201500_phulhaar_mark_and_opening.up,
    down: migration_20260924_201500_phulhaar_mark_and_opening.down,
    name: '20260924_201500_phulhaar_mark_and_opening',
  },
  {
    up: migration_20261002_155740_add_rate_limits.up,
    down: migration_20261002_155740_add_rate_limits.down,
    name: '20261002_155740_add_rate_limits',
  },
  {
    up: migration_20261002_162508_add_office_address.up,
    down: migration_20261002_162508_add_office_address.down,
    name: '20261002_162508_add_office_address',
  },
  {
    up: migration_20261002_162600_fill_office_address.up,
    down: migration_20261002_162600_fill_office_address.down,
    name: '20261002_162600_fill_office_address',
  },
  {
    up: migration_20261002_171410_members_and_applications.up,
    down: migration_20261002_171410_members_and_applications.down,
    name: '20261002_171410_members_and_applications',
  },
]
