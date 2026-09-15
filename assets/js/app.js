/**
 * EMICycle - Smart Loan & EMI Manager
 * Core Business Logic, State Management, Validation & Dynamic Cloud Sync
 */

function getNpointId() {
    const urlParams = new URLSearchParams(window.location.search);
    let id = null;

    // 1. Check URL Query Parameters (?id=... or ?bin=...)
    if (urlParams.get("id")) {
        id = urlParams.get("id").trim();
    } else if (urlParams.get("bin")) {
        id = urlParams.get("bin").trim();
    }

    // 2. Check Hash support: e.g. #XXXXXXXXXXXXXXXX
    if (!id && window.location.hash) {
        const hash = window.location.hash.substring(1).trim();
        if (hash && /^[a-f0-9]+$/i.test(hash)) {
            id = hash;
        }
    }

    // 3. Check Path support: e.g. /manage/XXXXXXXXXXXXXXXX
    if (!id) {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart !== "index.html" && /^[a-f0-9]{10,}$/i.test(lastPart)) {
                id = lastPart;
            }
        }
    }

    // 4. If ID is provided in URL/hash/path, save it permanently to localStorage
    if (id) {
        localStorage.setItem("emicycle_saved_bin_id", id);
        return id;
    }

    // 5. If opened without URL parameters, check if user previously setup a custom ID
    const savedId = localStorage.getItem("emicycle_saved_bin_id");
    if (savedId) {
        return savedId;
    }

    // 6. No ID configured -> return null (Local Browser Database mode)
    return null;
}

let NPOINT_ID = getNpointId();
let API_URL = NPOINT_ID ? ("https://api.npoint.io/" + NPOINT_ID) : null;

// Start fresh with an empty list
let loans = [];
let historyStack = [];

// Reusable Confirm Modal Callback State
let onConfirmCallback = null;

// Formatter Helpers
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function formatNextDue(amount, dueDay) {
    if (!amount || !dueDay) return "All Paid";
    const suffix = getSuffix(dueDay);
    return `${money(amount)} • ${dueDay}${suffix}`;
}

function maskId(id) {
    if (!id || id.length < 8) return id || "Local";
    return id.substring(0, 6) + "****" + id.substring(id.length - 6);
}

function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function getSuffix(d) {
    if (d == 11 || d == 12 || d == 13) return 'th';
    if (d % 10 == 1) return 'st';
    if (d % 10 == 2) return 'nd';
    if (d % 10 == 3) return 'rd';
    return 'th';
}

// Confirmation Modal Helpers
function showConfirmModal(title, message, btnText, btnClass, callback, showCancel = true) {
    const titleEl = document.getElementById("confirmModalTitle");
    const msgEl = document.getElementById("confirmModalMessage");
    const actionBtn = document.getElementById("confirmModalActionBtn");
    const cancelBtn = document.querySelector("#confirmModal .btn-secondary");

    if (titleEl) titleEl.innerHTML = title || '<i class="fa-solid fa-circle-exclamation"></i> Confirm Action';
    if (msgEl) msgEl.innerHTML = message || "Are you sure you want to proceed?";
    if (actionBtn) {
        actionBtn.innerHTML = btnText || "Confirm";
        actionBtn.className = "btn " + (btnClass || "btn-danger");
    }
    if (cancelBtn) {
        cancelBtn.style.display = showCancel ? "inline-flex" : "none";
    }

    onConfirmCallback = callback;
    const modal = document.getElementById("confirmModal");
    if (modal) modal.classList.add("active");
}

function closeConfirmModal() {
    const modal = document.getElementById("confirmModal");
    if (modal) modal.classList.remove("active");
    onConfirmCallback = null;
}

function executeConfirmAction() {
    if (typeof onConfirmCallback === "function") {
        const cb = onConfirmCallback;
        closeConfirmModal();
        cb();
    } else {
        closeConfirmModal();
    }
}

