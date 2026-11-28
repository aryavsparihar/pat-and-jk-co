/**
 * Countries, Indian states and union territories, address rules and dial codes for every form
 * on pjk.co.in, from the founder's pjk-country-address-data.json (25 November 2026), unchanged.
 * India comes first in each list, then the rest from A to Z. A country without its own address
 * rule uses ADDRESS_RULE_DEFAULT; a rule whose code is null means the country has no postal codes.
 */

export type AddressRule = {
  /** The postal code's name there, or null where there are none */
  code: string | null
  help?: string
  /** The postal code must be given */
  req?: boolean
  /** The region's name there (State, County, Emirate…), or null where addresses have none */
  region: string | null
  regionReq?: boolean
  /** The region is chosen from a list (India's states and union territories) */
  list?: boolean
  /** The address has a district (India) */
  district?: boolean
}

export const COUNTRIES: readonly string[] = [
  'India',
  'Afghanistan',
  'Åland Islands',
  'Albania',
  'Algeria',
  'American Samoa',
  'Andorra',
  'Angola',
  'Anguilla',
  'Antarctica',
  'Antigua and Barbuda',
  'Argentina',
  'Armenia',
  'Aruba',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bermuda',
  'Bhutan',
  'Bolivia',
  'Bonaire, Sint Eustatius and Saba',
  'Bosnia and Herzegovina',
  'Botswana',
  'Bouvet Island',
  'Brazil',
  'British Indian Ocean Territory',
  'British Virgin Islands',
  'Brunei',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Cayman Islands',
  'Central African Republic',
  'Chad',
  'Chile',
  'China',
  'Christmas Island',
  'Cocos (Keeling) Islands',
  'Colombia',
  'Comoros',
  'Congo',
  'Congo, Democratic Republic of the',
  'Cook Islands',
  'Costa Rica',
  'Côte d’Ivoire',
  'Croatia',
  'Cuba',
  'Curaçao',
  'Cyprus',
  'Czechia',
  'Denmark',
  'Djibouti',
  'Dominica',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Falkland Islands',
  'Faroe Islands',
  'Fiji',
  'Finland',
  'France',
  'French Guiana',
  'French Polynesia',
  'French Southern Territories',
  'Gabon',
  'Gambia',
  'Georgia',
  'Germany',
  'Ghana',
  'Gibraltar',
  'Greece',
  'Greenland',
  'Grenada',
  'Guadeloupe',
  'Guam',
  'Guatemala',
  'Guernsey',
  'Guinea',
  'Guinea-Bissau',
  'Guyana',
  'Haiti',
  'Heard Island and McDonald Islands',
  'Holy See',
  'Honduras',
  'Hong Kong',
  'Hungary',
  'Iceland',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Isle of Man',
  'Israel',
  'Italy',
  'Jamaica',
  'Japan',
  'Jersey',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kiribati',
  'Kosovo',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Macao',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Marshall Islands',
  'Martinique',
  'Mauritania',
  'Mauritius',
  'Mayotte',
  'Mexico',
  'Micronesia',
  'Moldova',
  'Monaco',
  'Mongolia',
  'Montenegro',
  'Montserrat',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nauru',
  'Nepal',
  'Netherlands',
  'New Caledonia',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'Niue',
  'Norfolk Island',
  'North Korea',
  'North Macedonia',
  'Northern Mariana Islands',
  'Norway',
  'Oman',
  'Pakistan',
  'Palau',
  'Palestine',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Pitcairn Islands',
  'Poland',
  'Portugal',
  'Puerto Rico',
  'Qatar',
  'Réunion',
  'Romania',
  'Russia',
  'Rwanda',
  'Saint Barthélemy',
  'Saint Helena, Ascension and Tristan da Cunha',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Martin',
  'Saint Pierre and Miquelon',
  'Saint Vincent and the Grenadines',
  'Samoa',
  'San Marino',
  'São Tomé and Príncipe',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Seychelles',
  'Sierra Leone',
  'Singapore',
  'Sint Maarten',
  'Slovakia',
  'Slovenia',
  'Solomon Islands',
  'Somalia',
  'South Africa',
  'South Georgia and the South Sandwich Islands',
  'South Korea',
  'South Sudan',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Suriname',
  'Svalbard and Jan Mayen',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Togo',
  'Tokelau',
  'Tonga',
  'Trinidad and Tobago',
  'Tunisia',
  'Türkiye',
  'Turkmenistan',
  'Turks and Caicos Islands',
  'Tuvalu',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'United States Minor Outlying Islands',
  'United States Virgin Islands',
  'Uruguay',
  'Uzbekistan',
  'Vanuatu',
  'Venezuela',
  'Vietnam',
  'Wallis and Futuna',
  'Western Sahara',
  'Yemen',
  'Zambia',
  'Zimbabwe',
]

