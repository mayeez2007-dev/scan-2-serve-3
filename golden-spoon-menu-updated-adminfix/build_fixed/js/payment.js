// ===================================
// Payment Page JavaScript
// ===================================

// ── Active order number (set after order is placed) ──
let _activeOrderNumber = null;
let _activeOrderTotals = null;

// Initialize payment page
document.addEventListener('DOMContentLoaded', function() {
    const cart = getCart();

    // Redirect to menu if cart is empty
    if (cart.length === 0) {
        alert('Your cart is empty!');
        window.location.href = 'menu.html';
        return;
    }

    // Prefill table number if available from QR URL or previous selection
    try {
        const params = new URLSearchParams(window.location.search);
        const tableFromUrl = params.get('table') || params.get('t');
        if (tableFromUrl) localStorage.setItem('restaurantTableNumber', tableFromUrl);
        const saved = localStorage.getItem('restaurantTableNumber') || '';
        const elTable = document.getElementById('table-number');
        if (elTable && saved) elTable.value = saved;
    } catch (e) {}

    displayOrderSummary();
    setupPaymentForm();
});

// ── Display order summary ──
function displayOrderSummary() {
    const cart = getCart();
    const container = document.getElementById('order-items');

    container.innerHTML = cart.map(item => {
        const extrasText = item.customization.extras.length > 0
            ? item.customization.extras.join(', ')
            : 'None';
        return `
            <div class="order-item">
                <div class="order-item-header">
                    <span class="order-item-name">${item.name} (x${item.quantity})</span>
                    <span class="order-item-price">${formatPrice(calculateItemTotal(item))}</span>
                </div>
                <div class="order-item-details">
                    <div>Spice Level: ${item.customization.spiceLevel}</div>
                    <div>Extras: ${extrasText}</div>
                </div>
            </div>`;
    }).join('');

    const totals = calculateCartTotals();
    document.getElementById('summary-subtotal').textContent = formatPrice(totals.subtotal);
    document.getElementById('summary-tax').textContent      = formatPrice(totals.tax);
    document.getElementById('summary-total').textContent    = formatPrice(totals.total);
}

// ── Setup payment form ──
function setupPaymentForm() {
    const form    = document.getElementById('payment-form');
    const tableEl = document.getElementById('table-number');
    if (tableEl) tableEl.addEventListener('input', () => tableEl.classList.remove('has-error'));

    form.addEventListener('submit', function(e) {
        e.preventDefault();

        const formData = {
            name:          document.getElementById('customer-name').value,
            phone:         document.getElementById('customer-phone').value,
            email:         document.getElementById('customer-email').value,
            tableNumber:   (document.getElementById('table-number')?.value || '').trim(),
            address: '', city: '', zip: '',
            paymentMethod: 'pending', // payment method chosen AFTER delivery
            notes:         document.getElementById('order-notes').value
        };

        if (!formData.tableNumber) {
            const tEl = document.getElementById('table-number');
            if (tEl) { tEl.classList.add('has-error'); tEl.focus(); }
            alert('Please enter your table number to confirm the order.');
            return;
        }

        try { localStorage.setItem('restaurantTableNumber', formData.tableNumber); } catch(e) {}

        const totals = calculateCartTotals();

        const order = {
            orderNumber:   generateOrderNumber(),
            items:         getCart(),
            tableNumber:   formData.tableNumber,
            customer:      formData,
            totals:        totals,
            timestamp:     new Date().toISOString(),
            status:        'Pending'
        };

        _activeOrderNumber = order.orderNumber;
        _activeOrderTotals = totals;

        saveOrder(order);

        try {
            if ('BroadcastChannel' in window) {
                const ch = new BroadcastChannel('restaurantOrdersChannel');
                ch.postMessage({ type: 'NEW_ORDER', orderNumber: order.orderNumber, timestamp: order.timestamp });
                ch.close();
            }
            localStorage.setItem('restaurantOrdersPing', String(Date.now()));
        } catch(e) { console.warn('Order notification broadcast failed', e); }

        clearCart();
        showConfirmation(order.orderNumber, totals);

        try { startDeliveryTimer(order.orderNumber); }
        catch(e) { console.warn('Delivery timer failed to start', e); }
    });
}

