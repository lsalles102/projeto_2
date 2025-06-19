// Global error handler for unhandled promise rejections
export function setupGlobalErrorHandling() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Prevent the default behavior (logging to console)
    event.preventDefault();
    
    // Optional: Show user-friendly error message
    if (event.reason?.message?.includes('Failed to fetch')) {
      console.log('Network error handled gracefully');
    }
  });

  // Handle regular JavaScript errors
  window.addEventListener('error', (event) => {
    console.error('JavaScript error:', event.error);
  });
}