export const INDIAN_STATES: readonly string[] = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
]

export const ADDRESS_RULES: Readonly<Record<string, AddressRule>> = {
  India: {
    code: 'PIN code',
    help: 'Six digits. We fill in the town, district and state from it.',
    req: true,
    region: 'State or union territory',
    regionReq: true,
    list: true,
    district: true,
  },
  'United States': {
    code: 'ZIP code',
    help: 'Five digits, or nine with a hyphen: for example, 10001 or 10001-1234.',
    req: true,
    region: 'State',
    regionReq: true,
  },
  'United Kingdom': {
    code: 'Postcode',
    help: 'For example, SW1A 1AA.',
    req: true,
    region: 'County',
    regionReq: false,
  },
  Canada: {
    code: 'Postal code',
    help: 'Six characters: for example, K1A 0B1.',
    req: true,
    region: 'Province or territory',
    regionReq: true,
  },
  Australia: {
    code: 'Postcode',
    help: 'Four digits.',
    req: true,
    region: 'State or territory',
    regionReq: true,
  },
  Ireland: {
    code: 'Eircode',
    help: 'Seven characters: for example, D02 X285.',
    req: true,
    region: 'County',
    regionReq: true,
  },
  Japan: {
    code: 'Postal code',
    help: 'Seven digits: for example, 100-0001.',
    req: true,
    region: 'Prefecture',
    regionReq: true,
  },
  China: {
    code: 'Postal code',
    help: 'Six digits.',
    req: true,
    region: 'Province',
    regionReq: true,
  },
  Italy: {
    code: 'CAP',
    help: 'Five digits.',
    req: true,
    region: 'Province',
    regionReq: true,
  },
  Brazil: {
    code: 'CEP',
    help: 'Eight digits: for example, 01310-100.',
    req: true,
    region: 'State',
    regionReq: true,
  },
  Mexico: {
    code: 'Postal code',
    help: 'Five digits.',
    req: true,
    region: 'State',
    regionReq: true,
  },
  Nepal: {
    code: 'Postal code',
    help: 'Five digits, if you know it.',
    req: false,
    region: 'Province',
    regionReq: false,
  },
  'Sri Lanka': {
    code: 'Postal code',
    help: 'Five digits.',
    req: true,
    region: 'Province',
    regionReq: false,
  },
  Bangladesh: {
    code: 'Postal code',
    help: 'Four digits.',
    req: true,
    region: 'Division',
    regionReq: false,
  },
  Singapore: {
    code: 'Postal code',
    help: 'Six digits.',
    req: true,
    region: null,
  },
  'Hong Kong': {
    code: null,
    region: 'District',
    regionReq: true,
  },
  Macao: {
    code: null,
    region: null,
  },
  'United Arab Emirates': {
    code: null,
    region: 'Emirate',
    regionReq: true,
  },
  Qatar: {
    code: null,
    region: 'Municipality',
    regionReq: false,
  },
  Bahamas: {
    code: null,
    region: 'Island',
    regionReq: false,
  },
  Fiji: {
    code: null,
    region: 'Division',
    regionReq: false,
  },
}

export const ADDRESS_RULE_DEFAULT: AddressRule = {
  code: 'Postal code',
  help: 'As your post office writes it.',
  req: false,
  region: 'State, province or region',
  regionReq: false,
}

