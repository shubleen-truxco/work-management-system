import { Injectable } from '@angular/core';

export interface CountryCode {
  code: string;
  name: string;
  flag: string;
  digits: number;
  pattern: RegExp;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ValidationService {

  // ── Country Config ────────────────────────────────────
  readonly countryCodes: CountryCode[] = [
    { code: '+91',  name: 'India',        flag: '🇮🇳', digits: 10, pattern: /^[6-9]\d{9}$/   },
    { code: '+1',   name: 'USA/Canada',   flag: '🇺🇸', digits: 10, pattern: /^[2-9]\d{9}$/   },
    { code: '+44',  name: 'UK',           flag: '🇬🇧', digits: 10, pattern: /^[1-9]\d{9}$/   },
    { code: '+61',  name: 'Australia',    flag: '🇦🇺', digits: 9,  pattern: /^[2-9]\d{8}$/   },
    { code: '+971', name: 'UAE',          flag: '🇦🇪', digits: 9,  pattern: /^[0-9]\d{8}$/   },
    { code: '+65',  name: 'Singapore',    flag: '🇸🇬', digits: 8,  pattern: /^[689]\d{7}$/   },
    { code: '+49',  name: 'Germany',      flag: '🇩🇪', digits: 11, pattern: /^[1-9]\d{10}$/  },
    { code: '+33',  name: 'France',       flag: '🇫🇷', digits: 9,  pattern: /^[1-9]\d{8}$/   },
    { code: '+81',  name: 'Japan',        flag: '🇯🇵', digits: 10, pattern: /^[0-9]\d{9}$/   },
    { code: '+86',  name: 'China',        flag: '🇨🇳', digits: 11, pattern: /^1[3-9]\d{9}$/  },
    { code: '+92',  name: 'Pakistan',     flag: '🇵🇰', digits: 10, pattern: /^3\d{9}$/        },
    { code: '+880', name: 'Bangladesh',   flag: '🇧🇩', digits: 10, pattern: /^1[3-9]\d{8}$/  },
    { code: '+94',  name: 'Sri Lanka',    flag: '🇱🇰', digits: 9,  pattern: /^7\d{8}$/        },
    { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦', digits: 9,  pattern: /^5\d{8}$/        },
    { code: '+60',  name: 'Malaysia',     flag: '🇲🇾', digits: 9,  pattern: /^1\d{8}$/        },
    { code: '+63',  name: 'Philippines',  flag: '🇵🇭', digits: 10, pattern: /^9\d{9}$/        },
  ];

  // ── Country Helpers ───────────────────────────────────
  getCountry(code: string): CountryCode {
    return this.countryCodes.find(c => c.code === code) || this.countryCodes[0];
  }

  getPhonePlaceholder(countryCode: string): string {
    const c = this.getCountry(countryCode);
    return `Enter ${c.digits}-digit number`;
  }

  getPhoneMaxLength(countryCode: string): number {
    return this.getCountry(countryCode).digits;
  }

  getPhoneHint(countryCode: string): string {
    const c = this.getCountry(countryCode);
    return `${c.name} (${c.code}): ${c.digits} digits required`;
  }

  // ── Strip non-numeric ─────────────────────────────────
  sanitizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }

  // ── Individual Validators ─────────────────────────────
  validateFirstName(value: string): ValidationResult {
    if (!value?.trim())
      return { valid: false, message: 'First name is required' };
    if (value.trim().length < 2)
      return { valid: false, message: 'Minimum 2 characters required' };
    if (!/^[a-zA-Z\s'-]+$/.test(value.trim()))
      return { valid: false, message: 'Only letters, spaces, hyphens allowed' };
    return { valid: true };
  }

  validateLastName(value: string): ValidationResult {
    if (!value?.trim())
      return { valid: false, message: 'Last name is required' };
    if (value.trim().length < 2)
      return { valid: false, message: 'Minimum 2 characters required' };
    if (!/^[a-zA-Z\s'-]+$/.test(value.trim()))
      return { valid: false, message: 'Only letters, spaces, hyphens allowed' };
    return { valid: true };
  }

  validatePhone(phone: string, countryCode: string): ValidationResult {
    const country = this.getCountry(countryCode);
    if (!phone?.trim())
      return { valid: false, message: 'Phone number is required' };
    if (!/^\d+$/.test(phone))
      return { valid: false, message: 'Only digits are allowed' };
    if (phone.length !== country.digits)
      return { valid: false, message: `${country.name} numbers must be exactly ${country.digits} digits` };
    if (!country.pattern.test(phone))
      return { valid: false, message: `Invalid ${country.name} number format` };
    return { valid: true };
  }

  validateEmail(value: string): ValidationResult {
    if (!value?.trim())
      return { valid: false, message: 'Email address is required' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
      return { valid: false, message: 'Enter a valid email address' };
    return { valid: true };
  }

  validateRequired(value: any, fieldLabel: string): ValidationResult {
    if (!value || (typeof value === 'string' && !value.trim()))
      return { valid: false, message: `${fieldLabel} is required` };
    return { valid: true };
  }

  validatePassword(value: string): ValidationResult {
    if (!value?.trim())
      return { valid: false, message: 'Password is required' };
    if (value.length < 8)
      return { valid: false, message: 'Minimum 8 characters required' };
    if (!/[A-Z]/.test(value))
      return { valid: false, message: 'Must contain at least one uppercase letter' };
    if (!/[a-z]/.test(value))
      return { valid: false, message: 'Must contain at least one lowercase letter' };
    if (!/[0-9]/.test(value))
      return { valid: false, message: 'Must contain at least one number' };
    if (!/[!@#$%^&*]/.test(value))
      return { valid: false, message: 'Must contain at least one special character (!@#$%^&*)' };
    return { valid: true };
  }

  validateConfirmPassword(password: string, confirm: string): ValidationResult {
    if (!confirm?.trim())
      return { valid: false, message: 'Please confirm your password' };
    if (password !== confirm)
      return { valid: false, message: 'Passwords do not match' };
    return { valid: true };
  }

  // ── Bulk Form Validator ───────────────────────────────
  // Pass a map of fieldName -> ValidationResult
  // Returns errors object and isValid boolean
  validateForm(checks: { [field: string]: ValidationResult }): {
    errors: { [field: string]: string };
    isValid: boolean;
  } {
    const errors: { [field: string]: string } = {};
    for (const field in checks) {
      if (!checks[field].valid && checks[field].message) {
        errors[field] = checks[field].message!;
      }
    }
    return { errors, isValid: Object.keys(errors).length === 0 };
  }
}