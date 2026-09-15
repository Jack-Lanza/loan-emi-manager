/**
 * EMICycle - Progressive Web App (PWA) Controller
 */
let deferredPrompt = null;

// Clear legacy persistent dismiss flag so uninstalled users always see the install prompt
localStorage.removeItem('pwaPromptDismissed');

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('PWA Service Worker registered with scope:', reg.scope);
                reg.update();
            })
            .catch(err => console.log('PWA Service Worker registration failed:', err));
    });
}

// Check if running in standalone display mode
function isRunningStandalone() {
    return (window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator.standalone === true) ||
           (document.referrer.includes('android-app://'));
}

// Show Install Banner if opened in normal browser
function checkAndShowInstallBanner() {
    if (!isRunningStandalone() && !sessionStorage.getItem('pwaBannerDismissedSession')) {
        const banner = document.getElementById('pwaInstallBanner');
        if (banner) {
            banner.style.display = 'flex';
        }
    }
}

// Capture Chrome/Android install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    checkAndShowInstallBanner();
});

// Prompt PWA Install
function installPwaApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted PWA installation');
                const banner = document.getElementById('pwaInstallBanner');
                if (banner) banner.style.display = 'none';
            }
            deferredPrompt = null;
        });
    } else {
        const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIos) {
            alert("To install EMICycle on your iPhone/iPad:\n1. Tap the Share button (⎋) in Safari.\n2. Scroll down and tap 'Add to Home Screen' (+).");
        } else {
            alert("To install:\nTap your browser menu (⋮) in the top-right corner and select 'Install app' or 'Add to Home screen'.");
        }
    }
}

// Dismiss PWA Banner (only for the current browsing session)
function dismissPwaBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
    sessionStorage.setItem('pwaBannerDismissedSession', 'true');
}

// Show banner on page load if in normal browser
window.addEventListener('DOMContentLoaded', () => {
    checkAndShowInstallBanner();

    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    const desc = document.getElementById('pwaBannerDesc');
    if (isIos && desc) {
        desc.textContent = "Tap the Share button (⎋) in Safari and select 'Add to Home Screen' to use EMICycle as a full app.";
    }
});

// App installed event listener
window.addEventListener('appinstalled', () => {
    console.log('EMICycle app installed successfully');
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
});
