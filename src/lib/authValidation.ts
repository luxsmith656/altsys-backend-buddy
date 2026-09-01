export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation.trim()) return 'Please confirm your password';
  if (password !== confirmation) return 'Passwords do not match';
  return null;
}
