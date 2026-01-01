// script.js
// Frontend logic for index.html (Inventory + Items) with quantity/price variants

const API_URL = 'http://localhost:3000/api';

/* ===================== GLOBAL TOAST (Inventory Panel) ===================== */
function showToast(message, type = "success", duration = 2000) {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMessage");

  if (!toast || !msg) {
    alert(message);
    return;
  }

  toast.classList.remove("toast-success", "toast-error", "toast-info");

  if (type === "error") toast.classList.add("toast-error");
  else if (type === "info") toast.classList.add("toast-info");
  else toast.classList.add("toast-success");

  msg.textContent = message;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), duration);
}

/* ================== Modern Confirm Function (Inventory) ================== */
function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");
    const msg = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");

    if (!modal || !msg || !yesBtn || !noBtn) {
      // fallback if confirm modal HTML missing
      const ok = confirm(message);
      resolve(ok);
      return;
    }

    msg.textContent = message;
    modal.style.display = "flex";

    const cleanup = () => {
      yesBtn.onclick = null;
      noBtn.onclick = null;
      modal.style.display = "none";
    };

    yesBtn.onclick = () => {
      cleanup();
      resolve(true);
    };

    noBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

// ---------- DOM ELEMENTS ----------
const userRoleDisplay = document.getElementById('userRoleDisplay');
const adminLink = document.getElementById('adminLink');
const logoutBtn = document.getElementById('logoutBtn');
const searchInput = document.getElementById('searchInput');

const itemForm = document.getElementById('itemForm');
const itemIdInput = document.getElementById('itemId');
const nameInput = document.getElementById('name');
const categorySelect = document.getElementById('category');
const quantityInput = document.getElementById('quantity');
const costInput = document.getElementById('cost');
const supplierInput = document.getElementById('supplier');
const minThresholdInput = document.getElementById('min_threshold');
const expirationInput = document.getElementById('expiration_date');
const imageUrlInput = document.getElementById('image_url');
const inventoryList = document.getElementById('inventoryList');
const formTitle = document.getElementById('form-title');
const clearBtn = document.getElementById('clearBtn');
const billingLink = document.getElementById('billingLink');

// Variant UI elements
const variantQtyInput = document.getElementById('variantQty');
const variantPriceInput = document.getElementById('variantPrice');
const addVariantBtn = document.getElementById('addVariantBtn');
const variantListBody = document.getElementById('variantListBody');
const variantListContainer = document.getElementById('variantListContainer');

// Store variants for the current item (for BOTH new + edit)
let currentVariants = [];

// ---------- AUTH HELPERS ----------
const getToken = () => localStorage.getItem('authToken');
const getUserRole = () => localStorage.getItem('userRole');

const ensureLoggedIn = () => {
  const token = getToken();
  if (!token) {
    window.location.href = 'login.html';
  }
};

const authFetch = async (url, options = {}) => {
  const token = getToken();
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const headers = options.headers || {};
  headers['Authorization'] = `Bearer ${token}`;

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const finalOptions = { ...options, headers };
  const res = await fetch(url, finalOptions);

  if (res.status === 401) {
    showToast('Session expired. Please login again.', 'error');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    window.location.href = 'login.html';
    return Promise.reject(new Error('Unauthorized'));
  }

  return res;
};

// ---------- HEADER / ROLE SETUP ----------
const setupHeader = () => {
  const role = getUserRole();
  if (userRoleDisplay) {
    userRoleDisplay.textContent = role ? `Role: ${role}` : '';
  }

  // Admin link only for Admin
  if (adminLink) {
    adminLink.style.display = role === 'Admin' ? 'inline-block' : 'none';
  }

  // Billing only for Admin + Grocery Keeper (NOT Viewer)
  if (billingLink) {
    if (role === 'Admin' || role === 'Grocery Keeper') {
      billingLink.style.display = 'inline-flex';
    } else {
      billingLink.style.display = 'none';
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userRole');
      showToast('Logged out successfully!', 'info');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1000);
    });
  }
};

// ---------- VIEWER / KEEPER RESTRICTIONS ----------
const applyViewerRestrictions = () => {
  const role = getUserRole();

  // 1) Hide Image URL (Cloudinary) field for everyone EXCEPT Admin
  if (role !== 'Admin' && imageUrlInput) {
    const imgGroup =
      imageUrlInput.closest('.form-group') || imageUrlInput.parentElement;
    if (imgGroup) {
      imgGroup.style.display = 'none';
    }
  }

  // 2) Viewer is fully read-only: hide the entire add/edit form card
  if (role === 'Viewer' && itemForm) {
    const formContainer =
      itemForm.closest('.card') ||
      itemForm.closest('.form-container') ||
      itemForm.parentElement;

    if (formContainer) {
      formContainer.style.display = 'none';
    }
  }
};

