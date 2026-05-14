'use client'; // This is required!

import { useState, useEffect } from 'react';

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // If the prompt isn't available, you could show a message 
      // telling them to use the browser menu (especially for iOS)
      console.log('Install prompt not available yet.');
      return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Only show the button if the prompt is actually available
  // This prevents having a "broken" button on screen
  if (!deferredPrompt) return null;

  return (
    <button 
      onClick={handleInstallClick}
      className="your-button-styles"
    >
      Install App
    </button>
  );
}