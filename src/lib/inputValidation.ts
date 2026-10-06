export function validateEmail(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) ? null : 'Enter a valid email address.';
}

export function validateAge(value: string, min = 1, max = 120): string | null {
  if (!/^\d{1,3}$/.test(value.trim())) return 'Age must be a whole number.';
  const age = Number(value);
  return Number.isInteger(age) && age >= min && age <= max ? null : `Age must be between ${min} and ${max}.`;
}

export function validatePhone(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, '');
  return /^(?:0\d{10}|\+?[1-9]\d{7,14})$/.test(digits)
    ? null
    : 'Enter a complete phone number with country code or a complete local mobile number.';
}