// ── Helpers ──
function generateOrderNumber() {
    return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function saveOrder(order) {
    let orders = localStorage.getItem('restaurantOrders');
    orders = orders ? JSON.parse(orders) : [];
    orders.push(order);
    localStorage.setItem('restaurantOrders', JSON.stringify(orders));
}

// ── Show confirmation modal ──
function showConfirmation(orderNumber, totals) {
    _activeOrderNumber = orderNumber;
    _activeOrderTotals = totals;

    document.getElementById('order-number').innerHTML = `
        <strong>Order Number:</strong><br>
        ${orderNumber}<br><br>
        <small>Keep this page open — payment will be collected after your order is served.</small>`;

    const tracker = document.getElementById('delivery-tracker');
    if (tracker) tracker.style.display = 'block';

    document.getElementById('confirmation-modal').classList.add('show');
}

function closeModal() {
    document.getElementById('confirmation-modal').classList.remove('show');
    window.location.href = 'index.html';
}


// ══════════════════════════════════════════════
// Delivery Timer + Admin Status Sync
// ══════════════════════════════════════════════
let deliveryTimerInterval = null;

function getAdminStatusForOrder(orderNumber) {
    try {
        const state = JSON.parse(localStorage.getItem('restaurantOrderAdminState') || '{}');
        const entry = state[orderNumber];
        if (!entry || !entry.status) return 'new';
        if (entry.status === 'ready') return 'out_for_delivery'; // back-compat
        return entry.status;
    } catch(e) { return 'new'; }
}

function adminStatusToLabel(s) {
    return {
        new:              'Order Received 📋',
        preparing:        'Preparing 👨‍🍳',
        out_for_delivery: 'Being Served 🍽️',
        delivered:        'Served ✅'
    }[s] || 'Preparing 👨‍🍳';
}

function startDeliveryTimer(orderNumber) {
    if (deliveryTimerInterval) { clearInterval(deliveryTimerInterval); deliveryTimerInterval = null; }

    const tracker    = document.getElementById('delivery-tracker');
    const timeEl     = document.getElementById('delivery-time');
    const labelEl    = document.getElementById('delivery-label');
    const statusEl   = document.getElementById('delivery-status');
    const estimateEl = document.getElementById('delivery-estimate');
    const progressEl = document.getElementById('delivery-progress');

    if (!tracker || !timeEl || !labelEl || !statusEl || !estimateEl || !progressEl) return;

    tracker.style.display = 'block';

    let expectedMinutes = 20 + Math.floor(Math.random() * 11);
    let expectedMs      = expectedMinutes * 60 * 1000;
    let endAt           = Date.now() + expectedMs;

    estimateEl.textContent = `${expectedMinutes} min`;
    statusEl.textContent   = adminStatusToLabel(getAdminStatusForOrder(orderNumber));

    let delayNotified  = false;
    let lastAdminStatus             = getAdminStatusForOrder(orderNumber);
    let timeReducedForOutForDelivery = false;
    let deliveredFinalized          = false;

    const closeBtn = document.getElementById('delay-notification-close');
    if (closeBtn) closeBtn.onclick = () => hideDelayNotification();

    function tick() {
        const now         = Date.now();
        const adminStatus = getAdminStatusForOrder(orderNumber);

        // Detect transition
        if (adminStatus !== lastAdminStatus) {
            lastAdminStatus = adminStatus;

            if (adminStatus === 'out_for_delivery' && !timeReducedForOutForDelivery) {
                timeReducedForOutForDelivery = true;
                const reducedMins = 5 + Math.floor(Math.random() * 6);
                expectedMs = reducedMins * 60 * 1000;
                endAt = Date.now() + expectedMs;
                estimateEl.textContent = `~${reducedMins} min`;
                delayNotified = false;
                progressEl.classList.remove('is-delayed');
            }

            // When delivered → show post-delivery payment section
            if (adminStatus === 'delivered') {
                showPostDeliveryPayment();
            }
        }

        statusEl.textContent = adminStatusToLabel(adminStatus);

        // Delivered: stop timer
        if (adminStatus === 'delivered') {
            if (!deliveredFinalized) {
                deliveredFinalized = true;
                clearInterval(deliveryTimerInterval);
                deliveryTimerInterval = null;
                hideDelayNotification();
            }
            timeEl.textContent  = '00:00';
            labelEl.textContent = 'Served! ✅';
            progressEl.style.setProperty('--progress', '1');
            progressEl.classList.remove('is-delayed');
            return;
        }

        const remaining = endAt - now;
        if (remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            timeEl.textContent  = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
            labelEl.textContent = 'Estimated arrival';
            const progress = Math.max(0, Math.min(1, 1 - (remaining / expectedMs)));
            progressEl.style.setProperty('--progress', String(progress));
            progressEl.classList.remove('is-delayed');
            return;
        }

        // Overtime / delayed
        const overtime = Math.abs(remaining);
        const dmins = Math.floor(overtime / 60000);
        const dsecs = Math.floor((overtime % 60000) / 1000);
        timeEl.textContent  = `+${String(dmins).padStart(2,'0')}:${String(dsecs).padStart(2,'0')}`;
        labelEl.textContent = 'Delayed by';
        if (adminStatus !== 'out_for_delivery') statusEl.textContent = 'Delayed ⏱️';
        progressEl.style.setProperty('--progress', '1');
        progressEl.classList.add('is-delayed');
        if (!delayNotified) { delayNotified = true; showDelayNotification(); }
    }

    tick();
    deliveryTimerInterval = setInterval(tick, 1000);

    // Real-time storage sync
    window.addEventListener('storage', function onAdminStatusChange(e) {
        if (e.key === 'restaurantOrderAdminState') tick();
        if (deliveredFinalized) window.removeEventListener('storage', onAdminStatusChange);
    });

    // BroadcastChannel sync
    try {
        if ('BroadcastChannel' in window) {
            const ch = new BroadcastChannel('restaurantOrdersChannel');
            ch.onmessage = function(msg) {
                if (!msg || !msg.data) return;
                // Admin status changes → update timer
                if (msg.data.type === 'ADMIN_STATUS_CHANGE') tick();
                // Admin verified / rejected payment → notify customer
                if (msg.data.type === 'PAYMENT_VERIFY_UPDATE' && msg.data.orderNumber === orderNumber) {
                    showPaymentVerifyBanner(msg.data.verifyStatus);
                }
                if (deliveredFinalized) ch.close();
            };
        }
    } catch(e) {}
}

// Show a banner on the payment page when admin verifies/rejects
function showPaymentVerifyBanner(verifyStatus) {
    try {
        const section = document.getElementById('post-delivery-payment');
        if (!section) return;
        let banner = document.getElementById('pay-verify-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'pay-verify-banner';
            banner.style.cssText = 'margin-top:1rem;padding:1rem 1.2rem;border-radius:14px;text-align:center;font-weight:700;font-size:1rem;';
            section.appendChild(banner);
        }
        if (verifyStatus === 'pay_verified') {
            banner.style.background = '#D1FAE5';
            banner.style.border     = '1.5px solid #6EE7B7';
            banner.style.color      = '#065F46';
            banner.textContent      = '✅ Your payment has been verified by the restaurant. Thank you!';
        } else if (verifyStatus === 'pay_rejected') {
            banner.style.background = '#FEE2E2';
            banner.style.border     = '1.5px solid #FCA5A5';
            banner.style.color      = '#991B1B';
            banner.textContent      = '❌ Payment could not be verified. Please contact staff.';
        }
        banner.style.display = 'block';
    } catch(e) {}
}

function showDelayNotification() {
    const box = document.getElementById('delay-notification');
    if (!box) return;
    box.classList.add('show');
    window.setTimeout(() => hideDelayNotification(), 9000);
}

function hideDelayNotification() {
    const box = document.getElementById('delay-notification');
    if (box) box.classList.remove('show');
}

// ══════════════════════════════════════════════
// Post-Delivery Payment Section
// ══════════════════════════════════════════════

let _selectedPaymentMethod = 'cod';

function showPostDeliveryPayment() {
    const section = document.getElementById('post-delivery-payment');
    if (!section || section.style.display !== 'none') return; // already shown

    // Fill amount
    const totals = _activeOrderTotals || {};
    const amount = totals.total || '0.00';
    const formatted = formatOrderPrice(amount);
    const el = document.getElementById('pdp-amount');
    if (el) el.textContent = formatted;

    // Fill UPI amount reminder
    const upiAmt = document.getElementById('upi-pay-amount');
    if (upiAmt) upiAmt.textContent = formatted;

    // Fill COD order reference
    const codRef = document.getElementById('cod-order-ref');
    if (codRef) {
        codRef.innerHTML = `
            <div style="font-size:0.88rem;color:var(--text-light);font-weight:700;margin-bottom:0.5rem;">Your Order Reference</div>
            <div style="font-family:var(--font-heading);font-size:1.1rem;font-weight:800;letter-spacing:1px;color:var(--primary-color);">${_activeOrderNumber || '—'}</div>`;
    }

    // Hide "Back to Home" button (only show after payment)
    const homeBtn = document.getElementById('back-home-btn');
    if (homeBtn) homeBtn.style.display = 'none';

    section.style.display = 'block';
    section.style.animation = 'slideInUp 0.45s ease';

    // Scroll into view
    setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

// Helper: format price with ₹ symbol
function formatOrderPrice(val) {
    const n = parseFloat(val || 0);
    if (typeof window.formatPrice === 'function') return window.formatPrice(n);
    return `₹${n.toFixed(2)}`;
}

// Select payment method tab
function selectPaymentMethod(method) {
    _selectedPaymentMethod = method;

    const codBtn    = document.getElementById('btn-cod');
    const onlineBtn = document.getElementById('btn-online');
    const codPanel    = document.getElementById('cod-panel');
    const onlinePanel = document.getElementById('online-panel');

    if (method === 'cod') {
        codBtn.classList.add('active');
        onlineBtn.classList.remove('active');
        codPanel.style.display    = 'block';
        onlinePanel.style.display = 'none';
    } else {
        onlineBtn.classList.add('active');
        codBtn.classList.remove('active');
        onlinePanel.style.display = 'block';
        codPanel.style.display    = 'none';
        // Reset to QR step
        showQRStep();
    }
}

// ── UPI Flow ──
function showQRStep() {
    document.getElementById('upi-step-1').classList.add('active');
    document.getElementById('upi-step-1').style.display = '';
    document.getElementById('upi-step-2').style.display = 'none';
    const div = document.getElementById('upi-divider');
    if (div) div.style.display = 'none';
}

function showTransactionStep() {
    // Show step 2
    const divider = document.getElementById('upi-divider');
    if (divider) divider.style.display = 'block';
    document.getElementById('upi-step-2').style.display = 'block';
    document.getElementById('upi-step-2').style.animation = 'slideInUp 0.35s ease';
    document.getElementById('upi-step-1').classList.remove('active');

    // Scroll to step 2
    setTimeout(() => {
        const s2 = document.getElementById('upi-step-2');
        if (s2) s2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
}

function backToQR() {
    document.getElementById('upi-step-2').style.display = 'none';
    const divider = document.getElementById('upi-divider');
    if (divider) divider.style.display = 'none';
    document.getElementById('upi-step-1').classList.add('active');
}

function validateTxnId(input) {
    const errEl = document.getElementById('txn-error');
    const val = (input.value || '').trim();
    if (errEl) errEl.style.display = val.length > 0 && val.length < 8 ? 'block' : 'none';
}

function copyUpiId() {
    const upiId = '7899944252@fam';
    try {
        navigator.clipboard.writeText(upiId).then(() => showCopyToast()).catch(() => fallbackCopy(upiId));
    } catch(e) { fallbackCopy(upiId); }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showCopyToast(); } catch(e) {}
    document.body.removeChild(ta);
}

function showCopyToast() {
    const toast = document.getElementById('upi-copy-toast');
    if (!toast) return;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Confirm Online Payment ──
function confirmOnlinePayment() {
    const txnInput = document.getElementById('txn-id-input');
    const errEl    = document.getElementById('txn-error');
    const txnId    = (txnInput?.value || '').trim();

    if (!txnId || txnId.length < 8) {
        if (errEl) errEl.style.display = 'block';
        txnInput?.focus();
        return;
    }

    if (errEl) errEl.style.display = 'none';

    // Save payment info to order
    savePaymentRecord({
        method: 'online_upi',
        transactionId: txnId,
        amount: _activeOrderTotals?.total || '0.00',
        paidAt: new Date().toISOString()
    });

    showPaymentSuccess('online', txnId);
}

// ── Confirm COD Payment ──
function confirmCODPayment() {
    savePaymentRecord({
        method: 'cod',
        transactionId: null,
        amount: _activeOrderTotals?.total || '0.00',
        paidAt: new Date().toISOString()
    });
    showPaymentSuccess('cod', null);
}

// ── Save payment record ──
function savePaymentRecord(paymentData) {
    try {
        const orders = JSON.parse(localStorage.getItem('restaurantOrders') || '[]');
        const idx = orders.findIndex(o => o.orderNumber === _activeOrderNumber);
        if (idx !== -1) {
            orders[idx].paymentRecord = paymentData;
            orders[idx].status = 'Paid';
        }
        localStorage.setItem('restaurantOrders', JSON.stringify(orders));

        // Also update admin state
        const adminState = JSON.parse(localStorage.getItem('restaurantOrderAdminState') || '{}');
        if (adminState[_activeOrderNumber]) {
            adminState[_activeOrderNumber].payment = paymentData;
            adminState[_activeOrderNumber].updatedAt = new Date().toISOString();
        }
        localStorage.setItem('restaurantOrderAdminState', JSON.stringify(adminState));

        // Broadcast update
        if ('BroadcastChannel' in window) {
            const ch = new BroadcastChannel('restaurantOrdersChannel');
            ch.postMessage({ type: 'PAYMENT_CONFIRMED', orderNumber: _activeOrderNumber, method: paymentData.method });
            ch.close();
        }
    } catch(e) { console.warn('Failed to save payment record', e); }
}

// ── Show Payment Success ──
function showPaymentSuccess(method, txnId) {
    // Close confirmation modal
    const confModal = document.getElementById('confirmation-modal');
    if (confModal) confModal.classList.remove('show');

    const totals    = _activeOrderTotals || {};
    const amount    = formatOrderPrice(totals.total || '0.00');
    const methodStr = method === 'cod' ? '💵 Cash on Delivery' : '📱 Online / UPI';
    const txnLine   = txnId ? `<div class="pay-success-row"><span>Transaction ID</span><strong>${txnId}</strong></div>` : '';

    const detailsEl = document.getElementById('pay-success-details');
    if (detailsEl) {
        detailsEl.innerHTML = `
            <div class="pay-success-row"><span>Order</span><strong>${_activeOrderNumber || '—'}</strong></div>
            <div class="pay-success-row"><span>Amount Paid</span><strong style="color:#10B981;">${amount}</strong></div>
            <div class="pay-success-row"><span>Method</span><strong>${methodStr}</strong></div>
            ${txnLine}
            <div class="pay-success-row"><span>Time</span><strong>${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</strong></div>`;
    }

    const successModal = document.getElementById('payment-success-modal');
    if (successModal) successModal.classList.add('show');

    // Redirect to feedback page after 3 seconds
    setTimeout(function() {
        window.location.href = 'feedback.html?from=payment&order=' + encodeURIComponent(_activeOrderNumber || '');
    }, 3000);
}

// ── Navigate to feedback with order number ──
function goToFeedback() {
    window.location.href = 'feedback.html?from=payment&order=' + encodeURIComponent(_activeOrderNumber || '');
}
