import type { IndianState } from './india'

/**
 * Roughly the middle of each state and union territory, where the map opens before anyone has
 * placed a pin. Only a starting view: nothing here is stored.
 */
export const STATE_CENTRES: Record<string, [number, number]> = {
  'Andhra Pradesh': [15.9, 79.7],
  'Arunachal Pradesh': [28.2, 94.7],
  Assam: [26.2, 92.9],
  Bihar: [25.6, 85.6],
  Chhattisgarh: [21.3, 81.9],
  Goa: [15.4, 74.0],
  Gujarat: [22.6, 71.6],
  Haryana: [29.1, 76.1],
  'Himachal Pradesh': [31.9, 77.2],
  Jharkhand: [23.6, 85.3],
  Karnataka: [15.3, 75.7],
  Kerala: [10.4, 76.4],
  'Madhya Pradesh': [23.5, 78.5],
  Maharashtra: [19.4, 76.0],
  Manipur: [24.7, 93.9],
  Meghalaya: [25.5, 91.4],
  Mizoram: [23.2, 92.8],
  Nagaland: [26.1, 94.5],
  Odisha: [20.5, 84.4],
  Punjab: [30.9, 75.4],
  Rajasthan: [26.6, 73.8],
  Sikkim: [27.5, 88.5],
  'Tamil Nadu': [11.1, 78.7],
  Telangana: [17.9, 79.0],
  Tripura: [23.7, 91.7],
  'Uttar Pradesh': [26.8, 80.9],
  Uttarakhand: [30.1, 79.1],
  'West Bengal': [23.0, 87.9],
  'Andaman and Nicobar Islands': [11.7, 92.7],
  Chandigarh: [30.73, 76.78],
  'Dadra and Nagar Haveli and Daman and Diu': [20.4, 72.9],
  Delhi: [28.65, 77.2],
  'Jammu and Kashmir': [33.5, 75.0],
  Ladakh: [34.2, 77.6],
  Lakshadweep: [10.6, 72.6],
  Puducherry: [11.94, 79.8],
} satisfies Record<IndianState, [number, number]>
