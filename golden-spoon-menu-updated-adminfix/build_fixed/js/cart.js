// ===================================
// Menu Data — Images carefully matched to each food item
// Local images used: paneer-tikka.jpg, samosa.jpg, butter-chicken.jpg, paneer-butter-masala.jpg
// ===================================

const menuData = [

  // ── STARTERS ─────────────────────────────────
  {
    id: 1,
    name: "Aloo Tikka",
    category: "starters",
    categoryDisplay: "Starters",
    price: 249,
    ingredients: "Potatoes, yogurt, tandoori spices, bell peppers, onions",
    image: "images/aloo-tikka.jpg",
    veg: true
  },
  {
    id: 2,
    name: "Samosa (2 pcs)",
    category: "starters",
    categoryDisplay: "Starters",
    price: 89,
    ingredients: "Crispy pastry, spiced potatoes, peas, coriander, tamarind chutney",
    image: "images/samosa.jpg",
    veg: true
  },
  {
    id: 9,
    name: "Aloo Tikki",
    category: "starters",
    categoryDisplay: "Starters",
    price: 99,
    ingredients: "Spiced mashed potatoes, breadcrumbs, green chutney, sev, yogurt",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80",
    veg: true
  },
  {
    id: 10,
    name: "Chicken Tikka",
    category: "starters",
    categoryDisplay: "Starters",
    price: 299,
    ingredients: "Boneless chicken, yogurt marinade, tandoori spices, lemon, mint chutney",
    image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80",
    veg: false
  },
  {
    id: 11,
    name: "Hara Bhara Kabab",
    category: "starters",
    categoryDisplay: "Starters",
    price: 199,
    ingredients: "Spinach, peas, paneer, potatoes, green herbs, chaat masala",
    image: "https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&q=80",
    veg: true
  },

  // ── MAIN COURSE ───────────────────────────────
  {
    id: 3,
    name: "Butter Chicken",
    category: "main-course",
    categoryDisplay: "Main Course",
    price: 399,
    ingredients: "Tender chicken, tomato gravy, butter, cream, fenugreek, naan/rice",
    image: "images/butter-chicken.jpg",
    veg: false
  },
  {
    id: 4,
    name: "Paneer Butter Masala",
    category: "main-course",
    categoryDisplay: "Main Course",
    price: 329,
    ingredients: "Cottage cheese, tomato cashew gravy, butter, cream, spices",
    image: "images/paneer-butter-masala.jpg",
    veg: true
  },
  {
    id: 12,
    name: "Dal Makhani",
    category: "main-course",
    categoryDisplay: "Main Course",
    price: 279,
    ingredients: "Black lentils, kidney beans, butter, cream, tomatoes, ginger, garlic",
    image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80",
    veg: true
  },
  {
    id: 13,
    name: "Chicken Biryani",
    category: "main-course",
    categoryDisplay: "Main Course",
    price: 449,
    ingredients: "Basmati rice, tender chicken, saffron, whole spices, fried onions, raita",
    image: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&q=80",
    veg: false
  },

  // ── BREADS & RICE ─────────────────────────────
  {
    id: 20,
    name: "Butter Naan",
    category: "breads-rice",
    categoryDisplay: "Breads & Rice",
    price: 59,
    ingredients: "Refined flour, yeast, butter, nigella seeds, baked in tandoor",
    image: "https://images.unsplash.com/photo-1574653853027-5382a3d23a15?w=600&q=80",
    veg: true
  },
  {
    id: 21,
    name: "Garlic Naan",
    category: "breads-rice",
    categoryDisplay: "Breads & Rice",
    price: 69,
    ingredients: "Refined flour, garlic, butter, coriander, baked in tandoor",
    image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&q=80",
    veg: true
  },
  {
    id: 22,
    name: "Jeera Rice",
    category: "breads-rice",
    categoryDisplay: "Breads & Rice",
    price: 129,
    ingredients: "Basmati rice, cumin seeds, ghee, bay leaf, whole spices",
    image: "images/jeera-rice.jpg",
    veg: true
  },
  {
    id: 23,
    name: "Aloo Paratha",
    category: "breads-rice",
    categoryDisplay: "Breads & Rice",
    price: 89,
    ingredients: "Whole wheat flour, spiced potato stuffing, ghee, pickle, curd",
    image: "https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?w=600&q=80",
    veg: true
  },
  {
    id: 24,
    name: "Veg Pulao",
    category: "breads-rice",
    categoryDisplay: "Breads & Rice",
    price: 179,
    ingredients: "Basmati rice, mixed vegetables, whole spices, ghee, fried onions",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&q=80",
    veg: true
  },

  // ── DESSERTS ──────────────────────────────────
  {
    id: 5,
    name: "Gulab Jamun",
    category: "desserts",
    categoryDisplay: "Desserts",
    price: 99,
    ingredients: "Milk solids, sugar syrup, cardamom, saffron, rose water",
    image: "images/gulab-jamun.jpg",
    veg: true
  },
  {
    id: 6,
    name: "Kulfi",
    category: "desserts",
    categoryDisplay: "Desserts",
    price: 89,
    ingredients: "Traditional Indian ice cream, milk, cardamom, pistachios, saffron",
    image: "images/kulfi.jpg",
    veg: true
  },
  {
    id: 15,
    name: "Rasmalai",
    category: "desserts",
    categoryDisplay: "Desserts",
    price: 129,
    ingredients: "Soft cheese patties, thickened saffron milk, cardamom, pistachios",
    image: "images/rasmalai.jpg",
    veg: true
  },

  // ── COLD DRINKS ───────────────────────────────
  {
    id: 7,
    name: "Sweet Lassi",
    category: "cold-drinks",
    categoryDisplay: "Cold Drinks",
    price: 79,
    ingredients: "Chilled yogurt, sugar, cardamom, rose water, cream",
    image: "images/lassi.jpg",
    veg: true
  },
  {
    id: 8,
    name: "Mango Lassi",
    category: "cold-drinks",
    categoryDisplay: "Cold Drinks",
    price: 99,
    ingredients: "Fresh mango pulp, yogurt, sugar, cardamom, cream",
    image: "images/mango-lassi.jpg",
    veg: true
  },
  {
    id: 18,
    name: "Nimbu Pani",
    category: "cold-drinks",
    categoryDisplay: "Cold Drinks",
    price: 59,
    ingredients: "Fresh lemon juice, water, sugar/salt, mint, black salt, cumin",
    image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80",
    veg: true
  },
  {
    id: 19,
    name: "Masala Chai",
    category: "cold-drinks",
    categoryDisplay: "Cold Drinks",
    price: 49,
    ingredients: "Assam tea, milk, ginger, cardamom, cinnamon, cloves, sugar",
    image: "https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=600&q=80",
    veg: true
  }
];

