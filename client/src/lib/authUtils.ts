export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export function getHWID(): string {
  // In a real implementation, this would get the actual hardware ID
  // For demo purposes, we'll generate a consistent ID based on browser info
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx!.textBaseline = 'top';
  ctx!.font = '14px Arial';
  ctx!.fillText('Hardware fingerprint', 2, 2);
  
  const fingerprint = canvas.toDataURL();
  const navigator_info = navigator.userAgent + navigator.language + screen.width + screen.height;
  
  // Simple hash function
  let hash = 0;
  const str = fingerprint + navigator_info;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Format as HWID
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