// Sync UI Management
function updateSyncBadge(status, text) {
    const badge = document.getElementById("syncStatusBadge");
    const statusText = document.getElementById("syncStatusText");
    const syncActionBtn = document.getElementById("syncActionBtn");

    if (syncActionBtn) {
        if (NPOINT_ID) {
            syncActionBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Sync';
            syncActionBtn.title = "Refresh live cloud sync";
        } else {
            syncActionBtn.innerHTML = '<i class="fa-solid fa-cloud"></i> Setup Sync';
            syncActionBtn.title = "Connect your device to a Cloud Bin";
        }
    }

    if (!badge || !statusText) return;

    if (!NPOINT_ID) {
        // Pure Local Browser Database Mode
        badge.className = "sync-badge";
        statusText.innerHTML = `<i class="fa-solid fa-hard-drive"></i> Local Storage`;
        badge.title = "Operating in Local Device Mode. Click to setup cloud sync.";
        return;
    }

    badge.className = "sync-badge " + status;
    if (status === "synced") {
        statusText.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> ID : <span id="binIdDisplay">${maskId(NPOINT_ID)}</span>`;
        badge.title = `Cloud Synced (ID: ${NPOINT_ID}). Click to refresh.`;
    } else if (status === "syncing") {
        statusText.innerHTML = `<i class="fa-solid fa-rotate fa-spin"></i> ${text || "Syncing..."}`;
    } else if (status === "offline") {
        statusText.innerHTML = `<i class="fa-solid fa-cloud-slash"></i> ${text || "Offline Mode"}`;
    }
}

// Setup Cloud Sync Modal Handlers
function openSyncModal() {
    const modal = document.getElementById("syncModal");
    const input = document.getElementById("inputBinId");
    clearFieldValidation(input);
    if (input) input.value = NPOINT_ID || "";
    if (modal) modal.classList.add("active");
    if (input) input.focus();
}

function closeSyncModal() {
    const modal = document.getElementById("syncModal");
    if (modal) modal.classList.remove("active");
}

function handleSyncActionClick() {
    if (NPOINT_ID) {
        fetchCloudData();
    } else {
        openSyncModal();
    }
}

function handleSyncBadgeClick() {
    if (NPOINT_ID) {
        fetchCloudData();
    } else {
        openSyncModal();
    }
}

function handleSyncFormSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById("inputBinId");
    const enteredId = input ? input.value.trim() : "";

    clearFieldValidation(input);

    if (!enteredId || enteredId.length < 5) {
        setFieldInvalid(input, "inputBinIdFeedback", "Please enter a valid Cloud Bin ID (at least 5 characters).");
        return;
    }

    // Lock in the cloud ID permanently
    localStorage.setItem("emicycle_saved_bin_id", enteredId);
    NPOINT_ID = enteredId;
    API_URL = "https://api.npoint.io/" + enteredId;

    closeSyncModal();
    updateSyncBadge("syncing", "Connecting...");

    // Fetch cloud data or push existing local data if cloud is empty
    fetch(API_URL + "?t=" + Date.now(), { cache: "no-store" })
        .then(res => res.json())
        .then(data => {
            if (data && Array.isArray(data.loans) && data.loans.length > 0) {
                // Load existing loans from cloud
                loans = data.loans;
                loans.forEach(l => { if (l.paidStatus === undefined) l.paidStatus = null; });
                localStorage.setItem("loanEMIData", JSON.stringify(loans));
            } else if (loans.length > 0) {
                // If cloud is empty but user had local loans, upload local loans to cloud
                save(false);
            }
            updateSyncBadge("synced");
            render();
            showConfirmModal(
                "✅ Connected",
                "Cloud Sync connected successfully! Your loan records are now backed up and synchronized live.",
                "Great",
                "btn-primary",
                () => { },
                false
            );
        })
        .catch(err => {
            // Save current local loans to newly connected bin
            save(false);
            showConfirmModal(
                "⚠️ Connected (Offline)",
                "Cloud Sync setup is complete. Operating in offline cache until connection is restored.",
                "OK",
                "btn-secondary",
                () => { },
                false
            );
        });
}

// Data Load & Cloud Sync Operations
function fetchCloudData() {
    // If no cloud ID is specified, operate strictly from local browser storage
    if (!API_URL) {
        let localData = JSON.parse(localStorage.getItem("loanEMIData") || "null");
        loans = (Array.isArray(localData)) ? localData : [];
        updateSyncBadge("local");
        render();
        return;
    }

    updateSyncBadge("syncing", "Connecting...");

    fetch(API_URL + "?t=" + Date.now(), { cache: "no-store" })
        .then(res => res.json())
        .then(data => {
            if (data && Array.isArray(data.loans)) {
                loans = data.loans;
                loans.forEach(l => { if (l.paidStatus === undefined) l.paidStatus = null; });
                localStorage.setItem("loanEMIData", JSON.stringify(loans));
            } else {
                loans = [];
            }
            updateSyncBadge("synced");
            render();
        })
        .catch(err => {
            updateSyncBadge("offline", "Offline Mode");
            let localData = JSON.parse(localStorage.getItem("loanEMIData") || "null");
            loans = (Array.isArray(localData)) ? localData : [];
            render();
        });
}

function save(pushHistory = true) {
    if (pushHistory) {
        historyStack.push(JSON.parse(JSON.stringify(loans)));
        if (historyStack.length > 20) historyStack.shift();
    }

    // Always persist to local browser database
    localStorage.setItem("loanEMIData", JSON.stringify(loans));
    updateUndoState();
    render();

    // If no cloud ID configured, we are done saving locally
    if (!API_URL) {
        updateSyncBadge("local");
        return;
    }

    updateSyncBadge("syncing", "Saving...");
    const payload = { loans: loans };
    fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
        .then(res => {
            updateSyncBadge("synced");
        })
        .catch(err => {
            updateSyncBadge("offline", "Saved Locally");
        });
}

// Toast Notification System
function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-show");
    }, 20);

    setTimeout(() => {
        toast.classList.remove("toast-show");
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// Undo Action
function updateUndoState() {
    const btn = document.getElementById("undoBtn");
    if (btn) {
        if (historyStack.length > 0) {
            btn.disabled = false;
            btn.style.opacity = "1";
        } else {
            btn.disabled = true;
            btn.style.opacity = "0.5";
        }
    }
}

function undoAction() {
    if (historyStack.length === 0) return;
    showConfirmModal(
        '<i class="fa-solid fa-rotate-left"></i> Confirm Undo',
        `Are you sure you want to undo your last action?<br><span style="font-size: 12px; color: var(--text-muted);">This will restore your previous loan list and payment state.</span>`,
        "Yes, Undo",
        "btn-primary",
        () => {
            loans = historyStack.pop();
            save(false);
            showToast('<i class="fa-solid fa-rotate-left"></i> Action undone successfully', "info");
        }
    );
}

// EMI Payment
function payEmiByOriginalIndex(i) {
    if (!loans[i] || loans[i].remaining <= 0 || loans[i].paidStatus) return;
    historyStack.push(JSON.parse(JSON.stringify(loans)));

    const loanName = loans[i].name || "Loan";
    const emiAmount = loans[i].emi || 0;

    if (!loans[i].totalTenure) {
        loans[i].totalTenure = loans[i].remaining;
    }

    loans[i].remaining -= 1;
    const options = { day: 'numeric', month: 'short' };
    loans[i].paidStatus = new Date().toLocaleDateString('en-GB', options);

    save(false);
    showToast(`<i class="fa-solid fa-circle-check"></i> Marked ₹${Number(emiAmount).toLocaleString('en-IN')} as paid for ${esc(loanName)}`, "success");
}

// Tab Switching Navigation
let activeTab = 'due';

function switchTab(tabName) {
    if (tabName !== 'due' && tabName !== 'loans') return;
    activeTab = tabName;

    const dueBtn = document.getElementById("tabBtnDue");
    const loansBtn = document.getElementById("tabBtnLoans");
    const duePane = document.getElementById("dueSchedulePane");
    const loansPane = document.getElementById("myLoansPane");

    if (tabName === 'due') {
        if (dueBtn) {
            dueBtn.classList.add("active");
            dueBtn.setAttribute("aria-selected", "true");
        }
        if (loansBtn) {
            loansBtn.classList.remove("active");
            loansBtn.setAttribute("aria-selected", "false");
        }
        if (duePane) duePane.style.display = "block";
        if (loansPane) loansPane.style.display = "none";
    } else {
        if (loansBtn) {
            loansBtn.classList.add("active");
            loansBtn.setAttribute("aria-selected", "true");
        }
        if (dueBtn) {
            dueBtn.classList.remove("active");
            dueBtn.setAttribute("aria-selected", "false");
        }
        if (loansPane) loansPane.style.display = "block";
        if (duePane) duePane.style.display = "none";
    }
}

// Due Date Notifications System
function updateNotificationButtonState() {
    const btn = document.getElementById("notifToggleBtn");
    if (!btn) return;

    if (!("Notification" in window)) {
        btn.style.display = "none";
        return;
    }

    if (Notification.permission === "granted") {
        btn.className = "notif-btn active";
        btn.innerHTML = '<i class="fa-solid fa-bell"></i>';
        btn.title = "Due date reminders are enabled";
    } else if (Notification.permission === "denied") {
        btn.className = "notif-btn denied";
        btn.innerHTML = '<i class="fa-solid fa-bell-slash"></i>';
        btn.title = "Notifications blocked in browser settings";
    } else {
        btn.className = "notif-btn";
        btn.innerHTML = '<i class="fa-regular fa-bell"></i>';
        btn.title = "Click to enable due date notifications";
    }
}

async function toggleNotificationPermission() {
    if (!("Notification" in window)) {
        showToast('<i class="fa-solid fa-circle-exclamation"></i> Notifications are not supported on this device/browser', "warning");
        return;
    }

    if (Notification.permission === "granted") {
        showToast('<i class="fa-solid fa-bell"></i> Due reminders are active! You will get notified on EMI due dates.', "info");
        checkAndSendDueNotifications();
        return;
    }

    if (Notification.permission === "denied") {
        showToast('<i class="fa-solid fa-bell-slash"></i> Notifications are blocked. Please enable permissions in browser settings.', "warning");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        updateNotificationButtonState();
        if (permission === "granted") {
            showToast('<i class="fa-solid fa-bell"></i> Due date notifications enabled successfully!', "success");
            checkAndSendDueNotifications();
        } else {
            showToast('<i class="fa-solid fa-bell-slash"></i> Notification permission was not granted', "info");
        }
    } catch (e) {
        console.warn("Notification permission request error:", e);
    }
}

function checkAndSendDueNotifications() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;

    const todayDay = new Date().getDate();
    const todayDueLoans = loans.filter(l => Number(l.due) === todayDay && Number(l.remaining) > 0 && !l.paidStatus);

    navigator.serviceWorker.ready.then(reg => {
        if (todayDueLoans.length > 0) {
            let title = "";
            let body = "";

            if (todayDueLoans.length === 1) {
                const loan = todayDueLoans[0];
                title = `📅 EMI Due Today: ${loan.name}`;
                body = `Payment of ${money(loan.emi)} is due today. Tap to mark as paid in EMICycle.`;
            } else {
                const totalDue = todayDueLoans.reduce((s, l) => s + Number(l.emi || 0), 0);
                title = `📅 ${todayDueLoans.length} EMIs Due Today (${money(totalDue)})`;
                body = `${todayDueLoans.map(l => `${l.name} (${money(l.emi)})`).join(', ')}. Tap to mark as paid.`;
            }

            reg.showNotification(title, {
                body: body,
                icon: 'assets/images/icon-192.png',
                badge: 'assets/images/icon-192.png',
                tag: 'emi-due-today',
                renotify: false,
                requireInteraction: true,
                data: {
                    url: './index.html'
                }
            });
        } else {
            // All dues for today are settled or no dues today -> dismiss notification from mobile notification center
            reg.getNotifications({ tag: 'emi-due-today' }).then(notifications => {
                notifications.forEach(n => n.close());
            });
        }
    }).catch(err => {
        console.warn("Error managing due notifications:", err);
    });
}

// Main Render Function
function render() {
    const monthly = loans.reduce((s, l) => s + Number(l.emi || 0), 0);
    const rem = loans.reduce((s, l) => s + Number(l.emi || 0) * Number(l.remaining || 0), 0);

    document.getElementById("monthly").textContent = money(monthly);
    document.getElementById("remaining").textContent = money(rem);

    let monthTotalDue = 0;
    loans.forEach(l => {
        if (l.remaining > 0 && !l.paidStatus) {
            monthTotalDue += Number(l.emi);
        }
    });
    document.getElementById("monthTotalDue").textContent = money(monthTotalDue);

    const unpaidFuture = loans.filter(l => l.remaining > 0 && !l.paidStatus).sort((a, b) => a.due - b.due);
    const next = unpaidFuture[0];
    document.getElementById("nextDue").textContent = (unpaidFuture.length > 0 && next) ? formatNextDue(next.emi, next.due) : "All Paid";

    // Update Live Tab Badges
    const unpaidDuesCount = loans.filter(l => l.remaining > 0 && !l.paidStatus).length;
    const dueBadge = document.getElementById("dueTabBadge");
    if (dueBadge) dueBadge.textContent = unpaidDuesCount;

    const loansBadge = document.getElementById("loansTabBadge");
    if (loansBadge) loansBadge.textContent = loans.length;

    renderDue();
    renderLoans();
    updateUndoState();
    updateNotificationButtonState();
    checkAndSendDueNotifications();
}

// Render Due Schedule Timeline
function renderDue() {
    const groups = {};
    loans.forEach((l, originalIndex) => {
        if (l.remaining > 0) {
            if (!groups[l.due]) groups[l.due] = { total: 0, items: [] };
            groups[l.due].total += Number(l.emi);
            groups[l.due].items.push({
                name: l.name,
                emi: l.emi,
                index: originalIndex,
                paidStatus: l.paidStatus
            });
        }
    });

    // Sort items inside each date group so Pending (unpaid) appears first, then Paid
    Object.keys(groups).forEach(d => {
        groups[d].items.sort((a, b) => {
            const aPaid = a.paidStatus ? 1 : 0;
            const bPaid = b.paidStatus ? 1 : 0;
            if (aPaid !== bPaid) {
                return aPaid - bPaid; // 0 (Pending) before 1 (Paid)
            }
            return 0;
        });
    });

    // Sort due date groups:
    // 1. Groups with pending (unpaid) dues appear FIRST (ordered by Due Date ASC)
    // 2. Groups where all dues are settled appear AFTER (ordered by Due Date ASC)
    const sortedDueDays = Object.keys(groups).sort((a, b) => {
        const aHasPending = groups[a].items.some(it => !it.paidStatus) ? 0 : 1;
        const bHasPending = groups[b].items.some(it => !it.paidStatus) ? 0 : 1;
        if (aHasPending !== bHasPending) {
            return aHasPending - bHasPending; // 0 (has pending) comes first
        }
        return Number(a) - Number(b); // ASC order of due date (1 to 31)
    });

    const container = document.getElementById("dueSummary");

    if (sortedDueDays.length === 0) {
        container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-circle-check"></i></div>
            <strong>No Upcoming Dues</strong><br>
            <span>All dues for this cycle are settled or no active loans exist.</span>
        </div>`;
        return;
    }

    container.innerHTML = sortedDueDays.map(d => {
        const group = groups[d];
        const suffix = getSuffix(d);
        const isAllSettled = group.items.every(it => it.paidStatus);

        const itemsHtml = group.items.map(item => {
            const actionElement = item.paidStatus
                ? `<span class="paid-badge" title="Marked as Paid"><img src="assets/images/paid-mark.png" alt="Paid" class="paid-mark-img"></span>`
                : `<button class="btn btn-primary" style="padding: 10px 12px; font-size: 11px;" onclick="payEmiByOriginalIndex(${item.index})"><i class="fa-solid fa-check-double"></i> Mark Paid</button>`;

            return `
            <div class="due-row${item.paidStatus ? ' is-paid-row' : ''}">
                <div>
                    <strong>${esc(item.name)}</strong><br>
                    <span style="color: var(--primary); font-weight: 700;">${money(item.emi)}</span>
                </div>
                <div>${actionElement}</div>
            </div>`;
        }).join("");

        return `
        <div class="due-group${isAllSettled ? ' is-all-settled' : ''}">
            <div class="due-header">
                <span><i class="fa-regular fa-calendar"></i> Due: ${d}${suffix}${isAllSettled ? ' <span style="font-size: 11px; font-weight: 600; color: var(--success); margin-left: 6px;"><i class="fa-solid fa-check"></i> Settled</span>' : ''}</span>
                <span style="color: var(--primary); font-weight: 800;">${money(group.total)}</span>
            </div>
            ${itemsHtml}
        </div>`;
    }).join("");
}

