// URL utilities for Base44 navigation
export function createPageUrl(pageName) {
  // Remove .js extension if present
  const cleanName = pageName.replace(/\.js$/, '');
  return `/${cleanName}`;
}

// Re-export for compatibility
export default { createPageUrl };