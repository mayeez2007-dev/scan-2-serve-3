// ===================================
// Management / Admin Dashboard
// - Reads existing orders + reviews from localStorage
// - Adds admin-only metadata in separate localStorage keys
// - Real-time notifications via storage event + polling fallback
//
// IMPORTANT:
// - Does NOT modify customer website pages/scripts
// - Does NOT mutate customer order objects; admin metadata stored separately
// ===================================

(function () {
  'use strict';

  // Storage keys used by existing customer website
  const ORDERS_KEY = 'restaurantOrders';
  const REVIEWS_KEY = 'restaurantReviews';

  // Admin-only keys (do NOT mutate customer order objects)
  const ADMIN_STATE_KEY = 'restaurantOrderAdminState';
  const ADMIN_SEEN_KEY = 'restaurantAdminSeenOrders';
  const STAFF_KEY = 'restaurantDeliveryStaff';
  const ADMIN_CLEAR_VIEW_KEY = 'restaurantAdminClearViewTs';

  // Defaults required by spec
  const DEFAULT_DELIVERY_STAFF = ['Server 1', 'Server 2', 'Server 3'];

  // UI
  const el = (id) => document.getElementById(id);
  const escHtml = (s) => escapeHtml(s); // alias used in payment tab

  // -------------------------------
  // Helpers
  // -------------------------------
  function safeJsonParse(raw, fallback) {
    try {
      const v = raw ? JSON.parse(raw) : fallback;
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  const formatDate = (ts) => formatDateTime(ts); // alias
  function formatDateTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  function msToClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  function normalizeStatus(order, adminState) {
    // Admin state wins
    if (adminState?.status) {
      // Back-compat: legacy "ready" maps to "out_for_delivery"
      if (adminState.status === 'ready') return 'out_for_delivery';
      return adminState.status;
    }

    const raw = (order?.status || '').toLowerCase();

    // Existing checkout uses: status: 'Pending'
    if (!raw || raw === 'pending') return 'new';

    if (raw.includes('prepar')) return 'preparing';
    if (raw.includes('out') && raw.includes('deliver')) return 'out_for_delivery';

    // Back-compat: legacy "ready" maps to "out_for_delivery"
    if (raw.includes('ready')) return 'out_for_delivery';

    if (raw.includes('deliver')) return 'delivered';

    return 'new';
  }

  function formatPrice(price) {
    // Prefer existing global helper (cart.js)
    if (typeof window.formatPrice === 'function') return window.formatPrice(price);
    return `₹${parseFloat(price || 0).toFixed(2)}`;
  }

  function clampStr(str, max) {
    const s = String(str ?? '');
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  }

  // -------------------------------
  // Storage (orders are owned by customer site)
  // -------------------------------
  function getOrders() {
    const all = safeJsonParse(localStorage.getItem(ORDERS_KEY), []);
    return Array.isArray(all) ? all : [];
  }

  function setOrders(orders) {
    // Used only by demo seeding
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }

  function getAdminState() {
    const v = safeJsonParse(localStorage.getItem(ADMIN_STATE_KEY), {});
    return v && typeof v === 'object' ? v : {};
  }

  function saveAdminState(state) {
    localStorage.setItem(ADMIN_STATE_KEY, JSON.stringify(state));
  }

  function getSeen() {
    const arr = safeJsonParse(localStorage.getItem(ADMIN_SEEN_KEY), []);
    return new Set(Array.isArray(arr) ? arr : []);
  }

  function saveSeen(set) {
    localStorage.setItem(ADMIN_SEEN_KEY, JSON.stringify(Array.from(set)));
  }

  function getStaff() {
    const arr = safeJsonParse(localStorage.getItem(STAFF_KEY), null);
    if (arr === null) return [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  }

  function saveStaff(arr) {
    localStorage.setItem(STAFF_KEY, JSON.stringify(arr));
  }


  function adminClearViewTimestamp() {
    const v = Number(localStorage.getItem(ADMIN_CLEAR_VIEW_KEY) || 0);
    return Number.isFinite(v) ? v : 0;
  }

  function setAdminClearViewTimestamp(ts) {
    localStorage.setItem(ADMIN_CLEAR_VIEW_KEY, String(ts));
  }

  // -------------------------------
  // Audio: subtle notification beep (no external assets)
  // -------------------------------
  function playNotificationSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = 'sine';
      o.frequency.value = 880;

      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.24);

      o.onended = () => {
        try { ctx.close(); } catch {}
      };
    } catch {
      // ignore
    }
  }

  // -------------------------------
  // Rendering
  // -------------------------------
  let timerInterval = null;
  let timerIndex = new Map(); // orderNumber -> { cardTimerEl, modalTimerEl? }

  function computeStats(ordersMerged) {
    const stats = {
      total: ordersMerged.length,
      new: 0,
      preparing: 0,
      out_for_delivery: 0,
      delivered: 0
    };

    ordersMerged.forEach((o) => {
      const k = o._status || 'new';
      stats[k] = (stats[k] || 0) + 1;
    });

    return stats;
  }

  // Compact row (for order cards)
  function buildItemRowCompact(item) {
    const qty = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    const total = price * qty;

    // Ensure image path matches the customer website items.
    const img = item.image || '';

    return `
      <div class="admin-item-row">
        <div class="admin-item-img" style="background-image:url('${escapeHtml(img)}')"></div>
        <div>
          <div class="admin-item-name">${escapeHtml(item.name || 'Item')}</div>
          <div class="admin-item-sub">Qty: ${qty} • ${formatPrice(price)}</div>
        </div>
        <div class="admin-item-price">${formatPrice(total)}</div>
      </div>
    `;
  }

  // Menu-style card (reuses the SAME classes from customer menu)
  function buildItemMenuCard(item) {
    const qty = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    const total = price * qty;

    const categoryDisplay = item.category || item.categoryDisplay || '';
    const ingredients = item.ingredients || '';

    return `
      <div class="menu-item admin-menu-item">
        <div class="menu-item-image" style="background-image: url('${escapeHtml(item.image || '')}');"></div>
        <div class="menu-item-content">
          <div class="menu-item-header">
            <h3 class="menu-item-title">${escapeHtml(item.name || 'Item')}</h3>
            <span class="menu-item-price">${formatPrice(price)}</span>
          </div>
          ${categoryDisplay ? `<div class=\"menu-item-category\">${escapeHtml(categoryDisplay)}</div>` : ''}
          <p class="menu-item-ingredients">
            <strong>Ordered:</strong> Qty ${qty} • <strong>Line total:</strong> ${formatPrice(total)}
          </p>
          ${ingredients ? `
            <p class="menu-item-ingredients">
              <strong>Ingredients:</strong> ${escapeHtml(ingredients)}
            </p>
          ` : ''}
        </div>
      </div>
    `;
  }

  function statusLabel(status) {
    return {
      new: 'New Order',
      preparing: 'Preparing',
      out_for_delivery: 'Ready to Serve',
      delivered: 'Served'
    }[status] || 'New Order';
  }

  // Status icon map
  function statusIcon(status) {
    return { new: '🆕', preparing: '👨‍🍳', out_for_delivery: '🍽️', delivered: '✅' }[status] || '📋';
  }

  function buildOrderCard(order, staff) {
    const customer = order.customer || {};
    const state = order._adminState || {};

    const createdAt = order.timestamp || order._createdAt || new Date().toISOString();
    const createdMs = new Date(createdAt).getTime();

    const assignedDelivery = state.assignedDelivery || state.assignedTo || '';

    const items = Array.isArray(order.items) ? order.items : [];
    const preview = items.slice(0, 3);
    const moreCount = Math.max(0, items.length - preview.length);

    const totalPrice = order?.totals?.total ?? order?._computedTotal ?? '0.00';

    const nextActionMap = {
      new:              { label: '👨‍🍳 Start Preparing',  to: 'preparing' },
      preparing:        { label: '🍽️ Ready to Serve',    to: 'out_for_delivery' },
      out_for_delivery: { label: '✅ Mark as Served',    to: 'delivered' },
      delivered:        null
    };
    const nextAction = nextActionMap[order._status] || null;

    const staffOptions = ['<option value="">Assign server…</option>']
      .concat(staff.map((n) => `<option value="${escapeHtml(n)}" ${n === assignedDelivery ? 'selected' : ''}>${escapeHtml(n)}</option>`))
      .join('');

    const tableNumber = customer.tableNumber || order.tableNumber || '';
    const tableLabel  = tableNumber ? `Table ${tableNumber}` : 'Table —';
    const deliveryIcon = assignedDelivery ? '🚴' : '⚠️';

    return `
      <article class="admin-order-card" data-order="${escapeHtml(order.orderNumber)}" data-status="${escapeHtml(order._status)}">
        <div class="admin-order-top">
          <div style="flex:1;min-width:0;">
            <div class="admin-order-title">${statusIcon(order._status)} ${escapeHtml(order.orderNumber)}</div>
            <div class="admin-order-meta"><span class="meta-icon">👤</span> ${escapeHtml(customer.name || 'Customer')}</div>
            <div class="admin-order-meta"><span class="meta-icon">📱</span> ${escapeHtml(customer.phone || '—')}</div>
            <div class="admin-order-meta"><span class="meta-icon">🪑</span> ${escapeHtml(tableLabel)}</div>
            <div class="admin-order-meta"><span class="meta-icon">🕐</span> ${escapeHtml(formatDateTime(createdAt))}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;flex-shrink:0;">
            <span class="admin-pill" data-status="${escapeHtml(order._status)}">${escapeHtml(statusLabel(order._status))}</span>
            <span class="admin-pill admin-pill-outline" data-role="timer" data-created="${createdMs}">00:00</span>
          </div>
        </div>

        <div class="admin-order-items">
          ${preview.map(buildItemRowCompact).join('')}
          ${moreCount ? `<div class="admin-item-sub" style="padding:0.2rem 0;">+${moreCount} more item${moreCount === 1 ? '' : 's'}</div>` : ''}
        </div>

        <div class="admin-order-bottom">
          <div class="admin-order-total-info">
            <div class="admin-item-sub"><strong>Total:</strong> ${formatPrice(totalPrice)}</div>
            <div class="admin-item-sub">${deliveryIcon} ${escapeHtml(assignedDelivery || 'Unassigned')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end;">
            <div class="admin-order-actions">
              <button class="btn btn-primary admin-mini-btn" type="button" data-action="view">🔍 View</button>
              ${nextAction ? `<button class="btn btn-secondary admin-mini-btn" type="button" data-action="next" data-next="${nextAction.to}">${escapeHtml(nextAction.label)}</button>` : ''}
            </div>
            <div class="admin-assign">
              <select data-action="assign-delivery" aria-label="Assign server">${staffOptions}</select>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function mergeOrders(rawOrders, adminState) {
    const cutoff = adminClearViewTimestamp();

    return rawOrders
      .filter((o) => {
        // Admin Clear View hides orders created before timestamp (admin-only)
        if (!cutoff) return true;
        const t = new Date(o.timestamp || 0).getTime();
        return !Number.isFinite(t) || t >= cutoff;
      })
      .map((o) => {
        const state = adminState[o.orderNumber] || null;

        // Compute total fallback
        let computedTotal = 0;
        try {
          (o.items || []).forEach((it) => {
            const qty = Number(it.quantity || 1);
            computedTotal += (Number(it.price || 0) * qty);
          });
          // mimic existing cart tax logic (5%) if totals missing
          if (!o.totals?.total) {
            const tax = computedTotal * 0.05;
            computedTotal = computedTotal + tax;
          }
        } catch {}

        const status = normalizeStatus(o, state);

        return {
          ...o,
          _status: status,
          _adminState: state,
          _createdAt: o.timestamp,
          _computedTotal: computedTotal.toFixed(2)
        };
      });
  }

  function renderBoard() {
    const rawOrders = getOrders();
    const adminState = getAdminState();
    const staff = getStaff();

    const search = (el('admin-search')?.value || '').trim().toLowerCase();

    let merged = mergeOrders(rawOrders, adminState);

    // Search
    if (search) {
      merged = merged.filter((o) => {
        const c = o.customer || {};
        return [
          o.orderNumber,
          c.name,
          c.phone,
          c.tableNumber,
          o.tableNumber,
          c.address,
          c.city,
          String(o?.totals?.total || ''),
          String(o?._computedTotal || ''),
          o?._adminState?.assignedDelivery,
          o?._adminState?.assignedTo
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search));
      });
    }

    // Newest first
    merged.sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return (tb || 0) - (ta || 0);
    });

    // Columns
    const cols = {
      new: el('orders-new'),
      preparing: el('orders-preparing'),
      out_for_delivery: el('orders-out'),
      delivered: el('orders-delivered')
    };

    Object.values(cols).forEach((node) => {
      if (node) node.innerHTML = '';
    });

    // Build HTML
    const grouped = { new: [], preparing: [], out_for_delivery: [], delivered: [] };
    merged.forEach((o) => {
      (grouped[o._status] || grouped.new).push(o);
    });

    cols.new.innerHTML = grouped.new.map((o) => buildOrderCard(o, staff)).join('');
    cols.preparing.innerHTML = grouped.preparing.map((o) => buildOrderCard(o, staff)).join('');
    cols.out_for_delivery.innerHTML = grouped.out_for_delivery.map((o) => buildOrderCard(o, staff)).join('');
    cols.delivered.innerHTML = grouped.delivered.map((o) => buildOrderCard(o, staff)).join('');

    // Counts
    el('count-new').textContent = String(grouped.new.length);
    el('count-preparing').textContent = String(grouped.preparing.length);
    el('count-out').textContent = String(grouped.out_for_delivery.length);
    el('count-delivered').textContent = String(grouped.delivered.length);

    const stats = computeStats(mergeOrders(rawOrders, adminState));
    el('stat-total').textContent = String(stats.total);
    el('stat-new').textContent = String(stats.new);
    el('stat-preparing').textContent = String(stats.preparing);
    el('stat-out').textContent = String(stats.out_for_delivery);
    el('stat-delivered').textContent = String(stats.delivered);

    // Empty state
    const empty = el('admin-empty');
    if (empty) {
      empty.style.display = rawOrders.length ? 'none' : 'block';
    }

    // Wire events
    wireBoardActions();

    // Re-index timers
    indexTimers();
  }

  function indexTimers() {
    timerIndex.clear();
    document.querySelectorAll('[data-role="timer"]').forEach((node) => {
      const card = node.closest('.admin-order-card');
      const orderNumber = card?.getAttribute('data-order');
      if (!orderNumber) return;
      timerIndex.set(orderNumber, {
        cardTimerEl: node
      });
    });

    // Keep modal timer synced if open
    const modal = el('admin-modal');
    if (modal && modal.classList.contains('show')) {
      const orderNumber = modal.getAttribute('data-order') || '';
      const index = timerIndex.get(orderNumber);
      if (index) {
        index.modalTimerEl = el('modal-timer');
      }
    }
  }

  function tickTimers() {
    const now = Date.now();
    timerIndex.forEach((refs) => {
      const createdMs = Number(refs.cardTimerEl?.getAttribute('data-created') || 0);
      if (!createdMs) return;
      const elapsed = now - createdMs;
      const clock = msToClock(elapsed);
      if (refs.cardTimerEl) refs.cardTimerEl.textContent = clock;
      if (refs.modalTimerEl) refs.modalTimerEl.textContent = clock;
    });
  }

  // -------------------------------
  // Modal
  // -------------------------------
  function openModal(orderNumber) {
    const rawOrders = getOrders();
    const adminState = getAdminState();
    const staff = getStaff();

    const merged = mergeOrders(rawOrders, adminState);
    const order = merged.find((o) => o.orderNumber === orderNumber);
    if (!order) return;

    const state = order._adminState || {};

    const modal = el('admin-modal');
    modal.setAttribute('data-order', orderNumber);

    el('modal-title').textContent = `Order Details • ${orderNumber}`;
    el('modal-subtitle').textContent = formatDateTime(order.timestamp);
    el('modal-status').textContent = statusLabel(order._status);

    const customer = order.customer || {};

    const itemsHtml = (order.items || []).map(buildItemMenuCard).join('');

    const totals = order.totals || {};
    const subtotal = totals.subtotal ?? '';
    const tax = totals.tax ?? '';
    const total = totals.total ?? order._computedTotal ?? '0.00';

    const assignedDelivery = state.assignedDelivery || state.assignedTo || '';

    const staffOptions = ['<option value="">— Not Assigned —</option>']
      .concat(staff.map((n) => `<option value="${escapeHtml(n)}" ${n === assignedDelivery ? 'selected' : ''}>${escapeHtml(n)}</option>`))
      .join('');

    const statusOptions = [
      { v: 'new',              t: 'New Order' },
      { v: 'preparing',        t: 'Preparing' },
      { v: 'out_for_delivery', t: 'Ready to Serve' },
      { v: 'delivered',        t: 'Served' }
    ]
      .map((s) => `<option value="${s.v}" ${s.v === order._status ? 'selected' : ''}>${s.t}</option>`)
      .join('');

    el('modal-body').innerHTML = `
      <div class="admin-panel">
        <h3>Ordered Items</h3>
        <div class="admin-order-items">${itemsHtml}</div>

        <div class="admin-kv" style="margin-top:0.9rem;">
          <div class="admin-kv-row"><span>Subtotal</span><strong>${subtotal ? formatPrice(subtotal) : '—'}</strong></div>
          <div class="admin-kv-row"><span>Tax</span><strong>${tax ? formatPrice(tax) : '—'}</strong></div>
          <div class="admin-kv-row"><span>Total</span><strong>${formatPrice(total)}</strong></div>
        </div>
      </div>

      <div class="admin-panel">
        <h3>Customer Details</h3>
        <div class="admin-kv">
          <div class="admin-kv-row"><span>Name</span><strong>${escapeHtml(customer.name || '—')}</strong></div>
          <div class="admin-kv-row"><span>Phone</span><strong>${escapeHtml(customer.phone || '—')}</strong></div>
          <div class="admin-kv-row"><span>Table Number</span><strong>${escapeHtml(customer.tableNumber || order.tableNumber || '—')}</strong></div>
          <div class="admin-kv-row"><span>Notes</span><strong>${escapeHtml(customer.notes || customer?.orderNotes || customer?.specialInstructions || order?.customer?.notes || '—')}</strong></div>
        </div>

        <div class="admin-modal-actions">
          <select id="modal-status-select" aria-label="Update status">${statusOptions}</select>
          <select id="modal-assign-select" aria-label="Assign server">${staffOptions}</select>
          <button id="modal-save" class="btn btn-primary" type="button">Save</button>
        </div>
      </div>
    `;

    // Hook modal timer
    const index = timerIndex.get(orderNumber);
    if (index) index.modalTimerEl = el('modal-timer');

    // Show
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');

    // Close actions
    el('admin-modal-close').onclick = closeModal;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    }, { once: true });

    // Save
    const saveBtn = el('modal-save');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const newStatus = el('modal-status-select')?.value || order._status;
        const delivery = el('modal-assign-select')?.value || '';

        applyAdminPatch(orderNumber, {
          status: newStatus,
          assignedDelivery: delivery
        });

        closeModal();
      };
    }
  }

  function closeModal() {
    const modal = el('admin-modal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');

    // Unhook modal timer
    const orderNumber = modal.getAttribute('data-order') || '';
    const index = timerIndex.get(orderNumber);
    if (index) index.modalTimerEl = null;
  }

  // -------------------------------
  // Admin state mutation (separate from orders)
  // -------------------------------
  function applyAdminPatch(orderNumber, patch) {
    const state = getAdminState();
    const prev = state[orderNumber] || {};
    const prevStatus = prev.status;

    // Backwards-compatible: keep assignedTo in sync for older code paths
    const next = {
      ...prev,
      ...patch,
      assignedTo: (patch.assignedDelivery !== undefined) ? (patch.assignedDelivery || '') : (prev.assignedTo || ''),
      updatedAt: new Date().toISOString()
    };

    state[orderNumber] = next;
    saveAdminState(state);

    // Broadcast status change so the customer payment page can react in real-time
    // (BroadcastChannel reaches same-origin tabs that missed the storage event)
    try {
      if ('BroadcastChannel' in window) {
        const ch = new BroadcastChannel('restaurantOrdersChannel');
        ch.postMessage({
          type: 'ADMIN_STATUS_CHANGE',
          orderNumber: orderNumber,
          status: next.status,
          timestamp: next.updatedAt
        });
        ch.close();
      }
    } catch (e) {
      // non-critical
    }

    // Notification rule:
    // When kitchen finishes preparing (Preparing -> Out for Delivery), show required popup.
    if (patch.status && patch.status === 'out_for_delivery' && prevStatus === 'preparing') { // Ready to Serve
      try {
        const order = getOrders().find((o) => o.orderNumber === orderNumber);
        if (order) showReadyOutForDeliveryNotification(order, next);
      } catch {}
    }

    // Show big delivery success popup when an order is marked as Delivered
    if (patch.status && patch.status === 'delivered') {
      try {
        const order = getOrders().find((o) => o.orderNumber === orderNumber);
        if (order) showDeliveredPopup(order, next);
      } catch {}
    }

    renderBoard();
  }

  // -------------------------------
  // Board actions  (BUG FIX: use onclick only — innerHTML already
  // replaces nodes so no duplicate-listener risk; but guard with
  // data-wired to be safe against future partial updates)
  // -------------------------------
  function wireBoardActions() {
    document.querySelectorAll('.admin-order-card').forEach((card) => {
      // Prevent double-wiring in case DOM node is reused
      if (card.dataset.wired === '1') return;
      card.dataset.wired = '1';

      const orderNumber = card.getAttribute('data-order');
      if (!orderNumber) return;

      const viewBtn = card.querySelector('[data-action="view"]');
      const nextBtn = card.querySelector('[data-action="next"]');
      const delSel  = card.querySelector('select[data-action="assign-delivery"]');

      if (viewBtn) {
        viewBtn.onclick = (e) => { e.stopPropagation(); openModal(orderNumber); };
      }

      if (nextBtn) {
        nextBtn.onclick = (e) => {
          e.stopPropagation();
          const to = nextBtn.getAttribute('data-next') || 'preparing';
          applyAdminPatch(orderNumber, { status: to });
        };
      }

      if (delSel) {
        delSel.onchange = (e) => {
          e.stopPropagation();
          applyAdminPatch(orderNumber, { assignedDelivery: delSel.value || '' });
        };
        // Prevent card click when interacting with select
        delSel.onclick = (e) => e.stopPropagation();
      }

      // Clicking card background opens details
      card.onclick = (e) => {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'button' || tag === 'select' || tag === 'option') return;
        if (e.target?.closest?.('button,select')) return;
        openModal(orderNumber);
      };
    });
  }

  // -------------------------------
  // Notifications
  // -------------------------------
  function showNotification(order) {
    const wrap = el('admin-notifications');
    if (!wrap) return;

    const customer = order.customer || {};
    const items = (order.items || []).slice(0, 2);
    const itemText = items.map((i) => `${i.name} x${i.quantity}`).join(', ');

    const node = document.createElement('div');
    node.className = 'admin-notify';
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.innerHTML = `
      <div class="admin-notify-inner">
        <div class="admin-notify-title">New Order Received • ${escapeHtml(order.orderNumber)}</div>
        <div class="admin-notify-sub">${escapeHtml(customer.name || 'Customer')} • ${escapeHtml(customer.phone || '—')}</div>
        <div class="admin-notify-hint">${escapeHtml(itemText || 'Click to view details')}</div>
      </div>
    `;

    function open() {
      openModal(order.orderNumber);
      node.remove();
    }

    node.onclick = open;
    node.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    };

    wrap.appendChild(node);
    playNotificationSound();

    // Auto remove
    window.setTimeout(() => {
      if (node && node.parentNode) node.remove();
    }, 12000);
  }

  // Spec requirement: when kitchen finishes preparing
  // show popup: “Order is out for delivery.”
  // and display: assigned delivery boy name, order details, order time
  function showReadyOutForDeliveryNotification(order, adminState) {
    const wrap = el('admin-notifications');
    if (!wrap) return;

    const delivery = adminState?.assignedDelivery || adminState?.assignedTo || 'Unassigned';
    const createdAt = order.timestamp || new Date().toISOString();
    const orderTime = formatDateTime(createdAt);

    const items = (order.items || []).slice(0, 3);
    const itemText = items.map((i) => `${i.name} x${i.quantity}`).join(', ');

    const node = document.createElement('div');
    node.className = 'admin-notify admin-notify-ready';
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.innerHTML = `
      <div class="admin-notify-inner">
        <div class="admin-notify-title">Order is Ready to Serve! 🍽️</div>
        <div class="admin-notify-sub">${escapeHtml(order.orderNumber)} • ${escapeHtml(orderTime || '')}</div>
        <div class="admin-notify-hint"><strong>Delivery:</strong> ${escapeHtml(delivery)}</div>
        <div class="admin-notify-hint"><strong>Order:</strong> ${escapeHtml(itemText || '—')}</div>
        <div class="admin-notify-hint">Click to view full details</div>
      </div>
    `;

    function open() {
      openModal(order.orderNumber);
      node.remove();
    }

    node.onclick = open;
    node.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    };

    wrap.appendChild(node);
    playNotificationSound();

    window.setTimeout(() => {
      if (node && node.parentNode) node.remove();
    }, 14000);
  }

  // ─── BIG Delivery Success Popup ───
  function showDeliveredPopup(order, adminState) {
    const overlay = document.getElementById('delivery-success-overlay');
    if (!overlay) return;

    const customer    = order.customer || {};
    const tableNumber = customer.tableNumber || order.tableNumber || '\u2014';
    const delivery    = adminState?.assignedDelivery || adminState?.assignedTo || 'Staff';
    const orderTime   = formatDateTime(order.timestamp || new Date().toISOString());
    const totalPrice  = order?.totals?.total ?? order?._computedTotal ?? '0.00';
    const items       = (order.items || []).slice(0, 3);
    const itemsText   = items.map((i) => `${escapeHtml(i.name)} ×${i.quantity}`).join(', ');

    const subtitleEl = document.getElementById('ds-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = `Order ${order.orderNumber} delivered to ${tableNumber !== '\u2014' ? 'Table ' + tableNumber : 'the customer'}.`;
    }

    const detailsEl = document.getElementById('ds-details');
    if (detailsEl) {
      detailsEl.innerHTML = `
        <div class="delivery-success-detail-row"><span>\u1FA91 Table</span><strong>${escapeHtml(String(tableNumber))}</strong></div>
        <div class="delivery-success-detail-row"><span>\uD83D\uDC64 Customer</span><strong>${escapeHtml(customer.name || '\u2014')}</strong></div>
        <div class="delivery-success-detail-row"><span>\uD83D\uDEB4 Delivered by</span><strong>${escapeHtml(delivery)}</strong></div>
        <div class="delivery-success-detail-row"><span>\uD83D\uDD50 Order Time</span><strong>${escapeHtml(orderTime)}</strong></div>
        <div class="delivery-success-detail-row"><span>\uD83D\uDCB0 Total</span><strong>${formatPrice(totalPrice)}</strong></div>
        ${itemsText ? `<div class="delivery-success-detail-row" style="flex-direction:column;gap:0.15rem;"><span>\uD83C\uDF7D Items</span><strong style="text-align:left;font-size:0.83rem;">${itemsText}</strong></div>` : ''}
      `;
    }

    // Reset & restart progress bar
    const bar = document.getElementById('ds-progress-bar');
    if (bar) {
      bar.style.animation = 'none';
      void bar.offsetHeight; // force reflow
      bar.style.animation = '';
    }

    // Inject confetti dots
    const box = document.getElementById('delivery-success-box');
    if (box) {
      box.querySelectorAll('.confetti-dot').forEach((d) => d.remove());
      const colors = ['#10B981','#F59E0B','#3B82F6','#F97316','#8B5CF6','#EC4899'];
      for (let i = 0; i < 18; i++) {
        const dot = document.createElement('div');
        dot.className = 'confetti-dot';
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size  = 6 + Math.floor(Math.random() * 6);
        dot.style.cssText = [
          `left:${Math.random() * 100}%`,
          `top:${Math.random() * 40}%`,
          `background:${color}`,
          `animation-delay:${(Math.random() * 0.6).toFixed(2)}s`,
          `animation-duration:${(0.9 + Math.random() * 0.6).toFixed(2)}s`,
          `width:${size}px`,
          `height:${size}px`,
          `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`
        ].join(';');
        box.appendChild(dot);
      }
    }

    // Show overlay
    overlay.classList.add('show');
    playNotificationSound();

    // Close on backdrop click
    const closeOnBackdrop = (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
        overlay.removeEventListener('click', closeOnBackdrop);
      }
    };
    overlay.addEventListener('click', closeOnBackdrop);

    // Auto-dismiss after 5 seconds
    window.setTimeout(() => {
      if (overlay.classList.contains('show')) {
        overlay.classList.remove('show');
        overlay.removeEventListener('click', closeOnBackdrop);
      }
    }, 5000);
  }

  function detectNewOrdersAndNotify() {
    const orders = getOrders();
    const seen = getSeen();
    const adminState = getAdminState();

    // newest first
    const sorted = [...orders].sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return (tb || 0) - (ta || 0);
    });

    // Notify for unseen orders only
    sorted.forEach((o) => {
      if (!o?.orderNumber) return;
      if (seen.has(o.orderNumber)) return;

      // Initialize admin state on first encounter
      if (!adminState[o.orderNumber]) {
        adminState[o.orderNumber] = {
          status: 'new',
          assignedDelivery: '',
          // keep compatibility
          assignedTo: '',
          createdAt: o.timestamp || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      // Only popup for truly "new" status
      const mergedStatus = normalizeStatus(o, adminState[o.orderNumber]);
      if (mergedStatus === 'new') {
        showNotification(o);
      }

      seen.add(o.orderNumber);
    });

    saveAdminState(adminState);
    saveSeen(seen);
  }

  // -------------------------------
  // Feedback monitoring
  // -------------------------------
  function computeReviewsAverage(reviews) {
    if (!reviews.length) return { avg: 0, count: 0 };
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return { avg: sum / reviews.length, count: reviews.length };
  }

  function starsHtml(rating) {
    const r = Math.max(1, Math.min(5, Number(rating) || 0));
    return `
      <span class="review-stars" aria-label="${r} out of 5 stars" data-rating="${r}">
        ${Array.from({ length: 5 }).map((_, i) => {
          const filled = i < r ? 'filled' : '';
          return `<span class="review-star ${filled}" aria-hidden="true">★</span>`;
        }).join('')}
      </span>
    `;
  }

  function renderFeedback() {
    const raw = safeJsonParse(localStorage.getItem(REVIEWS_KEY), []);
    const reviews = Array.isArray(raw) ? raw : [];

    const { avg, count } = computeReviewsAverage(reviews);
    const avgFixed = avg ? avg.toFixed(1) : '0.0';

    const totalEl = el('reviews-total');
    const avgEl = el('reviews-avg');
    if (totalEl) totalEl.textContent = String(count);
    if (avgEl) avgEl.textContent = avgFixed;

    const list = el('admin-reviews');
    if (!list) return;

    if (!reviews.length) {
      list.innerHTML = `
        <div class="reviews-empty scroll-reveal">
          <div class="reviews-empty-icon">✍️</div>
          <h4>No feedback yet</h4>
          <p>Customer reviews will appear here automatically.</p>
        </div>
      `;
      return;
    }

    const ordered = [...reviews].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    list.innerHTML = ordered.map((r) => {
      const safeName = (r.name || 'Guest').toString().slice(0, 60);
      const safeMsg = (r.message || '').toString().slice(0, 800);
      const date = r.createdAt ? formatDateTime(r.createdAt) : '';

      return `
        <article class="review-card scroll-reveal">
          <header class="review-card-header">
            <div class="review-card-meta">
              <div class="reviewer-name">${escapeHtml(safeName)}</div>
              <div class="review-date">${escapeHtml(date)}</div>
            </div>
            ${starsHtml(r.rating)}
          </header>
          <div class="review-message">${escapeHtml(safeMsg)}</div>
        </article>
      `;
    }).join('');
  }

  // -------------------------------
  // Delivery staff UI
  // -------------------------------
  function renderStaff() {
    const list = el('delivery-list');
    if (!list) return;

    const staff = getStaff();

    list.innerHTML = staff
      .map((name) => {
        return `
          <span class="admin-chip">${escapeHtml(name)}
            <button type="button" data-remove="${escapeHtml(name)}" aria-label="Remove ${escapeHtml(name)}">×</button>
          </span>
        `;
      })
      .join('');

    list.querySelectorAll('button[data-remove]').forEach((btn) => {
      btn.onclick = () => {
        const n = btn.getAttribute('data-remove') || '';
        const next = getStaff().filter((x) => x !== n);
        saveStaff(next);
        renderStaff();
        renderBoard();
      };
    });
  }

  function setupStaffControls() {
    const input = el('delivery-name');
    const addBtn = el('add-delivery');

    if (!input || !addBtn) return;

    function add() {
      const name = (input.value || '').trim();
      if (!name) return;

      const staff = getStaff();
      if (!staff.includes(name)) staff.push(name);
      saveStaff(staff);
      input.value = '';
      renderStaff();
      renderBoard();

      if (typeof window.showToast === 'function') {
        window.showToast('Serving staff added');
      }
    }

    addBtn.onclick = add;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // PAYMENTS TAB — render + verify modal
  // ═══════════════════════════════════════════════════════

  /**
   * Get the effective payment status for an order.
   * Tiers: pay_verified → pay_rejected → pay_submitted → pending_payment → no_payment
   */
  function getPayStatus(order, adminEntry) {
    const rec = order.paymentRecord || (adminEntry && adminEntry.payment);
    if (!rec) return 'no_payment'; // order not yet delivered or no payment initiated
    return rec.verifyStatus || 'pay_submitted';
  }

  function payStatusLabel(st) {
    switch (st) {
      case 'pay_verified':  return { label: '✅ Verified',    cls: 'pill-verified',  cardCls: 'pay-card-verified' };
      case 'pay_rejected':  return { label: '❌ Rejected',    cls: 'pill-rejected',  cardCls: 'pay-card-rejected' };
      case 'pay_submitted': return { label: '📨 Submitted',   cls: 'pill-submitted', cardCls: 'pay-card-submitted' };
      case 'pending_payment': return { label: '⏳ Awaiting',  cls: 'pill-pending',   cardCls: 'pay-card-pending' };
      default:              return { label: '—',              cls: 'pill-awaiting',  cardCls: '' };
    }
  }

  function methodInfo(method) {
    if (method === 'cod')        return { icon: '💵', label: 'Cash on Delivery', chipCls: 'pay-chip-cod',    iconCls: 'pay-card-icon-cod' };
    if (method === 'online_upi') return { icon: '📱', label: 'Online / UPI',     chipCls: 'pay-chip-online', iconCls: 'pay-card-icon-online' };
    return                              { icon: '💳', label: 'Pending',           chipCls: 'pay-chip-none',   iconCls: 'pay-card-icon-none' };
  }

  function renderPayments() {
    const orders     = getOrders();
    const adminState = getAdminState();

    // --- stats ---
    let verified = 0, pending = 0, cod = 0, online = 0, revenue = 0;
    orders.forEach((o) => {
      const ae  = adminState[o.orderNumber] || {};
      const rec = o.paymentRecord || ae.payment;
      if (!rec) {
        // delivered but no payment yet
        if ((ae.status || o.status) === 'delivered') pending++;
        return;
      }
      const vs = rec.verifyStatus || 'pay_submitted';
      if (vs === 'pay_verified')  { verified++; revenue += (parseFloat(o.totals?.total || o._computedTotal || 0)); }
      if (vs === 'pay_submitted') pending++;
      if (rec.method === 'cod')        cod++;
      if (rec.method === 'online_upi') online++;
    });

    const sv = (id, val) => { const e = el(id); if (e) e.textContent = val; };
    sv('pstat-verified', verified);
    sv('pstat-pending',  pending);
    sv('pstat-cod',      cod);
    sv('pstat-online',   online);
    sv('pstat-revenue',  formatPrice(revenue));
    sv('stat-pay-verified', verified);
    sv('stat-pay-pending',  pending);

    // --- filter & search ---
    const filterSel = el('pay-filter-status');
    const searchEl  = el('pay-search');
    const filterVal = filterSel ? filterSel.value : 'all';
    const searchVal = searchEl  ? searchEl.value.trim().toLowerCase() : '';

    // Collect displayable records (delivered orders + any with paymentRecord)
    const rows = orders.filter((o) => {
      const ae  = adminState[o.orderNumber] || {};
      const delivStatus = ae.status || o.status || '';
      const rec = o.paymentRecord || ae.payment;
      // Show if delivered (waiting for payment) OR if there's a payment record
      return (delivStatus === 'delivered') || !!rec;
    });

    // Apply filter
    const filtered = rows.filter((o) => {
      const ae  = adminState[o.orderNumber] || {};
      const rec = o.paymentRecord || ae.payment;
      const vs  = rec ? (rec.verifyStatus || 'pay_submitted') : 'pending_payment';
      if (filterVal !== 'all' && vs !== filterVal) return false;
      if (searchVal) {
        const haystack = [
          o.orderNumber, o.customer?.name || o.customerName, o.customer?.phone || o.phone,
          rec && rec.transactionId
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(searchVal)) return false;
      }
      return true;
    });

    const listEl  = el('pay-list');
    const emptyEl = el('pay-empty');
    if (!listEl) return;

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    // Sort: submitted first, then pending, then verified/rejected
    const sortOrder = { pay_submitted: 0, pending_payment: 1, pay_verified: 2, pay_rejected: 3, no_payment: 4 };
    filtered.sort((a, b) => {
      const ae = adminState[a.orderNumber] || {}, be = adminState[b.orderNumber] || {};
      const ar = a.paymentRecord || ae.payment, br = b.paymentRecord || be.payment;
      const as = ar ? (ar.verifyStatus || 'pay_submitted') : 'pending_payment';
      const bs = br ? (br.verifyStatus || 'pay_submitted') : 'pending_payment';
      return (sortOrder[as] || 99) - (sortOrder[bs] || 99);
    });

    listEl.innerHTML = filtered.map((o) => {
      const ae  = adminState[o.orderNumber] || {};
      const rec = o.paymentRecord || ae.payment;
      const vs  = rec ? (rec.verifyStatus || 'pay_submitted') : 'pending_payment';
      const { label, cls, cardCls } = payStatusLabel(vs);
      const mi  = methodInfo(rec && rec.method);
      const txn = rec && rec.transactionId ? `<span class="pay-card-txn">TXN: ${escHtml(rec.transactionId)}</span>` : '';
      const ts  = rec && rec.timestamp ? `<span class="pay-card-time">${formatDate(rec.timestamp)}</span>` : '';
      return `
        <div class="pay-card ${cardCls}" data-order="${escHtml(o.orderNumber)}" role="button" tabindex="0" title="Click to verify">
          <div class="pay-card-icon ${mi.iconCls}">${mi.icon}</div>
          <div class="pay-card-info">
            <div class="pay-card-order-num">#${escHtml(o.orderNumber)}</div>
            <div class="pay-card-customer">👤 ${escHtml(o.customer?.name || o.customerName || '—')} &nbsp;|&nbsp; 📞 ${escHtml(o.customer?.phone || o.phone || '—')} &nbsp;|&nbsp; 🪑 Table ${escHtml(String(o.tableNumber || o.customer?.tableNumber || '—'))}</div>
            <div class="pay-card-meta">
              <span class="pay-card-method-chip ${mi.chipCls}">${mi.icon} ${mi.label}</span>
              ${txn}${ts}
            </div>
          </div>
          <div class="pay-card-right">
            <div class="pay-card-amount">${formatPrice(o.totals?.total || o._computedTotal || 0)}</div>
            <span class="pay-status-pill ${cls}">${label}</span>
          </div>
        </div>`;
    }).join('');

    // Click → open verify modal
    listEl.querySelectorAll('.pay-card').forEach((card) => {
      const handler = () => openPayVerifyModal(card.getAttribute('data-order'));
      card.addEventListener('click', handler);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(); });
    });
  }

  // ── Payment Verify Modal ──────────────────────────────
  let _pvmOrderNumber = null;

  function openPayVerifyModal(orderNumber) {
    _pvmOrderNumber = orderNumber;
    const order      = getOrders().find((o) => o.orderNumber === orderNumber);
    const adminState = getAdminState();
    const ae         = adminState[orderNumber] || {};
    const rec        = (order && order.paymentRecord) || ae.payment;

    const modal    = el('pay-verify-modal');
    const pvmIcon  = el('pvm-icon');
    const pvmTitle = el('pvm-title');
    const pvmSub   = el('pvm-subtitle');
    const pvmBody  = el('pvm-body');
    if (!modal || !order) return;

    const mi  = methodInfo(rec && rec.method);
    const vs  = rec ? (rec.verifyStatus || 'pay_submitted') : 'pending_payment';
    const { label } = payStatusLabel(vs);

    if (pvmIcon)  pvmIcon.textContent = mi.icon;
    if (pvmTitle) pvmTitle.textContent = `Verify Payment — #${orderNumber}`;
    if (pvmSub)   pvmSub.textContent   = `${order.customer?.name || order.customerName || '—'} · Table ${order.tableNumber || order.customer?.tableNumber || '—'} · ${label}`;

    // ─── Order details grid (always shown) ───
    let bodyHtml = `
      <div class="pvm-detail-grid">
        <div class="pvm-kv"><span class="pvm-lbl">Order #</span><span class="pvm-val">${escHtml(orderNumber)}</span></div>
        <div class="pvm-kv"><span class="pvm-lbl">Amount</span><span class="pvm-val">${formatPrice(order.totals?.total || order._computedTotal || 0)}</span></div>
        <div class="pvm-kv"><span class="pvm-lbl">Customer</span><span class="pvm-val">${escHtml(order.customer?.name || order.customerName || "—")}</span></div>
        <div class="pvm-kv"><span class="pvm-lbl">Phone</span><span class="pvm-val">${escHtml(order.phone || '—')}</span></div>
        <div class="pvm-kv"><span class="pvm-lbl">Table</span><span class="pvm-val">${escHtml(String(order.tableNumber || '—'))}</span></div>
        <div class="pvm-kv"><span class="pvm-lbl">Method</span><span class="pvm-val">${mi.icon} ${mi.label}</span></div>
      </div>`;

    if (!rec) {
      // No payment record yet — customer hasn't paid
      bodyHtml += `<div class="pvm-awaiting-payment">⏳ Customer has not yet initiated payment. Payment section appears after order is marked as Served.</div>`;

    } else if (vs === 'pay_verified') {
      // Already verified
      const verifiedTxn = rec.adminVerifiedTxn || rec.transactionId || '—';
      bodyHtml += `
        <div class="pvm-already-verified">
          ✅ Payment verified on ${rec.verifiedAt ? formatDate(rec.verifiedAt) : 'N/A'}<br>
          <span style="font-size:0.82rem;font-weight:600;margin-top:0.3rem;display:block;">
            TXN: <span style="font-family:monospace;">${escHtml(verifiedTxn)}</span>
          </span>
        </div>
        <div class="pvm-actions" style="grid-template-columns:1fr;">
          <button class="btn btn-reject" id="pvm-btn-reject">↩ Re-open / Reject</button>
        </div>`;

    } else if (rec.method === 'online_upi') {
      // ─── Online UPI: show customer txn + input for admin to enter/confirm txn ───
      const custTxn = rec.transactionId || '';
      const ts      = rec.timestamp ? formatDate(rec.timestamp) : '—';
      bodyHtml += `
        <div class="pvm-txn-box">
          <span class="pvm-txn-label">📱 Transaction ID submitted by customer</span>
          <span class="pvm-txn-value" id="pvm-cust-txn">${escHtml(custTxn || '—')}</span>
          <span style="font-size:0.78rem;color:#64748B;margin-top:0.2rem;">Submitted at: ${ts}</span>
        </div>

        <div class="pvm-input-section">
          <label class="pvm-input-label" for="pvm-txn-input">
            ✏️ Enter / Confirm Transaction ID to verify
          </label>
          <div class="pvm-input-row">
            <input
              type="text"
              id="pvm-txn-input"
              class="pvm-txn-input"
              placeholder="e.g. T2506142308XYZ or UTR number"
              value="${escHtml(custTxn)}"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="pvm-copy-cust" type="button" id="pvm-copy-btn" title="Copy customer TXN">📋</button>
          </div>
          <div class="pvm-input-error" id="pvm-input-error" style="display:none;">
            ⚠️ Please enter a valid transaction ID (at least 8 characters).
          </div>
        </div>

        <div class="pvm-actions">
          <button class="btn btn-verify" id="pvm-btn-verify">✅ Verify Payment</button>
          <button class="btn btn-reject" id="pvm-btn-reject">❌ Reject Payment</button>
        </div>`;

    } else if (rec.method === 'cod') {
      // ─── COD: admin enters order amount received ───
      bodyHtml += `
        <div class="pvm-cod-box">
          <span class="pvm-cod-label">💵 Cash on Delivery</span><br>
          <span style="font-size:0.82rem;color:#92400E;">Confirm that cash has been collected from the customer.</span>
        </div>

        <div class="pvm-input-section">
          <label class="pvm-input-label" for="pvm-txn-input">
            📝 Enter a reference / note (optional)
          </label>
          <input
            type="text"
            id="pvm-txn-input"
            class="pvm-txn-input"
            placeholder="e.g. Cash collected by Server 1"
            autocomplete="off"
          />
        </div>

        <div class="pvm-actions">
          <button class="btn btn-verify" id="pvm-btn-verify">✅ Confirm Cash Received</button>
          <button class="btn btn-reject" id="pvm-btn-reject">❌ Mark as Issue</button>
        </div>`;

    } else {
      // Unknown method fallback
      bodyHtml += `<div class="pvm-awaiting-payment">Payment method unrecognized. Please check order manually.</div>`;
    }

    if (pvmBody) pvmBody.innerHTML = bodyHtml;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');

    // ─── Wire: copy customer TXN ───────────────────────
    const copyBtn = el('pvm-copy-btn');
    const txnInput = el('pvm-txn-input');
    if (copyBtn && txnInput) {
      copyBtn.onclick = () => {
        const custTxnEl = el('pvm-cust-txn');
        const val = custTxnEl ? custTxnEl.textContent.trim() : '';
        if (val && val !== '—') {
          txnInput.value = val;
          copyBtn.textContent = '✅';
          setTimeout(() => { copyBtn.textContent = '📋'; }, 1200);
        }
      };
    }

    // ─── Wire: Verify button ───────────────────────────
    const verifyBtn = el('pvm-btn-verify');
    if (verifyBtn) {
      verifyBtn.onclick = () => {
        const txnVal = (el('pvm-txn-input')?.value || '').trim();
        const isCod  = rec && rec.method === 'cod';
        // For online UPI require at least 8 chars; COD is optional
        if (!isCod && txnVal.length < 8) {
          const errEl = el('pvm-input-error');
          if (errEl) { errEl.style.display = 'block'; }
          el('pvm-txn-input')?.focus();
          return;
        }
        applyPaymentVerification(orderNumber, 'pay_verified', txnVal || null);
      };
    }

    // ─── Wire: Reject button ───────────────────────────
    const rejectBtn = el('pvm-btn-reject');
    if (rejectBtn) {
      rejectBtn.onclick = () => applyPaymentVerification(orderNumber, 'pay_rejected', null);
    }
  }

  function applyPaymentVerification(orderNumber, verifyStatus, adminTxn) {
    try {
      const rawOrders = safeJsonParse(localStorage.getItem(ORDERS_KEY), []);
      const idx = rawOrders.findIndex((o) => o && o.orderNumber === orderNumber);
      if (idx !== -1) {
        if (!rawOrders[idx].paymentRecord) rawOrders[idx].paymentRecord = {};
        rawOrders[idx].paymentRecord.verifyStatus    = verifyStatus;
        rawOrders[idx].paymentRecord.verifiedAt      = new Date().toISOString();
        if (adminTxn !== undefined && adminTxn !== null) {
          rawOrders[idx].paymentRecord.adminVerifiedTxn = adminTxn;
        }
        localStorage.setItem(ORDERS_KEY, JSON.stringify(rawOrders));
      }

      // Also update adminState for redundancy
      const state = getAdminState();
      if (state[orderNumber]) {
        if (!state[orderNumber].payment) state[orderNumber].payment = {};
        state[orderNumber].payment.verifyStatus = verifyStatus;
        state[orderNumber].payment.verifiedAt   = new Date().toISOString();
        if (adminTxn !== undefined && adminTxn !== null) {
          state[orderNumber].payment.adminVerifiedTxn = adminTxn;
        }
        saveAdminState(state);
      }

      // Broadcast to customer payment page
      try {
        if ('BroadcastChannel' in window) {
          const ch = new BroadcastChannel('restaurantOrdersChannel');
          ch.postMessage({ type: 'PAYMENT_VERIFY_UPDATE', orderNumber, verifyStatus });
          ch.close();
        }
      } catch (_) {}

      // Show toast
      const msg = verifyStatus === 'pay_verified' ? '✅ Payment Verified!' : '❌ Payment Rejected';
      if (typeof showToast === 'function') showToast(msg);
      else if (typeof window.showToast === 'function') window.showToast(msg);

      closePayVerifyModal();
      renderPayments();
      renderBoard(); // refresh order cards too
    } catch (err) {
      console.error('applyPaymentVerification error', err);
    }
  }

  function closePayVerifyModal() {
    const modal = el('pay-verify-modal');
    if (modal) { modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); }
    _pvmOrderNumber = null;
  }

  // ═══════════════════════════════════════════════════════
  // OVERVIEW TAB — Analytics
  // ═══════════════════════════════════════════════════════
  function renderOverview() {
    const orders     = getOrders();
    const adminState = getAdminState();

    // Revenue
    let totalRev = 0, verifiedRev = 0, pendingRev = 0;
    orders.forEach((o) => {
      const _oTotal = parseFloat(o.totals?.total || o._computedTotal || 0);
      totalRev += _oTotal;
      const rec = o.paymentRecord || (adminState[o.orderNumber] && adminState[o.orderNumber].payment);
      if (rec && rec.verifyStatus === 'pay_verified') verifiedRev += _oTotal;
      else pendingRev += _oTotal;
    });
    const sv2 = (id, val) => { const e = el(id); if (e) e.textContent = val; };
    sv2('ov-total-rev',    formatPrice(totalRev));
    sv2('ov-verified-rev', formatPrice(verifiedRev));
    sv2('ov-pending-rev',  formatPrice(pendingRev));

    // Orders breakdown
    const statusCounts = { new: 0, preparing: 0, out_for_delivery: 0, delivered: 0 };
    orders.forEach((o) => {
      const ae = adminState[o.orderNumber] || {};
      const st = normalizeStatus(o, ae);
      if (statusCounts[st] !== undefined) statusCounts[st]++;
    });
    const total = orders.length || 1;
    const obEl = el('ov-orders-breakdown');
    if (obEl) {
      const rows = [
        { label: '🆕 New',             key: 'new',            color: '#6B7280' },
        { label: '👨‍🍳 Preparing',      key: 'preparing',      color: '#F59E0B' },
        { label: '🍽️ Ready to Serve',  key: 'out_for_delivery', color: '#3B82F6' },
        { label: '✅ Served',           key: 'delivered',       color: '#10B981' },
      ];
      obEl.innerHTML = rows.map((r) => {
        const cnt = statusCounts[r.key] || 0;
        const pct = Math.round((cnt / total) * 100);
        return `<div class="overview-bk-row">
          <span class="overview-bk-label">${r.label}</span>
          <div class="overview-bk-bar-wrap"><div class="overview-bk-bar" style="width:${pct}%;background:${r.color};"></div></div>
          <span class="overview-bk-val">${cnt}</span>
        </div>`;
      }).join('');
    }

    // Payment methods breakdown
    let codCount = 0, onlineCount = 0, pendingCount = 0;
    orders.forEach((o) => {
      const rec = o.paymentRecord || (adminState[o.orderNumber] && adminState[o.orderNumber].payment);
      if (!rec) { pendingCount++; return; }
      if (rec.method === 'cod') codCount++;
      else if (rec.method === 'online_upi') onlineCount++;
      else pendingCount++;
    });
    const pmEl = el('ov-payment-breakdown');
    if (pmEl) {
      const pmTotal = orders.length || 1;
      const pmRows = [
        { label: '💵 Cash (COD)',   cnt: codCount,     color: '#2563EB' },
        { label: '📱 Online / UPI', cnt: onlineCount,  color: '#7C3AED' },
        { label: '⏳ Pending',      cnt: pendingCount,  color: '#D97706' },
      ];
      pmEl.innerHTML = pmRows.map((r) => {
        const pct = Math.round((r.cnt / pmTotal) * 100);
        return `<div class="overview-bk-row">
          <span class="overview-bk-label">${r.label}</span>
          <div class="overview-bk-bar-wrap"><div class="overview-bk-bar" style="width:${pct}%;background:${r.color};"></div></div>
          <span class="overview-bk-val">${r.cnt}</span>
        </div>`;
      }).join('');
    }

    // Top ordered items
    const itemMap = {};
    orders.forEach((o) => {
      (o.items || []).forEach((item) => {
        const name = item.name || 'Unknown';
        itemMap[name] = (itemMap[name] || 0) + (item.quantity || 1);
      });
    });
    const topItems = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const tiEl = el('ov-top-items');
    const medals = ['🥇','🥈','🥉'];
    if (tiEl) {
      if (topItems.length === 0) {
        tiEl.innerHTML = '<span style="color:var(--text-light);font-size:0.9rem;">No orders yet.</span>';
      } else {
        tiEl.innerHTML = topItems.map(([name, cnt], i) => `
          <div class="overview-top-item">
            <span class="overview-top-item-rank">${medals[i] || '🍽️'}</span>
            <span class="overview-top-item-name">${escHtml(name)}</span>
            <span class="overview-top-item-count">×${cnt}</span>
          </div>`).join('');
      }
    }

    // Recent activity (last 12 events from orders sorted by time)
    const actEl = el('ov-activity');
    if (actEl) {
      const events = [];
      orders.forEach((o) => {
        const ae = adminState[o.orderNumber] || {};
        const st = normalizeStatus(o, ae);
        const dotMap = { new: 'dot-new', preparing: 'dot-preparing', out_for_delivery: 'dot-delivery', delivered: 'dot-delivered' };
        const iconMap = { new: '🆕', preparing: '👨‍🍳', out_for_delivery: '🛵', delivered: '✅' };
        events.push({
          time: ae.updatedAt || o.timestamp || '',
          icon: iconMap[st] || '📋',
          dot:  dotMap[st]  || 'dot-new',
          title: `Order #${o.orderNumber}`,
          sub:  `${o.customer?.name || o.customerName || '—'} · ${statusLabelMap[st] || st} · ${formatPrice(o.totals?.total || o._computedTotal || 0)}`
        });
        const rec = o.paymentRecord || ae.payment;
        if (rec) {
          events.push({
            time: rec.timestamp || rec.verifiedAt || '',
            icon: rec.verifyStatus === 'pay_verified' ? '✅' : '💳',
            dot: 'dot-payment',
            title: `Payment #${o.orderNumber}`,
            sub: `${rec.verifyStatus === 'pay_verified' ? 'Verified' : 'Submitted'} · ${formatPrice(o.totals?.total || o._computedTotal || 0)} · ${methodInfo(rec.method).label}`
          });
        }
      });
      events.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
      const recent = events.slice(0, 12);
      if (recent.length === 0) {
        actEl.innerHTML = '<span style="color:var(--text-light);font-size:0.9rem;">No activity yet.</span>';
      } else {
        actEl.innerHTML = recent.map((ev) => {
          const timeStr = ev.time ? formatDate(ev.time) : '';
          return `<div class="overview-act-row">
            <span class="overview-act-dot ${ev.dot}"></span>
            <span class="overview-act-icon">${ev.icon}</span>
            <div class="overview-act-info">
              <div class="overview-act-title">${escHtml(ev.title)}</div>
              <div class="overview-act-sub">${escHtml(ev.sub)}</div>
            </div>
            <span class="overview-act-time">${timeStr}</span>
          </div>`;
        }).join('');
      }
    }
  }

  // Helper — status label map for overview
  const statusLabelMap = { new: 'New', preparing: 'Preparing', out_for_delivery: 'Ready to Serve', delivered: 'Served' };

  // -------------------------------
  // Tabs
  // -------------------------------
  function setupTabs() {
    const buttons      = Array.from(document.querySelectorAll('.admin-tab'));
    const ordersPanel  = el('tab-orders');
    const paymentsPanel= el('tab-payments');
    const feedbackPanel= el('tab-feedback');
    const overviewPanel= el('tab-overview');

    const ALL_PANELS = [ordersPanel, paymentsPanel, feedbackPanel, overviewPanel];

    function activate(tab) {
      // Toggle button active states
      buttons.forEach((b) => {
        const isActive = b.getAttribute('data-tab') === tab;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Show/hide panels
      ALL_PANELS.forEach((p) => { if (p) p.style.display = 'none'; });
      if (tab === 'orders'   && ordersPanel)   { ordersPanel.style.display   = 'block'; renderBoard(); }
      if (tab === 'payments' && paymentsPanel) { paymentsPanel.style.display = 'block'; renderPayments(); }
      if (tab === 'feedback' && feedbackPanel) { feedbackPanel.style.display = 'block'; renderFeedback(); }
      if (tab === 'overview' && overviewPanel) { overviewPanel.style.display = 'block'; renderOverview(); }
    }

    buttons.forEach((b) => {
      b.onclick = () => activate(b.getAttribute('data-tab') || 'orders');
    });

    // Wire payment verify modal close button
    const pvmClose = el('pay-verify-modal-close');
    if (pvmClose) pvmClose.onclick = closePayVerifyModal;
    const pvmModal = el('pay-verify-modal');
    if (pvmModal) pvmModal.addEventListener('click', (e) => { if (e.target === pvmModal) closePayVerifyModal(); });

    // Wire payment search / filter
    const paySearch = el('pay-search');
    if (paySearch) paySearch.addEventListener('input', renderPayments);
    const payFilter = el('pay-filter-status');
    if (payFilter) payFilter.addEventListener('change', renderPayments);
  }

  // -------------------------------
  // Demo / Admin utilities
  // -------------------------------
  function seedDemoOrder() {
    const orders = getOrders();

    // Use existing menuData if present (defined in js/cart.js)
    const itemsSource = (typeof menuData !== 'undefined' && Array.isArray(menuData) && menuData.length)
      ? menuData
      : [
          { id: 1, name: 'Paneer Tikka', price: 249, image: 'images/paneer-tikka.jpg' },
          { id: 3, name: 'Butter Chicken', price: 399, image: 'images/butter-chicken.jpg' }
        ];

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const a = pick(itemsSource);
    const b = pick(itemsSource);

    const items = [a, b]
      .filter(Boolean)
      .map((it, idx) => ({
        id: it.id || (idx + 1),
        name: it.name,
        price: it.price,
        quantity: idx === 0 ? 1 : 2,
        categoryDisplay: it.categoryDisplay || it.category || '',
        ingredients: it.ingredients || '',
        image: it.image,
        customization: { spiceLevel: 'Mild', extras: [] }
      }));

    const subtotal = items.reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    const timestamp = new Date().toISOString();
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const demoOrder = {
      orderNumber,
      items,
      customer: {
        name: 'Demo Customer',
        phone: '+1 (555) 123-4567',
        email: 'demo@example.com',
        tableNumber: '1',
        address: '',
        city: '',
        zip: '',
        paymentMethod: 'cash',
        notes: 'Demo order generated from admin dashboard.'
      },
      totals: {
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2)
      },
      timestamp,
      status: 'Pending'
    };

    orders.push(demoOrder);
    setOrders(orders);

    // Immediate notify + render
    detectNewOrdersAndNotify();
    renderBoard();

    if (typeof window.showToast === 'function') {
      window.showToast('Demo order created');
    }
  }

  function clearAdminView() {
    // Admin-only clearing (does NOT delete customer orders)
    setAdminClearViewTimestamp(Date.now());

    // Also reset seen so future orders pop correctly
    saveSeen(new Set());

    renderBoard();

    if (typeof window.showToast === 'function') {
      window.showToast('Admin view cleared');
    }
  }

  // -------------------------------
  // Real-time sync
  // - BroadcastChannel (instant)
  // - storage event (cross-tab)
  // - polling fallback
  // -------------------------------
  let pollInterval = null;
  let lastOrdersSignature = '';
  let broadcastChannel = null;

  function computeOrdersSignature(orders) {
    try {
      const last = orders[orders.length - 1];
      return `${orders.length}:${last?.orderNumber || ''}:${last?.timestamp || ''}`;
    } catch {
      return String(Date.now());
    }
  }

  function checkForUpdates() {
    const orders = getOrders();
    const sig = computeOrdersSignature(orders);
    if (sig !== lastOrdersSignature) {
      lastOrdersSignature = sig;
      detectNewOrdersAndNotify();
      renderBoard();
    }
  }

  // -------------------------------
  // Boot
  // -------------------------------
  function ensureDefaultLists() {
    // Delivery list (predefined)
    const staffRaw = safeJsonParse(localStorage.getItem(STAFF_KEY), null);
    if (!Array.isArray(staffRaw) || staffRaw.length === 0) {
      saveStaff([...DEFAULT_DELIVERY_STAFF]);
    }
  }

  function init() {
    ensureDefaultLists();

    // Basic wiring
    setupTabs();

    // Search
    const searchEl = el('admin-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => renderBoard());
    }

    // Staff
    setupStaffControls();
    renderStaff();

    // Buttons
    const seedBtn = el('btn-seed');
    if (seedBtn) seedBtn.onclick = seedDemoOrder;

    const clearBtn = el('btn-clear');
    if (clearBtn) clearBtn.onclick = clearAdminView;

    // Initial seen behavior:
    // - Mark existing orders as seen on first load to avoid spam.
    // - New orders after opening will pop.
    const seen = getSeen();
    if (seen.size === 0) {
      getOrders().forEach((o) => o?.orderNumber && seen.add(o.orderNumber));
      saveSeen(seen);
    }

    // Ensure admin state exists for existing orders (no UI disruptions)
    const state = getAdminState();
    let changed = false;
    getOrders().forEach((o) => {
      if (!o?.orderNumber) return;
      if (!state[o.orderNumber]) {
        state[o.orderNumber] = {
          status: normalizeStatus(o, null),
          assignedDelivery: '',
          // keep compatibility
          assignedTo: '',
          createdAt: o.timestamp || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        changed = true;
      } else {
        // ensure new fields exist
        if (typeof state[o.orderNumber].assignedDelivery === 'undefined') {
          state[o.orderNumber].assignedDelivery = state[o.orderNumber].assignedTo || '';
          changed = true;
        }
      }
    });
    if (changed) saveAdminState(state);

    // Render
    renderBoard();

    // Pre-render all tab data in background (cheap)
    renderFeedback();
    renderPayments();
    renderOverview();

    // Timers
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tickTimers, 1000);
    tickTimers();

    // Storage event: real-time across tabs
    window.addEventListener('storage', (e) => {
      if (!e) return;

      // orders ping is used as an extra cross-tab signal
      if ([ORDERS_KEY, 'restaurantOrdersPing', ADMIN_STATE_KEY, STAFF_KEY, ADMIN_CLEAR_VIEW_KEY].includes(e.key)) {
        detectNewOrdersAndNotify();
        renderStaff();
        renderBoard();
        // Also refresh payments/overview in case payment record changed
        renderPayments();
      }
      if (e.key === REVIEWS_KEY) {
        renderFeedback();
      }
    });

    // BroadcastChannel: instant order notifications
    try {
      if ('BroadcastChannel' in window) {
        broadcastChannel = new BroadcastChannel('restaurantOrdersChannel');
        broadcastChannel.onmessage = (msg) => {
          if (!msg || !msg.data) return;
          const { type } = msg.data;
          if (type === 'NEW_ORDER') {
            // Pull full order from storage so we keep single source of truth
            detectNewOrdersAndNotify();
            renderBoard();
          }
          if (type === 'PAYMENT_CONFIRMED' || type === 'PAYMENT_VERIFY_UPDATE') {
            // A customer submitted or admin verified a payment — refresh payment tab
            renderPayments();
            renderOverview();
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel failed', e);
    }

    // Poll fallback
    checkForUpdates();
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(checkForUpdates, 2000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

function goToFeedback() {
    window.location.href = 'feedback.html?from=payment&order=' + encodeURIComponent(_activeOrderNumber || '');
}
