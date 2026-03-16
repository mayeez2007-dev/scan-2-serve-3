// ===================================
// Menu Page JavaScript
// ===================================

let currentCategory = 'all';

const CATEGORY_ORDER = [
  { key: 'starters',    label: 'Starters',      icon: '🥗' },
  { key: 'main-course', label: 'Main Course',    icon: '🍛' },
  { key: 'breads-rice', label: 'Breads & Rice',  icon: '🍞' },
  { key: 'desserts',    label: 'Desserts',        icon: '🍮' },
  { key: 'cold-drinks', label: 'Cold Drinks',    icon: '🥤' },
];

document.addEventListener('DOMContentLoaded', function() {
  setupCategoryFilters();
  displayMenuItems('all');
});

function setupCategoryFilters() {
  const buttons = document.querySelectorAll('.category-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', function() {
      buttons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentCategory = this.getAttribute('data-category');
      displayMenuItems(currentCategory);
    });
  });
}

function vegBadge(veg) {
  return veg === false
    ? '<span class="veg-badge non-veg" title="Non-Vegetarian">🔴 Non-Veg</span>'
    : '<span class="veg-badge veg" title="Vegetarian">🟢 Veg</span>';
}

function buildCard(item) {
  return `
  <div class="menu-card" data-category="${item.category}">
    <div class="menu-card-img-wrap">
      <img src="${item.image}"
           alt="${item.name}"
           class="menu-card-img"
           loading="lazy"
           onerror="this.style.display='none';this.parentElement.innerHTML='<div class=menu-img-fallback>🍽️</div>'">
      ${vegBadge(item.veg)}
    </div>
    <div class="menu-card-body">
      <div class="menu-card-header">
        <h3 class="menu-card-title">${item.name}</h3>
        <span class="menu-card-price">${formatPrice(item.price)}</span>
      </div>
      <span class="menu-cat-tag">${item.categoryDisplay}</span>
      <p class="menu-card-desc">${item.ingredients}</p>
      <button class="btn-add-cart" onclick="addToCartAnimate(this, ${item.id})">
        <span class="btn-cart-icon">🛒</span> Add to Cart
      </button>
    </div>
  </div>`;
}

function displayMenuItems(category) {
  const container = document.getElementById('menu-items');
  if (!container) return;

  if (category === 'all') {
    let html = '';
    CATEGORY_ORDER.forEach(cat => {
      const items = menuData.filter(i => i.category === cat.key);
      if (!items.length) return;
      html += `
      <div class="menu-category-section">
        <div class="menu-cat-heading">
          <span class="menu-cat-heading-icon">${cat.icon}</span>
          <span>${cat.label}</span>
        </div>
        <div class="menu-inner-grid">
          ${items.map(buildCard).join('')}
        </div>
      </div>`;
    });
    container.innerHTML = html;
    container.className = 'menu-grouped-container';
  } else {
    const items = menuData.filter(i => i.category === category);
    container.innerHTML = items.map(buildCard).join('');
    container.className = 'menu-grid';
  }
}

function addToCartAnimate(btn, itemId) {
  btn.disabled = true;
  btn.innerHTML = '<span>✓</span> Added!';
  btn.classList.add('added');
  addToCart(itemId);
  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-cart-icon">🛒</span> Add to Cart';
    btn.classList.remove('added');
  }, 1500);
}