// ---------- CATEGORIES ----------
const loadCategories = async () => {
  try {
    const res = await authFetch(`${API_URL}/categories`);
    if (!res.ok) throw new Error('Failed to load categories');
    const categories = await res.json();

    categorySelect.innerHTML = '<option value="">Select a category...</option>';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.category_id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    showToast('Error loading categories.', 'error');
  }
};

// ---------- ITEMS GRID (USES REAL VARIANTS FROM API) ----------
const renderItems = (items) => {
  if (!inventoryList) return;
  inventoryList.innerHTML = '';

  if (!items || items.length === 0) {
    inventoryList.innerHTML = `<div class="item-empty">No items found.</div>`;
    return;
  }

  const role = getUserRole();
  const isViewer = role === 'Viewer';

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';

    const imgHtml = item.image_url
      ? `<img src="${item.image_url}" alt="${item.name}">`
      : `<span style="color:#888;font-size:12px;">No image</span>`;

    const expiryText = item.expiration_date
      ? String(item.expiration_date).slice(0, 10)
      : '-';

    // Use variants from API if present, otherwise a single Std. entry
    let variants = [];
    if (Array.isArray(item.variants) && item.variants.length > 0) {
      variants = item.variants.map(v => ({
        variant_id: v.variant_id,
        label: v.label || v.quantity_label,
        price: Number(v.price)
      }));
    } else {
      variants = [{
        variant_id: null,
        label: 'Std.',
        price: Number(item.cost || 0)
      }];
    }

    const variantOptionsHtml = variants
      .sort((a, b) => a.price - b.price)
      .map(v => `
        <option value="${v.variant_id !== null ? v.variant_id : item.item_id}">
          ${v.label} — ₹${v.price.toFixed(2)}
        </option>
      `)
      .join('');

    const actionsHtml = isViewer
      ? ''
      : `
        <div class="item-actions">
          <button class="btn btn-secondary" data-action="edit" data-id="${item.item_id}">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-delete" data-action="delete" data-id="${item.item_id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;

    card.innerHTML = `
      <div class="item-card-image">
        ${imgHtml}
      </div>

      <div class="item-card-main">
        <div class="item-card-header">
          <div>
            <div class="item-name">${item.name}</div>
            <div class="item-meta">
              ${item.category_name || '-'}
              ${item.supplier ? ` • Supplier: ${item.supplier}` : ''}
            </div>
          </div>
          <div class="item-qty">
            Qty: ${item.quantity}
          </div>
        </div>

        <div class="item-meta">
          Cost: ₹${Number(item.cost || 0).toFixed(2)} • Expiration: ${expiryText}
        </div>

        <div class="item-meta">
          <span class="item-variant-label">Available packs:</span>
          <select class="item-variant-select">
            ${variantOptionsHtml}
          </select>
        </div>

        ${actionsHtml}
      </div>
    `;

    inventoryList.appendChild(card);
  });
};

const loadItems = async (searchTerm = '') => {
  try {
    const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
    const res = await authFetch(`${API_URL}/items${query}`);
    if (!res.ok) {
      if (res.status === 404) {
        renderItems([]);
        return;
      }
      throw new Error('Failed to load items');
    }
    const items = await res.json();
    renderItems(items);
  } catch (err) {
    console.error(err);
    showToast('Error loading items.', 'error');
  }
};

// ---------- FORM HELPERS ----------
const renderVariantTable = () => {
  if (!variantListBody || !variantListContainer) return;

  variantListBody.innerHTML = '';

  if (!currentVariants.length) {
    variantListContainer.style.display = 'none';
    return;
  }

  variantListContainer.style.display = 'block';

  currentVariants.forEach((v, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${v.label}</td>
      <td>₹${Number(v.price).toFixed(2)}</td>
      <td style="text-align:right;">
        <button type="button"
                class="btn btn-delete btn-sm"
                data-variant-index="${index}">
          <i class="fas fa-times"></i>
        </button>
      </td>
    `;
    variantListBody.appendChild(tr);
  });
};

const resetForm = () => {
  if (!itemForm) return;

  itemIdInput.value = '';
  nameInput.value = '';
  categorySelect.value = '';
  quantityInput.value = 0;
  costInput.value = 0;
  supplierInput.value = '';
  minThresholdInput.value = 10;
  expirationInput.value = '';
  imageUrlInput.value = '';
  formTitle.textContent = 'Add New Item';

  currentVariants = [];
  if (variantQtyInput) variantQtyInput.value = '';
  if (variantPriceInput) variantPriceInput.value = '';
  renderVariantTable();
};

