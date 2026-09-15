/**
 * EMICycle - Progressive Web App (PWA) Controller
 */
let deferredPrompt = null;

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('PWA Service Worker registered with scope:', reg.scope))
            .catch(err => console.log('PWA Service Worker registration failed:', err));
    });
}

// Check if running in standalone display mode
function isRunningStandalone() {
    return (window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator.standalone === true) ||
           (document.referrer.includes('android-app://'));
}

// Capture Chrome/Android install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (!isRunningStandalone() && !localStorage.getItem('pwaPromptDismissed')) {
        const banner = document.getElementById('pwaInstallBanner');
        if (banner) banner.style.display = 'flex';
    }
});

// Prompt PWA Install
function installPwaApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted PWA installation');
            }
            deferredPrompt = null;
            dismissPwaBanner();
        });
    } else {
        const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIos) {
            alert("To install EMICycle on your iPhone/iPad:\n1. Tap the Share button (⎋) in Safari.\n2. Scroll down and tap 'Add to Home Screen' (+).");
        } else {
            alert("To install, open your browser menu (⋮) and tap 'Add to Home Screen' or 'Install App'.");
        }
    }
}

// Dismiss PWA Banner
function dismissPwaBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('pwaPromptDismissed', 'true');
}

// Show iOS Safari guidance if applicable
window.addEventListener('DOMContentLoaded', () => {
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    if (isIos && !isRunningStandalone() && !localStorage.getItem('pwaPromptDismissed')) {
        const banner = document.getElementById('pwaInstallBanner');
        const desc = document.getElementById('pwaBannerDesc');
        if (banner && desc) {
            desc.textContent = "Tap the Share button (⎋) and select 'Add to Home Screen' to use EMICycle as an app.";
            banner.style.display = 'flex';
        }
    }
});

// App installed event listener
window.addEventListener('appinstalled', () => {
    console.log('EMICycle app installed successfully');
    dismissPwaBanner();
});
