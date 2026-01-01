// admin.js (Users CRUD + Status Toggle + Categories + Master Items in GRID)

// --- MODERN TOAST HELPER (for logout & messages) ---
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

// --- MODERN CONFIRM HELPER ---
function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");
    const msg = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");

    if (!modal || !msg || !yesBtn || !noBtn) {
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

// --- AUTHENTICATION & REDIRECTION ---
const checkAuthAndGetToken = () => {
  const token = localStorage.getItem('authToken');
  const role = localStorage.getItem('userRole');
  if (!token) {
    window.location.href = 'login.html';
    return { token: null, role: null };
  }
  return { token, role };
};

const handleLogout = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userRole');

  showToast('Logged out successfully!', 'info');

  setTimeout(() => {
    window.location.href = 'login.html';
  }, 1200);
};

// ------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'http://localhost:3000/api';
  const auth = checkAuthAndGetToken();
  if (!auth.token) return;

  // Admin only
  if (auth.role !== 'Admin') {
    showToast('Access Denied. Only Admin can view this page.', 'error');
    window.location.href = 'index.html';
    return;
  }

  // Header UI
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  document.getElementById('userRoleDisplay').textContent = `${auth.role} Access`;

  // --- API Fetch Helper (Injects Auth Header) ---
  const authenticatedFetch = async (url, options = {}) => {
    options.headers = {
      ...options.headers,
      Authorization: auth.token
    };
    const response = await fetch(url, options);
    if (response.status === 401 || response.status === 403) {
      console.error('Auth/permission failure. Logging out.');
      handleLogout();
      throw new Error(`Auth failed: ${response.statusText}`);
    }
    return response;
  };

  const API = {
    fetch: async (url) => (await authenticatedFetch(url)).json(),
    post: async (url, data) =>
      (await authenticatedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })).json(),
    put: async (url, data) =>
      (await authenticatedFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })).json(),
    delete: async (url) =>
      (await authenticatedFetch(url, { method: 'DELETE' })).json()
  };

  // ---------- INR & UNIT HELPERS ----------
  const INR = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  });
  const formatINR = (n) => INR.format(Number(n || 0));

  function inferUnitFor(item) {
    const name = String(item.name || '').toLowerCase();
    const cat = String(item.category_name || item.category || '').toLowerCase();

    if (
      /(milk|oil|water|juice|drink|soda|vinegar|shampoo|conditioner|hand\s*wash|cleaner)/.test(name) ||
      /(beverage|liquid|drinks?)/.test(cat)
    ) return 'L';

    if (
      /(rice|wheat|atta|flour|maida|suji|semolina|dal|pulses|lentil|sugar|salt|poha|oats|rava|besan)/.test(name) ||
      /(grain|staple|cereal|pulses)/.test(cat)
    ) return 'kg';

    if (/(paneer|butter|cheese|curd|yogurt|ghee)/.test(name)) return 'kg';

    if (/(fruit|vegetable|veggie)/.test(cat)) return 'kg';

    if (
      /(electronic|device|accessor|toothpaste|soap|brush|battery|pen|notebook|packet)/.test(cat) ||
      /(keyboard|mouse|screen|colgate|paste|soap|pack)/.test(name)
    ) return 'pcs';

    if (/(egg|bread|bun|roll)/.test(name)) return 'pcs';

    return 'pcs';
  }

  // ==========================================================
  //                   A. USER MANAGEMENT
  // ==========================================================
  const userForm = document.getElementById('userForm');
  const userList = document.getElementById('userList');
  const roleIdSelect = document.getElementById('roleId');
  const clearUserBtn = document.getElementById('clearUserBtn');
  const userIdField = document.getElementById('userId');

  const usernameField = document.getElementById('username');
  const passwordField = document.getElementById('password');
  const firstNameField = document.getElementById('firstName');
  const lastNameField = document.getElementById('lastName');
  const contactField = document.getElementById('contact');
  const emailField = document.getElementById('email');

  const loadRolesForUserForm = async () => {
    try {
      const roles = await API.fetch(`${API_URL}/roles`);
      roleIdSelect.innerHTML = '<option value="">Select a role...</option>';
      roles.forEach((role) => {
        const option = document.createElement('option');
        option.value = role.role_id;
        option.textContent = role.role_name;
        roleIdSelect.appendChild(option);
      });
    } catch (err) {
      console.error('Failed to load roles:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const users = await API.fetch(`${API_URL}/users`);
      renderUsers(users);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      userList.innerHTML = '<tr><td colspan="7">Error loading user list.</td></tr>';
    }
  };

  const renderUsers = (users) => {
    userList.innerHTML = '';
    if (!users.length) {
      userList.innerHTML = '<tr><td colspan="7">No users registered.</td></tr>';
      return;
    }

    users.forEach((user) => {
      const tr = document.createElement('tr');
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'N/A';
      const statusText = user.is_active ? 'Active ✅' : 'Inactive ❌';
      const toggleLabel = user.is_active ? 'Deactivate' : 'Activate';
      const contactEmail = `${user.contact || 'N/A'} / ${user.email || 'N/A'}`;
      const createdAt = user.created_at
        ? new Date(user.created_at).toLocaleDateString('en-IN')
        : 'N/A';

      tr.innerHTML = `
        <td>${user.username}</td>
        <td>${fullName}</td>
        <td>${user.role_name}</td>
        <td>${contactEmail}</td>
        <td>${statusText}</td>
        <td>${createdAt}</td>
        <td>
          <button class="btn btn-secondary btn-toggle-status"
                  data-id="${user.user_id}"
                  data-active="${user.is_active ? 1 : 0}">
            ${toggleLabel}
          </button>
          <button class="btn btn-edit btn-edit-user"
                  data-id="${user.user_id}">
            Edit
          </button>
          <button class="btn btn-delete btn-delete-user"
                  data-id="${user.user_id}">
            Delete
          </button>
        </td>
      `;
      userList.appendChild(tr);
    });
  };

  // 🔴 CLICK HANDLERS (with modern confirm)
  userList.addEventListener('click', async (e) => {
    const target = e.target;

    // 1) Toggle Active/Inactive
    if (target.closest('.btn-toggle-status')) {
      const btn = target.closest('.btn-toggle-status');
      const userId = btn.getAttribute('data-id');
      const currentlyActive = Number(btn.getAttribute('data-active')) === 1;
      const nextActive = currentlyActive ? 0 : 1;

      const ok = await showConfirm(
        `Are you sure you want to ${nextActive ? 'activate' : 'deactivate'} this user?`
      );
      if (!ok) return;

      try {
        btn.disabled = true;
        const res = await authenticatedFetch(`${API_URL}/users/${userId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: nextActive })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update status');
        await fetchUsers();
        showToast('User status updated.', 'success');
      } catch (err) {
        showToast(`Failed: ${err.message}`, 'error');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    // 2) Edit user
    if (target.classList.contains('btn-edit-user')) {
      const userId = target.getAttribute('data-id');
      try {
        const users = await API.fetch(`${API_URL}/users`);
        const u = users.find((x) => String(x.user_id) === String(userId));
        if (!u) return showToast('User not found. Please refresh.', 'error');

        userIdField.value = u.user_id;
        usernameField.value = u.username;
        usernameField.disabled = true;

        passwordField.value = '';
        passwordField.required = false;

        firstNameField.value = u.first_name || '';
        lastNameField.value = u.last_name || '';
        contactField.value = u.contact || '';
        emailField.value = u.email || '';
        roleIdSelect.value = u.role_id || '';

        userForm.querySelector('button[type="submit"]').textContent = 'Save Changes';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        console.error(err);
        showToast('Failed to load user data for editing.', 'error');
      }
      return;
    }

    // 3) Delete user
    if (target.classList.contains('btn-delete-user')) {
      const userId = target.getAttribute('data-id');
      try {
        const me = await API.fetch(`${API_URL}/me`);
        if (Number(me.userId) === Number(userId)) {
          showToast('You cannot delete your own account.', 'error');
          return;
        }
      } catch (err) {
        console.warn('Could not check /me; proceeding with server-side protection.');
      }

      const ok = await showConfirm(
        'This will permanently remove the user and their access.\n\nAre you sure?'
      );
      if (!ok) return;

      try {
        target.disabled = true;
        const res = await authenticatedFetch(`${API_URL}/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete user');
        await fetchUsers();
        showToast('User deleted.', 'success');
      } catch (err) {
        showToast(`Delete failed: ${err.message}`, 'error');
      } finally {
        target.disabled = false;
      }
      return;
    }
  });

  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const editingId = userIdField.value.trim();
    const submittedUsername = usernameField.value.trim();
    const submittedPassword = passwordField.value;
    const submittedRoleId = roleIdSelect.value;

    if (!submittedUsername || !submittedRoleId) {
      showToast('Username and Role are required.', 'error');
      return;
    }
    if (!editingId && !submittedPassword) {
      showToast('Password is required for new users.', 'error');
      return;
    }

    const payload = {
      password: submittedPassword || undefined,
      first_name: firstNameField.value.trim(),
      last_name: lastNameField.value.trim(),
      contact: contactField.value.trim(),
      email: emailField.value.trim(),
      role_id: submittedRoleId
    };

    try {
      if (editingId) {
        const res = await authenticatedFetch(`${API_URL}/users/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user');
        showToast('User updated successfully!', 'success');
      } else {
        payload.username = submittedUsername;
        payload.password = submittedPassword;
        const res = await authenticatedFetch(`${API_URL}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to register user');
        showToast('User registered successfully!', 'success');
      }

      resetUserForm();
      await fetchUsers();
    } catch (err) {
      console.error(err);
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  const resetUserForm = () => {
    userForm.reset();
    userIdField.value = '';
    usernameField.disabled = false;
    passwordField.required = true;
    userForm.querySelector('button[type="submit"]').textContent = 'Register User';
  };

  clearUserBtn.addEventListener('click', resetUserForm);

  // ==========================================================
  //                   B. CATEGORY MANAGEMENT
  // ==========================================================
  const categoryForm = document.getElementById('categoryForm');
  const categoryFormTitle = document.getElementById('category-form-title');
  const categoryList = document.getElementById('categoryList');
  const categoryIdField = document.getElementById('categoryId');
  const categoryNameField = document.getElementById('categoryName');
  const categoryDescriptionField = document.getElementById('categoryDescription');
  const clearCategoryBtn = document.getElementById('clearCategoryBtn');

  const fetchCategories = async () => {
    try {
      const categories = await API.fetch(`${API_URL}/categories`);
      renderCategories(categories);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      categoryList.innerHTML =
        '<tr><td colspan="3">Error loading categories list. Check console.</td></tr>';
    }
  };

  const renderCategories = (categories) => {
    categoryList.innerHTML = '';
    if (!categories.length) {
      categoryList.innerHTML = '<tr><td colspan="3">No categories created yet.</td></tr>';
      return;
    }

    categories.forEach((cat) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${cat.name}</td>
        <td>${cat.description || ''}</td>
        <td>
          <button class="btn btn-edit btn-edit"
                  data-id="${cat.category_id}"
                  data-name="${cat.name}"
                  data-desc="${cat.description || ''}">
            Edit
          </button>
          <button class="btn btn-delete btn-delete"
                  data-id="${cat.category_id}">
            Delete
          </button>
        </td>
      `;
      categoryList.appendChild(tr);
    });
  };

  const resetCategoryForm = () => {
    categoryForm.reset();
    categoryIdField.value = '';
    categoryFormTitle.textContent = 'Add New Category';
  };

  categoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = categoryIdField.value.trim();
    const name = categoryNameField.value.trim();
    const description = categoryDescriptionField.value.trim();

    if (!name) {
      showToast('Category name is required.', 'error');
      return;
    }

    const payload = { name, description };

    try {
      if (id) {
        const res = await authenticatedFetch(`${API_URL}/categories/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update category');
        showToast('Category updated successfully!', 'success');
      } else {
        const res = await authenticatedFetch(`${API_URL}/categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create category');
        showToast('Category created successfully!', 'success');
      }

      resetCategoryForm();
      fetchCategories();
      fetchMasterItems();
    } catch (error) {
      console.error('Failed to save category:', error);
      showToast(`Error saving category: ${error.message}`, 'error');
    }
  });

  categoryList.addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    if (!id) return;

    // Delete category
    if (e.target.classList.contains('btn-delete')) {
      const ok = await showConfirm(
        'Deleting a category may detach it from items.\nItems will become "Uncategorized".\n\nAre you sure?'
      );
      if (!ok) return;

      try {
        await API.delete(`${API_URL}/categories/${id}`);
        fetchCategories();
        fetchMasterItems();
        showToast('Category deleted successfully!', 'success');
      } catch (error) {
        console.error('Failed to delete category:', error);
        showToast(`Error deleting category: ${error.message}`, 'error');
      }
      return;
    }

    // Edit category
    if (e.target.classList.contains('btn-edit')) {
      categoryIdField.value = id;
      categoryNameField.value = e.target.dataset.name;
      categoryDescriptionField.value = e.target.dataset.desc;
      categoryFormTitle.textContent = 'Edit Category';
      window.scrollTo(0, 0);
    }
  });

  clearCategoryBtn.addEventListener('click', resetCategoryForm);

  // ==========================================================
  //                   C. MASTER ITEM LIST (GRID)
  // ==========================================================
  const masterItemList = document.getElementById('masterItemList');

  const fetchMasterItems = async () => {
    try {
      const items = await API.fetch(`${API_URL}/items`);
      renderMasterItems(items);
    } catch (error) {
      console.error('Failed to fetch master items:', error);
      masterItemList.innerHTML =
        '<div class="item-empty">Error loading master item list. Check console.</div>';
    }
  };

  const renderMasterItems = (items) => {
    masterItemList.innerHTML = '';

    if (!items || items.length === 0) {
      masterItemList.innerHTML =
        '<div class="item-empty">No items found in master list.</div>';
      return;
    }

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';

      const expirationDisplay = item.expiration_date
        ? new Date(item.expiration_date).toLocaleDateString('en-IN')
        : 'N/A';

      const unit = inferUnitFor(item);
      const qtyText = `${item.quantity} <span class="muted">${unit}</span>`;
      const lowFlag =
        Number(item.quantity) <= Number(item.min_threshold || 0)
          ? ' <span title="Low Stock">⚠️</span>'
          : '';

      const imgHtml = item.image_url
        ? `<img src="${item.image_url}" alt="${item.name}">`
        : `<span style="color:#888;font-size:12px;">No image</span>`;

      card.innerHTML = `
        <div class="item-card-image">
          ${imgHtml}
        </div>

        <div class="item-card-main">
          <div class="item-card-header">
            <div>
              <div class="item-name">${item.name}</div>
              <div class="item-meta">
                ${item.category_name || 'Uncategorized'}
                ${item.supplier ? ` • Supplier: ${item.supplier}` : ''}
              </div>
            </div>
            <div class="item-qty">
              ${qtyText}${lowFlag}
            </div>
          </div>

          <div class="item-meta">
            Cost: ${formatINR(item.cost)} • Expiration: ${expirationDisplay}
          </div>

          <div class="item-actions">
            <button class="btn btn-secondary" onclick="window.location.href='index.html';">
              View/Edit on Main Page
            </button>
          </div>
        </div>
      `;

      masterItemList.appendChild(card);
    });
  };

  // --- INITIAL LOAD ---
  loadRolesForUserForm();
  fetchUsers();
  fetchCategories();
  fetchMasterItems();
});