// ===================================
// Per-Item Customization Options
// ===================================

const itemCustomization = {
  // Starters that support gravy extras
  1:  { spice: true, extras: ["No Onions","No Garlic","Jain Style","Extra Chutney"] },
  2:  { spice: false, extras: ["Extra Chutney","Extra Tamarind"] },
  9:  { spice: true,  extras: ["Extra Chutney","No Onions","Jain Style"] },
  10: { spice: true,  extras: ["Extra Lemon","Extra Chutney","Boneless Only"] },
  11: { spice: true,  extras: ["No Onions","Jain Style","Extra Chutney"] },

  // Main Course
  3:  { spice: true,  extras: ["Extra Gravy","Extra Butter","No Onions","No Garlic","Boneless Only"] },
  4:  { spice: true,  extras: ["Extra Gravy","Extra Paneer","Extra Butter","No Onions","No Garlic","Jain Style"] },
  12: { spice: true,  extras: ["Extra Butter","Extra Gravy","No Garlic","Jain Style"] },
  13: { spice: true,  extras: ["Extra Raita","Extra Saffron","Boneless Only","No Fried Onion"] },

  // Breads & Rice
  20: { spice: false, extras: ["Extra Butter","No Nigella Seeds"] },
  21: { spice: false, extras: ["Extra Garlic Butter","Extra Coriander"] },
  22: { spice: false, extras: ["Extra Ghee","Extra Cumin"] },
  23: { spice: true,  extras: ["Extra Butter","With Pickle","With Curd","Double Stuffing"] },
  24: { spice: true,  extras: ["Extra Ghee","Extra Vegetables","Jain Style"] },

  // Desserts
  5:  { spice: false, extras: ["Extra Sugar Syrup","Warm Serving","Ice Cream Topping"] },
  6:  { spice: false, extras: ["Pistachio Topping","Rose Syrup","Extra Dry Fruits"] },
  15: { spice: false, extras: ["Extra Saffron","Extra Dry Fruits","Warm Serving"] },

  // Cold Drinks
  7:  { spice: false, extras: ["Extra Sweet","Salted Option","Rose Flavour"] },
  8:  { spice: false, extras: ["Extra Mango","Less Sweet","Thick Consistency"] },
  18: { spice: false, extras: ["Extra Lemon","Mint Heavy","Jaljeera Mix"] },
  19: { spice: false, extras: ["Extra Ginger","Less Sugar","Kadak (Strong)"] }
};