// Load existing variants into form when editing
const fillFormForEdit = (item) => {
  itemIdInput.value = item.item_id;
  nameInput.value = item.name;
  categorySelect.value = item.category_id;
  quantityInput.value = item.quantity;
  costInput.value = item.cost;
  supplierInput.value = item.supplier || '';
  minThresholdInput.value = item.min_threshold;
  expirationInput.value = item.expiration_date ? String(item.expiration_date).slice(0, 10) : '';
  imageUrlInput.value = item.image_url || '';
  formTitle.textContent = 'Edit Item';

  if (Array.isArray(item.variants) && item.variants.length > 0) {
    currentVariants = item.variants
      .map(v => ({
        label: (v.label || v.quantity_label || '').toString().trim(),
        price: Number(v.price || 0)
      }))
      .filter(v => v.label);
  } else {
    currentVariants = [];
  }

  renderVariantTable();
};

// ---------- VARIANT EVENTS ----------
if (addVariantBtn) {
  addVariantBtn.addEventListener('click', () => {
    const label = (variantQtyInput.value || '').trim();
    const priceVal = parseFloat(variantPriceInput.value);

    if (!label || Number.isNaN(priceVal)) {
      showToast('Enter quantity/pack and a valid price.', 'error');
      return;
    }

    currentVariants.push({ label, price: priceVal });
    variantQtyInput.value = '';
    variantPriceInput.value = '';
    renderVariantTable();
  });
}

if (variantListBody) {
  variantListBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-variant-index]');
    if (!btn) return;
    const index = Number(btn.dataset.variantIndex);
    if (Number.isNaN(index)) return;

    currentVariants.splice(index, 1);
    renderVariantTable();
  });
}

// ---------- SUBMIT FORM ----------
if (itemForm) {
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = getUserRole();
    if (role === 'Viewer') {
      showToast('Viewer role is read-only. You cannot add or edit items.', 'info');
      return;
    }

    const isEdit = !!itemIdInput.value;

    const payload = {
      name: nameInput.value.trim(),
      category_id: categorySelect.value,
      quantity: Number(quantityInput.value),
      cost: Number(costInput.value || 0),
      supplier: supplierInput.value.trim(),
      min_threshold: Number(minThresholdInput.value),
      expiration_date: expirationInput.value || null,
      image_url: imageUrlInput.value.trim() || null
    };

    // Always send variants (for add + edit)
    if (Array.isArray(currentVariants) && currentVariants.length > 0) {
      payload.variants = currentVariants.map(v => ({
        label: String(v.label || '').trim(),
        price: Number(v.price || 0)
      }));
    } else {
      payload.variants = [];
    }

    if (!payload.name || !payload.category_id) {
      showToast('Please fill item name and category.', 'error');
      return;
    }

    try {
      const url = isEdit
        ? `${API_URL}/items/${itemIdInput.value}`
        : `${API_URL}/items`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error(data);
        showToast(data.error || 'Failed to save item.', 'error');
        return;
      }

      showToast(isEdit ? 'Item updated successfully.' : 'Item added successfully.', 'success');
      resetForm();
      loadItems(searchInput ? searchInput.value.trim() : '');
    } catch (err) {
      console.error(err);
      showToast('Error saving item. Check console.', 'error');
    }
  });
}

// Clear button
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    resetForm();
  });
}

// ---------- CARD BUTTONS (EDIT / DELETE) ----------
if (inventoryList) {
  inventoryList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (!action || !id) return;

    const role = getUserRole();
    if (role === 'Viewer') {
      showToast('Viewer role is read-only. You cannot modify items.', 'info');
      return;
    }

    if (action === 'edit') {
      try {
        const res = await authFetch(`${API_URL}/items`);
        if (!res.ok) throw new Error('Failed to load items for edit');
        const items = await res.json();
        const item = items.find(i => i.item_id === Number(id));
        if (!item) {
          showToast('Item not found.', 'error');
          return;
        }
        fillFormForEdit(item);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        console.error(err);
        showToast('Error loading item for edit.', 'error');
      }
    }

    if (action === 'delete') {
      // ✅ Modern confirm instead of window.confirm
      const ok = await showConfirm("Are you sure you want to delete this item?");
      if (!ok) return;

      try {
        const res = await authFetch(`${API_URL}/items/${id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok) {
          console.error(data);
          showToast(data.error || 'Failed to delete item.', 'error');
          return;
        }
        showToast('Item deleted successfully.', 'success');
        loadItems(searchInput ? searchInput.value.trim() : '');
      } catch (err) {
        console.error(err);
        showToast('Error deleting item.', 'error');
      }
    }
  });
}

// ---------- SEARCH ----------
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.trim();
    loadItems(term);
  });
}

// ---------- INIT ----------
const init = () => {
  ensureLoggedIn();
  setupHeader();
  applyViewerRestrictions();   // role-based UI rules (image field + viewer)
  loadCategories();
  loadItems();
  renderVariantTable(); // hide variants table initially
};

document.addEventListener('DOMContentLoaded', init);
