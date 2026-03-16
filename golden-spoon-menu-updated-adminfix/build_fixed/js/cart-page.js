// ===================================
// Cart Page JavaScript — Per-Item Smart Customization
// ===================================

document.addEventListener('DOMContentLoaded', function() {
  displayCart();
});

function displayCart() {
  const cart = getCart();
  const cartEmpty   = document.getElementById('cart-empty');
  const cartContent = document.getElementById('cart-content');
  if (!cartEmpty || !cartContent) return;

  if (cart.length === 0) {
    cartEmpty.style.display   = 'block';
    cartContent.style.display = 'none';
    return;
  }
  cartEmpty.style.display   = 'none';
  cartContent.style.display = 'grid';
  displayCartItems(cart);
  updateCartSummary();
}

function displayCartItems(cart) {
  const container = document.getElementById('cart-items');
  if (!container) return;

  container.innerHTML = cart.map((item, index) => {
    const opts = itemCustomization[item.id] || { spice: true, extras: [] };
    const hasExtras = opts.extras && opts.extras.length > 0;

    const spiceHtml = opts.spice ? `
      <div class="cust-row">
        <label class="cust-label">🌶️ Spice Level</label>
        <div class="spice-pills" id="spice-pills-${index}">
          ${spiceLevels.map(lvl => `
            <button type="button"
              class="spice-pill ${item.customization.spiceLevel === lvl ? 'active' : ''}"
              onclick="setSpice(${index},'${lvl}')">
              ${lvl}
            </button>`).join('')}
        </div>
      </div>` : '';

    const extrasHtml = hasExtras ? `
      <div class="cust-row">
        <label class="cust-label">✨ Add-ons</label>
        <div class="extras-grid">
          ${opts.extras.map(extraName => {
            const price = extraPrices[extraName] || 0;
            const checked = item.customization.extras.includes(extraName);
            const safeId = `ex-${index}-${extraName.replace(/[^a-z0-9]/gi,'_')}`;
            return `
            <label class="extra-chip ${checked ? 'selected' : ''}" id="chip-${safeId}">
              <input type="checkbox"
                id="${safeId}"
                value="${extraName}"
                ${checked ? 'checked' : ''}
                onchange="toggleExtra(${index},'${extraName}',this)"
                style="display:none">
              <span class="extra-chip-name">${extraName}</span>
              ${price > 0 ? `<span class="extra-chip-price">+₹${price}</span>` : '<span class="extra-chip-free">Free</span>'}
            </label>`;
          }).join('')}
        </div>
      </div>` : '';

    return `
    <div class="cart-item" id="cart-item-${index}">
      <div class="cart-item-top">
        <div class="cart-item-img-wrap">
          <img src="${item.image}" alt="${item.name}" class="cart-item-img" loading="lazy"
               onerror="this.style.display='none';this.parentElement.innerHTML='<div class=cart-img-fallback>🍽️</div>'">
          <span class="cart-veg-dot ${item.veg === false ? 'non-veg' : 'veg'}" title="${item.veg === false ? 'Non-Veg' : 'Veg'}"></span>
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-cat">${item.category}</div>
          <div class="cart-item-price-row">
            <span class="cart-base-price">₹${item.price} × ${item.quantity}</span>
            <span class="cart-item-total" id="item-total-${index}">${formatPrice(calculateItemTotal(item))}</span>
          </div>
        </div>
      </div>

      ${opts.spice || hasExtras ? `
      <div class="cart-customization">
        <div class="cust-toggle" onclick="toggleCust(${index})">
          <span>⚙️ Customize</span>
          <span class="cust-arrow" id="cust-arrow-${index}">▼</span>
        </div>
        <div class="cust-panel" id="cust-panel-${index}" style="display:none">
          ${spiceHtml}
          ${extrasHtml}
        </div>
      </div>` : ''}

      <div class="cart-item-footer">
        <div class="qty-control">
          <button class="qty-btn" onclick="changeQty(${index},-1)">−</button>
          <span class="qty-num" id="qty-${index}">${item.quantity}</span>
          <button class="qty-btn" onclick="changeQty(${index},1)">+</button>
        </div>
        <button class="cart-remove-btn" onclick="removeCartItem(${index})">🗑 Remove</button>
      </div>
    </div>`;
  }).join('');
}

function toggleCust(index) {
  const panel = document.getElementById(`cust-panel-${index}`);
  const arrow = document.getElementById(`cust-arrow-${index}`);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
}

function setSpice(index, level) {
  const cart = getCart();
  if (!cart[index]) return;
  cart[index].customization.spiceLevel = level;
  saveCart(cart);

  // Update UI
  const pillsContainer = document.getElementById(`spice-pills-${index}`);
  if (pillsContainer) {
    pillsContainer.querySelectorAll('.spice-pill').forEach(p => {
      p.classList.toggle('active', p.textContent.trim() === level);
    });
  }
  refreshItemTotal(index);
}

function toggleExtra(index, extraName, checkbox) {
  const cart = getCart();
  if (!cart[index]) return;
  const extras = cart[index].customization.extras;
  if (checkbox.checked) {
    if (!extras.includes(extraName)) extras.push(extraName);
  } else {
    const i = extras.indexOf(extraName);
    if (i !== -1) extras.splice(i, 1);
  }
  cart[index].customization.extras = extras;
  saveCart(cart);

  // Update chip style
  const safeId = `chip-ex-${index}-${extraName.replace(/[^a-z0-9]/gi,'_')}`;
  const chip = document.getElementById(safeId);
  if (chip) chip.classList.toggle('selected', checkbox.checked);
  refreshItemTotal(index);
}

function refreshItemTotal(index) {
  const cart = getCart();
  if (!cart[index]) return;
  const el = document.getElementById(`item-total-${index}`);
  if (el) el.textContent = formatPrice(calculateItemTotal(cart[index]));
  updateCartSummary();
}

function updateCartSummary() {
  const totals = calculateCartTotals();
  const set = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  set('subtotal', formatPrice(totals.subtotal));
  set('tax',      formatPrice(totals.tax));
  set('total',    formatPrice(totals.total));
}

function changeQty(index, change) {
  updateQuantity(index, change);
  const cart = getCart();
  const qEl = document.getElementById(`qty-${index}`);
  if (qEl && cart[index]) {
    qEl.textContent = cart[index].quantity;
    // update price display
    const baseEl = document.querySelector(`#cart-item-${index} .cart-base-price`);
    if (baseEl) baseEl.textContent = `₹${cart[index].price} × ${cart[index].quantity}`;
  }
  refreshItemTotal(index);
}

function removeCartItem(index) {
  const cartItemEl = document.getElementById(`cart-item-${index}`);
  if (cartItemEl) {
    cartItemEl.style.animation = 'fadeOutRight 0.3s ease forwards';
    setTimeout(() => {
      removeFromCart(index);
      displayCart();
    }, 280);
  } else {
    removeFromCart(index);
    displayCart();
  }
}

function proceedToPayment() {
  const cart = getCart();
  if (cart.length === 0) {
    showToast('🛒 Your cart is empty!');
    return;
  }
  window.location.href = 'payment.html';
}
