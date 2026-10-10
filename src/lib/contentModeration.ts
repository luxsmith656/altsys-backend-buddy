const PROFANITY_PATTERNS = [
  /f+u+c+k+/i,
  /s+h+i+t/i,
  /b+i+t+c+h/i,
  /a+s+s+h+o+l+e/i,
  /d+a+m+n/i,
  /b+a+s+t+a+r+d/i,
  /i+d+i+o+t/i,
  /s+t+u+p+i+d/i,
  /p+u+t+a/i,
  /g+a+g+o/i,
  /t+a+n+g+i+n+a/i,
  /l+e+c+h+e/i,
  /p+a+k+y+u/i,
];

export function containsProfanity(value: string): boolean {
  const normalized = value
    .toLocaleLowerCase()
    .replace(/[^a-záéíóúñ]+/g, '');
  return PROFANITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const PROFANITY_NOTICE = 'Please keep the conversation respectful. Remove offensive language and try again.';
