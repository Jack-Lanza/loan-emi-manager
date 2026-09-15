/**
 * EMICycle - Progressive Web App (PWA) Controller
 */
let deferredPrompt = null;
let isPromptReady = false;

// Register Service Worker immediately
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => {
            console.log('PWA Service Worker registered with scope:', reg.scope);
            reg.update();
        })
        .catch(err => console.log('PWA Service Worker registration failed:', err));
}

// Check if running in standalone display mode
function isRunningStandalone() {
    return (window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator.standalone === true) ||
           (document.referrer.includes('android-app://'));
}

// Show Install Banner
function showInstallBanner() {
    if (isRunningStandalone() || sessionStorage.getItem('pwaBannerDismissedSession')) {
        return;
    }
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) {
        banner.style.display = 'flex';
        const installBtn = document.getElementById('pwaInstallBtn');
        if (installBtn) {
            installBtn.innerHTML = '<span>📲</span> Install App';
        }
    }
}

// Capture Chrome / Android / Edge native install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default mini-infobar
    e.preventDefault();
    deferredPrompt = e;
    isPromptReady = true;
    console.log('beforeinstallprompt event captured and ready');
    showInstallBanner();
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
            isPromptReady = false;
        });
        return;
    }

    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    if (isIos) {
        alert("To install EMICycle on your iPhone/iPad:\n\n1. Tap the Share button (⎋) at the bottom in Safari.\n2. Scroll down and tap 'Add to Home Screen' (+).\n3. Tap 'Add' to install.");
    } else {
        // If beforeinstallprompt hasn't fired yet, wait briefly or inform user
        const btn = document.getElementById('pwaInstallBtn');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span>⏳</span> Preparing App...';
            setTimeout(() => {
                if (deferredPrompt) {
                    btn.innerHTML = originalText;
                    installPwaApp();
                } else {
                    btn.innerHTML = originalText;
                    alert("To install EMICycle as an app:\n\nTap your browser menu (⋮) in the top-right corner and select 'Install app' or 'Add to Home screen'.");
                }
            }, 1000);
        }
    }
}

// Dismiss PWA Banner (for the current browsing session)
function dismissPwaBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
    sessionStorage.setItem('pwaBannerDismissedSession', 'true');
}

// Check on page load
window.addEventListener('DOMContentLoaded', () => {
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    if (isIos) {
        const desc = document.getElementById('pwaBannerDesc');
        if (desc) {
            desc.textContent = "Tap the Share button (⎋) in Safari and select 'Add to Home Screen' to use EMICycle as a full app.";
        }
        showInstallBanner();
    }
});

// App installed event listener
window.addEventListener('appinstalled', () => {
    console.log('EMICycle app installed successfully');
    deferredPrompt = null;
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
});

