import * as migration_20260912_200332_initial from './20260912_200332_initial';
import * as migration_20260918_171527_admin_gate from './20260918_171527_admin_gate';
import * as migration_20260918_223130_add_technical_email from './20260918_223130_add_technical_email';
import * as migration_20260919_131846_add_business_email from './20260919_131846_add_business_email';
import * as migration_20260924_185422_add_visitor_count from './20260924_185422_add_visitor_count';
import * as migration_20260924_194443_add_venture_opening from './20260924_194443_add_venture_opening';
import * as migration_20260924_201500_phulhaar_mark_and_opening from './20260924_201500_phulhaar_mark_and_opening';
import * as migration_20261002_155740_add_rate_limits from './20261002_155740_add_rate_limits';
import * as migration_20261002_162508_add_office_address from './20261002_162508_add_office_address';
import * as migration_20261002_162600_fill_office_address from './20261002_162600_fill_office_address';
import * as migration_20261002_174436_members_and_applications from './20261002_174436_members_and_applications';
import * as migration_20261002_181529_application_forms from './20261002_181529_application_forms';
import * as migration_20261002_182949_paths_block from './20261002_182949_paths_block';
import * as migration_20261002_183507_applications_switch from './20261002_183507_applications_switch';
import * as migration_20261002_191825_kyc from './20261002_191825_kyc';
import * as migration_20261003_063513_storage_prefix from './20261003_063513_storage_prefix';
import * as migration_20261003_065247_kyc_legal_hold_event from './20261003_065247_kyc_legal_hold_event';
import * as migration_20261003_065900_kyc_aadhaar_optional from './20261003_065900_kyc_aadhaar_optional';
import * as migration_20261003_072617_kyc_identity_choice from './20261003_072617_kyc_identity_choice';
import * as migration_20261003_074020_member_portal from './20261003_074020_member_portal';
import * as migration_20261004_090000_collaborate_ways_in from './20261004_090000_collaborate_ways_in';
import * as migration_20261004_100000_payload_3_90 from './20261004_100000_payload_3_90';
import * as migration_20261006_121931_payout_details_on_sale from './20261006_121931_payout_details_on_sale';
import * as migration_20261006_153522_venture_theme from './20261006_153522_venture_theme';
import * as migration_20261006_153600_phulhaar_venture_theme from './20261006_153600_phulhaar_venture_theme';

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
    up: migration_20261002_174436_members_and_applications.up,
    down: migration_20261002_174436_members_and_applications.down,
    name: '20261002_174436_members_and_applications',
  },
  {
    up: migration_20261002_181529_application_forms.up,
    down: migration_20261002_181529_application_forms.down,
    name: '20261002_181529_application_forms',
  },
  {
    up: migration_20261002_182949_paths_block.up,
    down: migration_20261002_182949_paths_block.down,
    name: '20261002_182949_paths_block',
  },
  {
    up: migration_20261002_183507_applications_switch.up,
    down: migration_20261002_183507_applications_switch.down,
    name: '20261002_183507_applications_switch',
  },
  {
    up: migration_20261002_191825_kyc.up,
    down: migration_20261002_191825_kyc.down,
    name: '20261002_191825_kyc',
  },
  {
    up: migration_20261003_063513_storage_prefix.up,
    down: migration_20261003_063513_storage_prefix.down,
    name: '20261003_063513_storage_prefix',
  },
  {
    up: migration_20261003_065247_kyc_legal_hold_event.up,
    down: migration_20261003_065247_kyc_legal_hold_event.down,
    name: '20261003_065247_kyc_legal_hold_event',
  },
  {
    up: migration_20261003_065900_kyc_aadhaar_optional.up,
    down: migration_20261003_065900_kyc_aadhaar_optional.down,
    name: '20261003_065900_kyc_aadhaar_optional',
  },
  {
    up: migration_20261003_072617_kyc_identity_choice.up,
    down: migration_20261003_072617_kyc_identity_choice.down,
    name: '20261003_072617_kyc_identity_choice',
  },
  {
    up: migration_20261003_074020_member_portal.up,
    down: migration_20261003_074020_member_portal.down,
    name: '20261003_074020_member_portal',
  },
  {
    up: migration_20261004_090000_collaborate_ways_in.up,
    down: migration_20261004_090000_collaborate_ways_in.down,
    name: '20261004_090000_collaborate_ways_in',
  },
  {
    up: migration_20261004_100000_payload_3_90.up,
    down: migration_20261004_100000_payload_3_90.down,
    name: '20261004_100000_payload_3_90',
  },
  {
    up: migration_20261006_121931_payout_details_on_sale.up,
    down: migration_20261006_121931_payout_details_on_sale.down,
    name: '20261006_121931_payout_details_on_sale',
  },
  {
    up: migration_20261006_153522_venture_theme.up,
    down: migration_20261006_153522_venture_theme.down,
    name: '20261006_153522_venture_theme',
  },
  {
    up: migration_20261006_153600_phulhaar_venture_theme.up,
    down: migration_20261006_153600_phulhaar_venture_theme.down,
    name: '20261006_153600_phulhaar_venture_theme',
  },
];