export const DIAL_CODES: readonly { country: string; code: string }[] = [
  {
    country: 'India',
    code: '+91',
  },
  {
    country: 'Afghanistan',
    code: '+93',
  },
  {
    country: 'Åland Islands',
    code: '+358',
  },
  {
    country: 'Albania',
    code: '+355',
  },
  {
    country: 'Algeria',
    code: '+213',
  },
  {
    country: 'American Samoa',
    code: '+1',
  },
  {
    country: 'Andorra',
    code: '+376',
  },
  {
    country: 'Angola',
    code: '+244',
  },
  {
    country: 'Anguilla',
    code: '+1',
  },
  {
    country: 'Antigua and Barbuda',
    code: '+1',
  },
  {
    country: 'Argentina',
    code: '+54',
  },
  {
    country: 'Armenia',
    code: '+374',
  },
  {
    country: 'Aruba',
    code: '+297',
  },
  {
    country: 'Australia',
    code: '+61',
  },
  {
    country: 'Austria',
    code: '+43',
  },
  {
    country: 'Azerbaijan',
    code: '+994',
  },
  {
    country: 'Bahamas',
    code: '+1',
  },
  {
    country: 'Bahrain',
    code: '+973',
  },
  {
    country: 'Bangladesh',
    code: '+880',
  },
  {
    country: 'Barbados',
    code: '+1',
  },
  {
    country: 'Belarus',
    code: '+375',
  },
  {
    country: 'Belgium',
    code: '+32',
  },
  {
    country: 'Belize',
    code: '+501',
  },
  {
    country: 'Benin',
    code: '+229',
  },
  {
    country: 'Bermuda',
    code: '+1',
  },
  {
    country: 'Bhutan',
    code: '+975',
  },
  {
    country: 'Bolivia',
    code: '+591',
  },
  {
    country: 'Bonaire, Sint Eustatius and Saba',
    code: '+599',
  },
  {
    country: 'Bosnia and Herzegovina',
    code: '+387',
  },
  {
    country: 'Botswana',
    code: '+267',
  },
  {
    country: 'Brazil',
    code: '+55',
  },
  {
    country: 'British Indian Ocean Territory',
    code: '+246',
  },
  {
    country: 'British Virgin Islands',
    code: '+1',
  },
  {
    country: 'Brunei',
    code: '+673',
  },
  {
    country: 'Bulgaria',
    code: '+359',
  },
  {
    country: 'Burkina Faso',
    code: '+226',
  },
  {
    country: 'Burundi',
    code: '+257',
  },
  {
    country: 'Cabo Verde',
    code: '+238',
  },
  {
    country: 'Cambodia',
    code: '+855',
  },
  {
    country: 'Cameroon',
    code: '+237',
  },
  {
    country: 'Canada',
    code: '+1',
  },
  {
    country: 'Cayman Islands',
    code: '+1',
  },
  {
    country: 'Central African Republic',
    code: '+236',
  },
  {
    country: 'Chad',
    code: '+235',
  },
  {
    country: 'Chile',
    code: '+56',
  },
  {
    country: 'China',
    code: '+86',
  },
  {
    country: 'Christmas Island',
    code: '+61',
  },
  {
    country: 'Cocos (Keeling) Islands',
    code: '+61',
  },
  {
    country: 'Colombia',
    code: '+57',
  },
  {
    country: 'Comoros',
    code: '+269',
  },
  {
    country: 'Congo',
    code: '+242',
  },
  {
    country: 'Congo, Democratic Republic of the',
    code: '+243',
  },
  {
    country: 'Cook Islands',
    code: '+682',
  },
  {
    country: 'Costa Rica',
    code: '+506',
  },
  {
    country: 'Côte d’Ivoire',
    code: '+225',
  },
  {
    country: 'Croatia',
    code: '+385',
  },
  {
    country: 'Cuba',
    code: '+53',
  },
  {
    country: 'Curaçao',
    code: '+599',
  },
  {
    country: 'Cyprus',
    code: '+357',
  },
  {
    country: 'Czechia',
    code: '+420',
  },
  {
    country: 'Denmark',
    code: '+45',
  },
  {
    country: 'Djibouti',
    code: '+253',
  },
  {
    country: 'Dominica',
    code: '+1',
  },
  {
    country: 'Dominican Republic',
    code: '+1',
  },
  {
    country: 'Ecuador',
    code: '+593',
  },
  {
    country: 'Egypt',
    code: '+20',
  },
  {
    country: 'El Salvador',
    code: '+503',
  },
  {
    country: 'Equatorial Guinea',
    code: '+240',
  },
  {
    country: 'Eritrea',
    code: '+291',
  },
  {
    country: 'Estonia',
    code: '+372',
  },
  {
    country: 'Eswatini',
    code: '+268',
  },
  {
    country: 'Ethiopia',
    code: '+251',
  },
  {
    country: 'Falkland Islands',
    code: '+500',
  },
  {
    country: 'Faroe Islands',
    code: '+298',
  },
  {
    country: 'Fiji',
    code: '+679',
  },
  {
    country: 'Finland',
    code: '+358',
  },
  {
    country: 'France',
    code: '+33',
  },
  {
    country: 'French Guiana',
    code: '+594',
  },
  {
    country: 'French Polynesia',
    code: '+689',
  },
  {
    country: 'Gabon',
    code: '+241',
  },
  {
    country: 'Gambia',
    code: '+220',
  },
  {
    country: 'Georgia',
    code: '+995',
  },
  {
    country: 'Germany',
    code: '+49',
  },
  {
    country: 'Ghana',
    code: '+233',
  },
  {
    country: 'Gibraltar',
    code: '+350',
  },
  {
    country: 'Greece',
    code: '+30',
  },
  {
    country: 'Greenland',
    code: '+299',
  },
  {
    country: 'Grenada',
    code: '+1',
  },
  {
    country: 'Guadeloupe',
    code: '+590',
  },
  {
    country: 'Guam',
    code: '+1',
  },
  {
    country: 'Guatemala',
    code: '+502',
  },
  {
    country: 'Guernsey',
    code: '+44',
  },
  {
    country: 'Guinea',
    code: '+224',
  },
  {
    country: 'Guinea-Bissau',
    code: '+245',
  },
  {
    country: 'Guyana',
    code: '+592',
  },
  {
    country: 'Haiti',
    code: '+509',
  },
  {
    country: 'Holy See',
    code: '+39',
  },
  {
    country: 'Honduras',
    code: '+504',
  },
  {
    country: 'Hong Kong',
    code: '+852',
  },
  {
    country: 'Hungary',
    code: '+36',
  },
  {
    country: 'Iceland',
    code: '+354',
  },
  {
    country: 'Indonesia',
    code: '+62',
  },
  {
    country: 'Iran',
    code: '+98',
  },
  {
    country: 'Iraq',
    code: '+964',
  },
  {
    country: 'Ireland',
    code: '+353',
  },
  {
    country: 'Isle of Man',
    code: '+44',
  },
  {
    country: 'Israel',
    code: '+972',
  },
  {
    country: 'Italy',
    code: '+39',
  },
  {
    country: 'Jamaica',
    code: '+1',
  },
  {
    country: 'Japan',
    code: '+81',
  },
  {
    country: 'Jersey',
    code: '+44',
  },
  {
    country: 'Jordan',
    code: '+962',
  },
  {
    country: 'Kazakhstan',
    code: '+7',
  },
  {
    country: 'Kenya',
    code: '+254',
  },
  {
    country: 'Kiribati',
    code: '+686',
  },
  {
    country: 'Kosovo',
    code: '+383',
  },
  {
    country: 'Kuwait',
    code: '+965',
  },
  {
    country: 'Kyrgyzstan',
    code: '+996',
  },
  {
    country: 'Laos',
    code: '+856',
  },
  {
    country: 'Latvia',
    code: '+371',
  },
  {
    country: 'Lebanon',
    code: '+961',
  },
  {
    country: 'Lesotho',
    code: '+266',
  },
  {
    country: 'Liberia',
    code: '+231',
  },
  {
    country: 'Libya',
    code: '+218',
  },
  {
    country: 'Liechtenstein',
    code: '+423',
  },
  {
    country: 'Lithuania',
    code: '+370',
  },
  {
    country: 'Luxembourg',
    code: '+352',
  },
  {
    country: 'Macao',
    code: '+853',
  },
  {
    country: 'Madagascar',
    code: '+261',
  },
  {
    country: 'Malawi',
    code: '+265',
  },
  {
    country: 'Malaysia',
    code: '+60',
  },
  {
    country: 'Maldives',
    code: '+960',
  },
  {
    country: 'Mali',
    code: '+223',
  },
  {
    country: 'Malta',
    code: '+356',
  },
  {
    country: 'Marshall Islands',
    code: '+692',
  },
  {
    country: 'Martinique',
    code: '+596',
  },
  {
    country: 'Mauritania',
    code: '+222',
  },
  {
    country: 'Mauritius',
    code: '+230',
  },
  {
    country: 'Mayotte',
    code: '+262',
  },
  {
    country: 'Mexico',
    code: '+52',
  },
  {
    country: 'Micronesia',
    code: '+691',
  },
  {
    country: 'Moldova',
    code: '+373',
  },
  {
    country: 'Monaco',
    code: '+377',
  },
  {
    country: 'Mongolia',
    code: '+976',
  },
  {
    country: 'Montenegro',
    code: '+382',
  },
  {
    country: 'Montserrat',
    code: '+1',
  },
  {
    country: 'Morocco',
    code: '+212',
  },
  {
    country: 'Mozambique',
    code: '+258',
  },
  {
    country: 'Myanmar',
    code: '+95',
  },
  {
    country: 'Namibia',
    code: '+264',
  },
  {
    country: 'Nauru',
    code: '+674',
  },
  {
    country: 'Nepal',
    code: '+977',
  },
  {
    country: 'Netherlands',
    code: '+31',
  },
  {
    country: 'New Caledonia',
    code: '+687',
  },
  {
    country: 'New Zealand',
    code: '+64',
  },
  {
    country: 'Nicaragua',
    code: '+505',
  },
  {
    country: 'Niger',
    code: '+227',
  },
  {
    country: 'Nigeria',
    code: '+234',
  },
  {
    country: 'Niue',
    code: '+683',
  },
  {
    country: 'Norfolk Island',
    code: '+672',
  },
  {
    country: 'North Korea',
    code: '+850',
  },
  {
    country: 'North Macedonia',
    code: '+389',
  },
  {
    country: 'Northern Mariana Islands',
    code: '+1',
  },
  {
    country: 'Norway',
    code: '+47',
  },
  {
    country: 'Oman',
    code: '+968',
  },
  {
    country: 'Pakistan',
    code: '+92',
  },
  {
    country: 'Palau',
    code: '+680',
  },
  {
    country: 'Palestine',
    code: '+970',
  },
  {
    country: 'Panama',
    code: '+507',
  },
  {
    country: 'Papua New Guinea',
    code: '+675',
  },
  {
    country: 'Paraguay',
    code: '+595',
  },
  {
    country: 'Peru',
    code: '+51',
  },
  {
    country: 'Philippines',
    code: '+63',
  },
  {
    country: 'Poland',
    code: '+48',
  },
  {
    country: 'Portugal',
    code: '+351',
  },
  {
    country: 'Puerto Rico',
    code: '+1',
  },
  {
    country: 'Qatar',
    code: '+974',
  },
  {
    country: 'Réunion',
    code: '+262',
  },
  {
    country: 'Romania',
    code: '+40',
  },
  {
    country: 'Russia',
    code: '+7',
  },
  {
    country: 'Rwanda',
    code: '+250',
  },
  {
    country: 'Saint Barthélemy',
    code: '+590',
  },
  {
    country: 'Saint Helena, Ascension and Tristan da Cunha',
    code: '+290',
  },
  {
    country: 'Saint Kitts and Nevis',
    code: '+1',
  },
  {
    country: 'Saint Lucia',
    code: '+1',
  },
  {
    country: 'Saint Martin',
    code: '+590',
  },
  {
    country: 'Saint Pierre and Miquelon',
    code: '+508',
  },
  {
    country: 'Saint Vincent and the Grenadines',
    code: '+1',
  },
  {
    country: 'Samoa',
    code: '+685',
  },
  {
    country: 'San Marino',
    code: '+378',
  },
  {
    country: 'São Tomé and Príncipe',
    code: '+239',
  },
  {
    country: 'Saudi Arabia',
    code: '+966',
  },
  {
    country: 'Senegal',
    code: '+221',
  },
  {
    country: 'Serbia',
    code: '+381',
  },
  {
    country: 'Seychelles',
    code: '+248',
  },
  {
    country: 'Sierra Leone',
    code: '+232',
  },
  {
    country: 'Singapore',
    code: '+65',
  },
  {
    country: 'Sint Maarten',
    code: '+1',
  },
  {
    country: 'Slovakia',
    code: '+421',
  },
  {
    country: 'Slovenia',
    code: '+386',
  },
  {
    country: 'Solomon Islands',
    code: '+677',
  },
  {
    country: 'Somalia',
    code: '+252',
  },
  {
    country: 'South Africa',
    code: '+27',
  },
  {
    country: 'South Korea',
    code: '+82',
  },
  {
    country: 'South Sudan',
    code: '+211',
  },
  {
    country: 'Spain',
    code: '+34',
  },
  {
    country: 'Sri Lanka',
    code: '+94',
  },
  {
    country: 'Sudan',
    code: '+249',
  },
  {
    country: 'Suriname',
    code: '+597',
  },
  {
    country: 'Svalbard and Jan Mayen',
    code: '+47',
  },
  {
    country: 'Sweden',
    code: '+46',
  },
  {
    country: 'Switzerland',
    code: '+41',
  },
  {
    country: 'Syria',
    code: '+963',
  },
  {
    country: 'Taiwan',
    code: '+886',
  },
  {
    country: 'Tajikistan',
    code: '+992',
  },
  {
    country: 'Tanzania',
    code: '+255',
  },
  {
    country: 'Thailand',
    code: '+66',
  },
  {
    country: 'Timor-Leste',
    code: '+670',
  },
  {
    country: 'Togo',
    code: '+228',
  },
  {
    country: 'Tokelau',
    code: '+690',
  },
  {
    country: 'Tonga',
    code: '+676',
  },
  {
    country: 'Trinidad and Tobago',
    code: '+1',
  },
  {
    country: 'Tunisia',
    code: '+216',
  },
  {
    country: 'Türkiye',
    code: '+90',
  },
  {
    country: 'Turkmenistan',
    code: '+993',
  },
  {
    country: 'Turks and Caicos Islands',
    code: '+1',
  },
  {
    country: 'Tuvalu',
    code: '+688',
  },
  {
    country: 'Uganda',
    code: '+256',
  },
  {
    country: 'Ukraine',
    code: '+380',
  },
  {
    country: 'United Arab Emirates',
    code: '+971',
  },
  {
    country: 'United Kingdom',
    code: '+44',
  },
  {
    country: 'United States',
    code: '+1',
  },
  {
    country: 'United States Virgin Islands',
    code: '+1',
  },
  {
    country: 'Uruguay',
    code: '+598',
  },
  {
    country: 'Uzbekistan',
    code: '+998',
  },
  {
    country: 'Vanuatu',
    code: '+678',
  },
  {
    country: 'Venezuela',
    code: '+58',
  },
  {
    country: 'Vietnam',
    code: '+84',
  },
  {
    country: 'Wallis and Futuna',
    code: '+681',
  },
  {
    country: 'Western Sahara',
    code: '+212',
  },
  {
    country: 'Yemen',
    code: '+967',
  },
  {
    country: 'Zambia',
    code: '+260',
  },
  {
    country: 'Zimbabwe',
    code: '+263',
  },
]

/** Shown in place of the postal code where a country has none; [country] is replaced by its name */
export const NO_POSTAL_CODE_NOTE =
  'Postal codes are not used in [country], so there is nothing to fill in here. Give your building, area and nearest landmark below, and pin your home on the map if you can: it helps a courier most.'