// Render Manage Loans Cards
function renderLoans() {
    const container = document.getElementById("loanCards");
    if (!container) return;

    if (loans.length === 0) {
        container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-building-columns"></i></div>
            <strong>No Active Loans Added Yet</strong><br>
            <span>Tap <strong><i class="fa-solid fa-plus"></i> Add</strong> above to start tracking your first loan schedule.</span>
        </div>`;
        return;
    }

    container.innerHTML = loans.map((l, i) => {
        const suffix = getSuffix(l.due);
        const currentRemaining = Number(l.remaining || 0);
        const totalTenure = Number(l.totalTenure || currentRemaining || 1);
        const paidCount = Math.max(0, totalTenure - currentRemaining);
        const progressPercent = totalTenure > 0 ? Math.min(100, Math.round((paidCount / totalTenure) * 100)) : 0;
        const totalValue = Number(l.emi || 0) * currentRemaining;

        return `
        <div class="loan-card-item">
            <div class="loan-card-header">
                <span class="loan-card-title"><i class="fa-solid fa-receipt"></i> ${esc(l.name)}</span>
                <span class="due-pill"><i class="fa-regular fa-calendar-check"></i> Due: ${l.due}${suffix}</span>
            </div>
            <div class="loan-card-body">
                <div>Monthly EMI: <span>${money(l.emi)}</span></div>
                <div>Balance: <span>${money(totalValue)}</span></div>
            </div>
            <div class="loan-progress-box">
                <div class="loan-progress-wrap">
                    <div class="loan-progress-bar" style="width: ${progressPercent}%;"></div>
                </div>
                <div class="loan-progress-labels">
                    <span>${currentRemaining} EMIs Left</span>
                    <span class="progress-pct">${progressPercent}% Paid</span>
                </div>
            </div>
            <div class="loan-card-actions">
                <button class="btn btn-secondary" onclick="openEditModal(${i})"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                <button class="btn btn-danger" onclick="removeLoan(${i})"><i class="fa-solid fa-trash-can"></i> Delete</button>
            </div>
        </div>`;
    }).join("");
}

// Form Validation Helpers
function clearFieldValidation(field) {
    if (!field) return;
    field.classList.remove("is-invalid");
}

function setFieldInvalid(field, feedbackId, message) {
    if (!field) return;
    field.classList.add("is-invalid");
    if (feedbackId && message) {
        const feedbackEl = document.getElementById(feedbackId);
        if (feedbackEl) feedbackEl.textContent = message;
    }
}

function clearAllLoanModalValidation() {
    clearFieldValidation(document.getElementById("modalLoanName"));
    clearFieldValidation(document.getElementById("modalLoanEmi"));
    clearFieldValidation(document.getElementById("modalLoanRemaining"));
    clearFieldValidation(document.getElementById("modalLoanDue"));
}

// Modal Dialog Operations
function openAddModal() {
    clearAllLoanModalValidation();
    document.getElementById("modalTitle").innerHTML = '<i class="fa-solid fa-circle-plus"></i> Add New Loan';
    document.getElementById("modalLoanIndex").value = "-1";
    document.getElementById("modalLoanName").value = "";
    document.getElementById("modalLoanEmi").value = "";
    document.getElementById("modalLoanRemaining").value = "1";
    document.getElementById("modalLoanDue").value = "1";
    document.getElementById("loanModal").classList.add("active");
    document.getElementById("modalLoanName").focus();
}

function openEditModal(i) {
    const l = loans[i];
    if (!l) return;
    clearAllLoanModalValidation();
    document.getElementById("modalTitle").innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Loan';
    document.getElementById("modalLoanIndex").value = i;
    document.getElementById("modalLoanName").value = l.name;
    document.getElementById("modalLoanEmi").value = l.emi;
    document.getElementById("modalLoanRemaining").value = l.remaining;
    document.getElementById("modalLoanDue").value = l.due;
    document.getElementById("loanModal").classList.add("active");
    document.getElementById("modalLoanName").focus();
}

function closeModal() {
    clearAllLoanModalValidation();
    document.getElementById("loanModal").classList.remove("active");
}

function handleLoanFormSubmit(e) {
    if (e) e.preventDefault();

    const nameInput = document.getElementById("modalLoanName");
    const emiInput = document.getElementById("modalLoanEmi");
    const remainingInput = document.getElementById("modalLoanRemaining");
    const dueInput = document.getElementById("modalLoanDue");
    const indexInput = document.getElementById("modalLoanIndex");

    clearAllLoanModalValidation();

    let isValid = true;
    let firstInvalidField = null;

    // 1. Validate Loan Name
    const nameVal = nameInput ? nameInput.value.trim() : "";
    if (!nameVal) {
        setFieldInvalid(nameInput, "modalLoanNameFeedback", "Please enter a loan name.");
        isValid = false;
        if (!firstInvalidField) firstInvalidField = nameInput;
    }

    // 2. Validate Monthly EMI
    const emiVal = Number(emiInput ? emiInput.value : 0);
    if (!emiInput || !emiInput.value || isNaN(emiVal) || emiVal <= 0) {
        setFieldInvalid(emiInput, "modalLoanEmiFeedback", "Please enter a valid EMI amount (greater than ₹0).");
        isValid = false;
        if (!firstInvalidField) firstInvalidField = emiInput;
    }

    // 3. Validate Remaining Tenure
    const remainingVal = Number(remainingInput ? remainingInput.value : 0);
    if (!remainingInput || !remainingInput.value || isNaN(remainingVal) || remainingVal < 1 || !Number.isInteger(remainingVal)) {
        setFieldInvalid(remainingInput, "modalLoanRemainingFeedback", "Please enter remaining EMIs (at least 1).");
        isValid = false;
        if (!firstInvalidField) firstInvalidField = remainingInput;
    }

    // 4. Validate Due Date
    const dueVal = Number(dueInput ? dueInput.value : 0);
    if (!dueInput || !dueInput.value || isNaN(dueVal) || dueVal < 1 || dueVal > 31 || !Number.isInteger(dueVal)) {
        setFieldInvalid(dueInput, "modalLoanDueFeedback", "Please enter a valid day of the month between 1 and 31.");
        isValid = false;
        if (!firstInvalidField) firstInvalidField = dueInput;
    }

    if (!isValid) {
        if (firstInvalidField) firstInvalidField.focus();
        return;
    }

    const index = Number(indexInput ? indexInput.value : -1);

    historyStack.push(JSON.parse(JSON.stringify(loans)));

    if (index >= 0 && index < loans.length) {
        // Edit existing loan
        loans[index].name = nameVal;
        loans[index].emi = emiVal;
        loans[index].remaining = remainingVal;
        loans[index].due = dueVal;
        if (!loans[index].totalTenure || remainingVal > loans[index].totalTenure) {
            loans[index].totalTenure = remainingVal;
        }
        showToast('<i class="fa-solid fa-pen-to-square"></i> Loan updated successfully', "success");
    } else {
        // Add new loan
        loans.push({
            name: nameVal,
            remaining: remainingVal,
            totalTenure: remainingVal,
            emi: emiVal,
            due: dueVal,
            paidStatus: null
        });
        showToast('<i class="fa-solid fa-circle-plus"></i> Loan added successfully', "success");
    }

    closeModal();
    save(false);
}

function removeLoan(i) {
    const loanName = (loans[i] && loans[i].name) ? esc(loans[i].name) : "this loan";
    showConfirmModal(
        '<i class="fa-solid fa-triangle-exclamation"></i> Delete Loan',
        `Are you sure you want to delete <strong>${loanName}</strong>?<br><span style="font-size:12px; color:var(--text-muted);">This action will remove it from your active loans and payment schedule.</span>`,
        "Yes, Delete",
        "btn-danger",
        () => {
            historyStack.push(JSON.parse(JSON.stringify(loans)));
            loans.splice(i, 1);
            save(false);
            showToast('<i class="fa-solid fa-trash-can"></i> Loan deleted', "info");
        }
    );
}

function resetData() {
    showConfirmModal(
        '<i class="fa-solid fa-trash-can"></i> Reset & Clear All Data',
        `Are you sure you want to completely clear everything?<br><span style="font-size: 12px; color: var(--text-muted);">This will remove all loans, clear local database, unlink cloud sync ID, clear cache, and start 100% fresh.</span>`,
        "Yes, Clear Everything",
        "btn-danger",
        () => {
            // 1. Clear all local and session storage
            localStorage.clear();
            sessionStorage.clear();

            // 2. Clear browser cache storage
            if ('caches' in window) {
                caches.keys().then(keys => {
                    keys.forEach(key => caches.delete(key));
                }).catch(err => console.warn("Cache clear error:", err));
            }

            // 3. Reset all runtime state
            loans = [];
            historyStack = [];
            NPOINT_ID = null;
            API_URL = null;

            // 4. Remove URL query parameters or hashes if present
            if (window.location.search || window.location.hash) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            // 5. Update UI badge and re-render fresh state
            updateSyncBadge("local");
            render();
            showToast('<i class="fa-solid fa-broom"></i> All loans, cloud sync ID, and caches cleared', "info");
        }
    );
}

// Modal Event Listeners
window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        closeModal();
        closeSyncModal();
        closeConfirmModal();
    }
});

document.getElementById("loanModal").addEventListener("click", e => {
    if (e.target.id === "loanModal") closeModal();
});

document.getElementById("syncModal").addEventListener("click", e => {
    if (e.target.id === "syncModal") closeSyncModal();
});

document.getElementById("confirmModal").addEventListener("click", e => {
    if (e.target.id === "confirmModal") closeConfirmModal();
});

// App Initialization
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        checkAndSendDueNotifications();
    }
});

updateNotificationButtonState();
fetchCloudData();

