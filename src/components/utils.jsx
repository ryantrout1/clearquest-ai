// URL utilities
export function createPageUrl(pageName) {
  // Remove .js extension if present
  const cleanName = pageName.replace(/\.js$/, '');
  return `/${cleanName}`;
}