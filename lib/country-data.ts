// ─── Country data for onboarding ────────────────────────────────────────────

export interface CountryData {
  avgSalary: number   // average monthly income in USD
  multiplier: number  // how many times $800 is vs avgSalary (pre-computed for display)
}

export const COUNTRY_DATA: Record<string, CountryData> = {
  'Philippines':  { avgSalary: 400,  multiplier: 2.0  },
  'Indonesia':    { avgSalary: 300,  multiplier: 2.7  },
  'India':        { avgSalary: 350,  multiplier: 2.3  },
  'Pakistan':     { avgSalary: 250,  multiplier: 3.2  },
  'Bangladesh':   { avgSalary: 200,  multiplier: 4.0  },
  'Sri Lanka':    { avgSalary: 280,  multiplier: 2.9  },
  'Nepal':        { avgSalary: 220,  multiplier: 3.6  },
  'Vietnam':      { avgSalary: 300,  multiplier: 2.7  },
  'Malaysia':     { avgSalary: 600,  multiplier: 1.3  },
  'Thailand':     { avgSalary: 500,  multiplier: 1.6  },
  'Myanmar':      { avgSalary: 180,  multiplier: 4.4  },
  'Cambodia':     { avgSalary: 200,  multiplier: 4.0  },
  'Nigeria':      { avgSalary: 200,  multiplier: 4.0  },
  'Kenya':        { avgSalary: 250,  multiplier: 3.2  },
  'South Africa': { avgSalary: 400,  multiplier: 2.0  },
  'Ghana':        { avgSalary: 220,  multiplier: 3.6  },
  'Egypt':        { avgSalary: 200,  multiplier: 4.0  },
  'Mexico':       { avgSalary: 400,  multiplier: 2.0  },
  'Colombia':     { avgSalary: 350,  multiplier: 2.3  },
  'Brazil':       { avgSalary: 450,  multiplier: 1.8  },
  'Argentina':    { avgSalary: 300,  multiplier: 2.7  },
  'Peru':         { avgSalary: 320,  multiplier: 2.5  },
  'Romania':      { avgSalary: 700,  multiplier: 1.1  },
  'Ukraine':      { avgSalary: 400,  multiplier: 2.0  },
  'Poland':       { avgSalary: 800,  multiplier: 1.0  },
  'Turkey':       { avgSalary: 450,  multiplier: 1.8  },
}

export const DEFAULT_COUNTRY_DATA: CountryData = { avgSalary: 350, multiplier: 2.3 }

export function getCountryData(country: string): CountryData {
  return COUNTRY_DATA[country] ?? DEFAULT_COUNTRY_DATA
}

// ─── Countries list ──────────────────────────────────────────────────────────

export const COUNTRIES = [
  'Philippines', 'Indonesia', 'India', 'Pakistan', 'Bangladesh',
  'Sri Lanka', 'Nepal', 'Vietnam', 'Malaysia', 'Thailand',
  'Myanmar', 'Cambodia', 'Nigeria', 'Kenya', 'South Africa',
  'Ghana', 'Egypt', 'Mexico', 'Colombia', 'Brazil',
  'Argentina', 'Peru', 'Romania', 'Ukraine', 'Poland',
  'Turkey', 'Other',
]

// ─── Payment methods per country ─────────────────────────────────────────────

export function getPaymentMethods(country: string): string[] {
  switch (country) {
    case 'Philippines': return ['Wise', 'PayPal', 'GCash', 'Maya']
    case 'Indonesia':   return ['Wise', 'PayPal', 'Bank Transfer']
    case 'India':       return ['Wise', 'PayPal', 'UPI', 'Bank Transfer']
    case 'Pakistan':    return ['Wise', 'JazzCash', 'EasyPaisa', 'Bank Transfer']
    case 'Bangladesh':  return ['Wise', 'PayPal', 'bKash', 'Bank Transfer']
    default:            return ['Wise', 'PayPal', 'Bank Transfer']
  }
}
