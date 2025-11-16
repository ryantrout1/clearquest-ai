// Tailwind className utility - simple implementation without external dependencies
export function cn(...inputs) {
  return inputs
    .flat()
    .filter(Boolean)
    .map(input => {
      if (typeof input === 'string') return input;
      if (typeof input === 'object' && !Array.isArray(input)) {
        return Object.entries(input)
          .filter(([, value]) => Boolean(value))
          .map(([key]) => key)
          .join(' ');
      }
      return '';
    })
    .join(' ')
    .split(' ')
    .filter((value, index, self) => Boolean(value) && self.indexOf(value) === index)
    .join(' ');
}