const extraPrices = {
  "Extra Gravy": 29,
  "Extra Paneer": 49,
  "Extra Butter": 19,
  "Extra Chutney": 15,
  "Extra Tamarind": 10,
  "Extra Lemon": 10,
  "Extra Raita": 29,
  "Extra Saffron": 39,
  "Extra Ghee": 25,
  "Extra Garlic Butter": 25,
  "Extra Mango": 29,
  "Extra Cumin": 10,
  "Extra Ginger": 10,
  "Extra Coriander": 10,
  "Double Stuffing": 29,
  "Ice Cream Topping": 39,
  "Extra Sugar Syrup": 15,
  "Extra Dry Fruits": 35,
  "Extra Sweet": 0,
  "Pistachio Topping": 25,
  "Rose Syrup": 15,
  "No Onions": 0,
  "No Garlic": 0,
  "Jain Style": 0,
  "Boneless Only": 0,
  "No Nigella Seeds": 0,
  "No Fried Onion": 0,
  "With Pickle": 10,
  "With Curd": 15,
  "Salted Option": 0,
  "Rose Flavour": 15,
  "Mint Heavy": 0,
  "Jaljeera Mix": 0,
  "Less Sweet": 0,
  "Thick Consistency": 0,
  "Kadak (Strong)": 0,
  "Warm Serving": 0
};

const spiceLevels = ["Mild", "Medium", "Spicy", "Extra Spicy"];

// Legacy compat
const customizationOptions = {
  spiceLevel: spiceLevels,
  extras: Object.entries(extraPrices).map(([name, price]) => ({ name, price }))
};

// ===================================
// Cart Management Functions
// ===================================

function getCart() {
  try {
    const cart = localStorage.getItem("restaurantCart");
    return cart ? JSON.parse(cart) : [];
  } catch(e) { return []; }
}

function saveCart(cart) {
  localStorage.setItem("restaurantCart", JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const cart = getCart();
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll("#cart-count").forEach(badge => {
    badge.textContent = totalItems;
  });
}

function addToCart(itemId) {
  const item = menuData.find(i => i.id === itemId);
  if (!item) return;
  const cart = getCart();
  cart.push({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: 1,
    category: item.categoryDisplay,
    ingredients: item.ingredients,
    image: item.image,
    veg: item.veg,
    customization: { spiceLevel: "Mild", extras: [] }
  });
  saveCart(cart);
  showToast("🛒 " + item.name + " added to cart!");
}

function removeFromCart(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
}

function updateQuantity(index, change) {
  const cart = getCart();
  if (cart[index]) {
    cart[index].quantity = Math.max(1, cart[index].quantity + change);
    saveCart(cart);
  }
}

function updateCustomization(index, customization) {
  const cart = getCart();
  if (cart[index]) {
    cart[index].customization = customization;
    saveCart(cart);
  }
}

function calculateItemTotal(item) {
  let total = item.price * item.quantity;
  if (item.customization && item.customization.extras) {
    item.customization.extras.forEach(extraName => {
      const p = extraPrices[extraName] || 0;
      total += p * item.quantity;
    });
  }
  return total;
}

function calculateCartTotals() {
  const cart = getCart();
  const subtotal = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const tax = subtotal * 0.05;
  const total = subtotal + tax;
  return {
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    total: total.toFixed(2)
  };
}

function clearCart() {
  localStorage.removeItem("restaurantCart");
  updateCartCount();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  }
}

function formatPrice(price) {
  return `₹${parseFloat(price).toFixed(2)}`;
}

function captureTableFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const table = params.get('table') || params.get('t');
    if (table) localStorage.setItem('restaurantTableNumber', table);
  } catch(e) {}
}

function getSavedTableNumber() {
  try { return localStorage.getItem('restaurantTableNumber') || ''; } catch(e) { return ''; }
}

document.addEventListener("DOMContentLoaded", function () {
  captureTableFromUrl();
  updateCartCount();
});
