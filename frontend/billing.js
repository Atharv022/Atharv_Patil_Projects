(() => {
  const API = 'http://localhost:3000/api';

  //* ===================== GLOBAL TOAST (Billing Panel) ===================== */
  function showToast(message, type = "success", duration = 2000) {
    const toast = document.getElementById("toast");
    const msg = document.getElementById("toastMessage");

    // If toast container is missing, just log and exit (no ugly alert)
    if (!toast || !msg) {
      console.warn("Toast:", message);
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

  /* ================== Modern Confirm Function ================== */
  function showConfirm(message) {
    return new Promise((resolve) => {
      const modal  = document.getElementById("confirmModal");
      const msg    = document.getElementById("confirmMessage");
      const yesBtn = document.getElementById("confirmYes");
      const noBtn  = document.getElementById("confirmNo");

      // fallback if HTML not present
      if (!modal || !msg || !yesBtn || !noBtn) {
        const ok = confirm(message);
        resolve(ok);
        return;
      }

      msg.textContent = message;
      modal.style.display = "flex";

      const cleanup = () => {
        yesBtn.onclick = null;
        noBtn.onclick  = null;
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


  /* ===================== AUTH GUARD (Billing) ===================== */
  const token = localStorage.getItem('authToken');
  const role  = localStorage.getItem('userRole');

  // Not logged in → show toast + send to login
  if (!token) {
    showToast('⚠️ Session expired. Please login again.', 'error', 2500);
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1200); // small delay so user can read
    return;
  }

  // Wrong role → show toast + redirect to dashboard
  if (role !== 'Admin' && role !== 'Grocery Keeper') {
    showToast('⛔ Only Admin or Grocery Keeper can access Billing.', 'error', 2500);
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);
    return;
  }

  const authFetch = async (url, opts = {}) => {
    const headers = {
      ...(opts.headers || {}),
      Authorization: token,
      'Content-Type': 'application/json'
    };
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401 || res.status === 403) {
      showToast('⚠️ Session expired or unauthorized. Please login again.', 'error', 2500);
      localStorage.removeItem('authToken');
      localStorage.removeItem('userRole');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1200);
      throw new Error('Unauthorized');
    }
    return res;
  };

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userRole');
      showToast('✅ Logged out successfully.', 'info', 2000);
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1000);
    });
  }

  /* ===================== DOM REFS ===================== */
  const itemSearch     = document.getElementById('itemSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const itemSelect     = document.getElementById('itemSelect');
  const variantSelect  = document.getElementById('variantSelect');

  const qtyInput   = document.getElementById('qtyInput');
  const priceInput = document.getElementById('priceInput');
  const addBtn     = document.getElementById('addToCartBtn');

  const cartBody      = document.getElementById('cartBody');
  const discountInput = document.getElementById('discountInput');
  const taxInput      = document.getElementById('taxInput');
  const customerName  = document.getElementById('customerName');

  const subtotalLbl = document.getElementById('subtotalLbl');
  const discountLbl = document.getElementById('discountLbl');
  const taxLbl      = document.getElementById('taxLbl');
  const totalLbl    = document.getElementById('totalLbl');

  const checkoutCashBtn = document.getElementById('checkoutCashBtn');
  const checkoutUpiBtn  = document.getElementById('checkoutUpiBtn');
  const clearCartBtn    = document.getElementById('clearCartBtn');

  /* ===================== STATE ===================== */
  let allItems = [];
  const itemsMap = new Map();
  const cart = [];

  /* ===================== UTILITIES ===================== */
  const debounce = (fn, ms = 100) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const normalize = (s) =>
    (s || '')
      .toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const tokenize = (s) => normalize(s).split(' ').filter(Boolean);

  const matchQuery = (query, item) => {
    if (!query) return true;
    const hay = normalize(`${item.name} ${item.category_name || ''}`);
    return tokenize(query).every(tok => hay.includes(tok));
  };

  const currency = (n) => `₹ ${Number(n || 0).toFixed(2)}`;

  /* ===================== LOAD DATA ===================== */
  async function loadCategories() {
    const res  = await authFetch(`${API}/categories`);
    const data = await res.json();
    data.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    categoryFilter.innerHTML = '<option value="">All categories</option>';
    data.forEach(c => {
      const opt = document.createElement('option');
      opt.value = String(c.category_id);
      opt.textContent = c.name;
      categoryFilter.appendChild(opt);
    });
  }

  async function loadItems() {
    const res  = await authFetch(`${API}/items`);
    const data = await res.json();

    allItems = data.map(it => ({
      item_id: it.item_id,
      name: it.name,
      cost: Number(it.cost || 0),
      category_id: it.category_id ?? '',
      category_name: it.category_name || 'Uncategorized',
      variants: Array.isArray(it.variants)
        ? it.variants.map(v => ({
            variant_id: Number(v.variant_id),
            label: String(v.label || v.quantity_label || '').trim(),
            price: Number(v.price || 0)
          }))
        : []
    }));

    itemsMap.clear();
    allItems.forEach(it => itemsMap.set(it.item_id, it));

    renderItemOptions();
  }

  function renderItemOptions() {
    const q     = itemSearch.value || '';
    const catId = categoryFilter.value;

    const filtered = allItems.filter(it => {
      const okText = matchQuery(q, it);
      const okCat  = !catId || String(it.category_id || '') === String(catId);
      return okText && okCat;
    });

    itemSelect.innerHTML = filtered.length
      ? '<option value="">Select an item…</option>'
      : '<option value="">No items match the filter</option>';

    filtered.forEach(it => {
      const opt = document.createElement('option');
      opt.value = String(it.item_id);
      opt.textContent = `${it.name} — ${it.category_name}`;
      opt.dataset.cost = String(it.cost || 0);
      itemSelect.appendChild(opt);
    });
  }

  // build variant dropdown based on selected item
  function updateVariantOptions() {
    if (!variantSelect) return;

    variantSelect.innerHTML = '<option value="">-- Select pack / quantity --</option>';

    const id = Number(itemSelect.value);
    if (!id) return;

    const meta = itemsMap.get(id);
    if (!meta) return;

    const variants = Array.isArray(meta.variants) ? meta.variants : [];

    if (variants.length) {
      variants.forEach(v => {
        if (!v) return;
        const opt = document.createElement('option');
        opt.value = String(v.variant_id || '');
        opt.textContent = v.label
          ? `${v.label} — ₹ ${Number(v.price || 0).toFixed(2)}`
          : `₹ ${Number(v.price || 0).toFixed(2)}`;
        opt.dataset.price = String(v.price || 0);
        variantSelect.appendChild(opt);
      });
    } else {
      const base = Number(meta.cost || 0);
      if (!isNaN(base) && base > 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = `Standard — ₹ ${base.toFixed(2)}`;
        opt.dataset.price = String(base);
        variantSelect.appendChild(opt);
      }
    }
  }

  /* ===================== CART ===================== */
  function recalcTotals() {
    const discount = Math.max(0, Number(discountInput.value || 0));
    const taxPct   = Math.max(0, Number(taxInput.value || 0));

    const subtotal = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);
    const taxable  = Math.max(0, subtotal - discount);
    const taxAmt   = +(taxable * (taxPct / 100)).toFixed(2);
    const total    = +(taxable + taxAmt).toFixed(2);

    subtotalLbl.textContent = subtotal.toFixed(2);
    discountLbl.textContent = discount.toFixed(2);
    taxLbl.textContent      = taxAmt.toFixed(2);
    totalLbl.textContent    = total.toFixed(2);
  }

  function renderCart() {
    cartBody.innerHTML = '';
    if (!cart.length) {
      cartBody.innerHTML = `<tr class="cart-empty"><td colspan="5">Cart is empty</td></tr>`;
      recalcTotals();
      return;
    }

    cart.forEach((line, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${line.name}</td>
        <td class="right">${line.qty}</td>
        <td class="right">${line.unit_price.toFixed(2)}</td>
        <td class="right">${(line.unit_price * line.qty).toFixed(2)}</td>
        <td>
          <button class="btn btn-delete btn-sm" data-idx="${idx}" title="Remove">
            <i class="fas fa-times"></i>
          </button>
        </td>
      `;
      cartBody.appendChild(tr);
    });

    // modern confirm on removing line
    cartBody.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const i = Number(e.currentTarget.dataset.idx);
        const ok = await showConfirm('Do you want to remove this item?');
        if (!ok) return;
        cart.splice(i, 1);
        renderCart();
      });
    });

    recalcTotals();
  }

  /* ===================== CHECKOUT ===================== */
  async function checkout(method) {
    if (!cart.length) {
      showToast('Cart is empty.', 'error');
      return;
    }

    const discount = Math.max(0, Number(discountInput.value || 0));
    const taxPct   = Math.max(0, Number(taxInput.value || 0));

    const orderItems = cart.map(l => ({
      item_id: l.item_id,
      qty: l.qty,
      unit_price: l.unit_price
    }));

    const orderPayload = {
      customer_id: null,
      items: orderItems,
      discount_amount: discount,
      tax_percent: taxPct,
      notes: customerName.value ? `Customer: ${customerName.value}` : null
    };

    let orderId, totalAmount;
    try {
      const r = await authFetch(`${API}/orders`, {
        method: 'POST',
        body: JSON.stringify(orderPayload)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to create order');
      orderId     = d.order_id;
      totalAmount = d.total_amount;
    } catch (e) {
      showToast(`Create order failed: ${e.message}`, 'error');
      return;
    }

    let invoiceNo;
    try {
      const r = await authFetch(`${API}/orders/${orderId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ method, amount: totalAmount, generate_invoice: true })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Payment failed');
      invoiceNo = d.invoice_number || makeInvoiceLike(orderId);
    } catch (e) {
      showToast(`Payment failed: ${e.message}`, 'error');
      return;
    }

    let orderDetail;
    try {
      const r = await authFetch(`${API}/orders/${orderId}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to fetch order details');
      orderDetail = d;
    } catch (e) {
      showToast(`Fetch order failed: ${e.message}`, 'error');
      return;
    }

    openPrintWindow(orderId, invoiceNo, orderDetail);
    cart.splice(0, cart.length);
    renderCart();
    showToast('Order completed successfully.', 'success');
  }

  const makeInvoiceLike = (orderId) => {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `INV-${ymd}-${orderId}`;
  };

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function openPrintWindow(orderId, invoiceNo, detail) {
    const { order, items, payments } = detail;
    const paid = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    const rows = (items || []).map(l => `
      <tr>
        <td>${escapeHtml(l.item_name_snapshot || '')}</td>
        <td class="right">${Number(l.qty).toFixed(2)}</td>
        <td class="right">${currency(l.unit_price)}</td>
        <td class="right">${currency(l.line_total)}</td>
      </tr>`).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${invoiceNo}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:16px}
  h1,h2,h3{margin:4px 0}
  .muted{opacity:.7}
  .right{text-align:right}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border:1px solid #ddd;padding:6px}
  th{background:#f7f7f7}
  .totals{margin-top:12px}
  .totals div{display:flex;justify-content:space-between}
  .footer{margin-top:16px;font-size:12px}
  .noprint{margin-top:12px}
  @media print{
    .noprint{display:none}
    body{padding:0}
  }
</style>
</head>
<body>
  <h1>Invoice ${invoiceNo}</h1>
  <div class="muted">Order #${orderId}</div>
  <div class="muted">Date: ${new Date(order.created_at).toLocaleString()}</div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="right">Qty</th>
        <th class="right">Unit Price</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal:</span><span>${currency(order.subtotal)}</span></div>
    <div><span>Discount:</span><span>- ${currency(order.discount_amount)}</span></div>
    <div><span>Tax:</span><span>+ ${currency(order.tax_amount)}</span></div>
    <div><strong>Total:</strong><strong>${currency(order.total_amount)}</strong></div>
    <div><span>Paid:</span><span>${currency(paid)}</span></div>
    <div><span>Due:</span><span>${currency(order.total_amount - paid)}</span></div>
  </div>

  ${order.notes ? `<div style="margin-top:8px"><b>Notes:</b> ${escapeHtml(order.notes)}</div>` : ''}

  <div class="footer">Thank you for shopping with us!</div>
  <div class="noprint" style="margin-top:12px"><button onclick="window.print()">Print</button></div>
  <script>setTimeout(()=>window.print(),250);</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  /* ===================== EVENTS ===================== */
  itemSearch.addEventListener('input', debounce(renderItemOptions, 80));
  categoryFilter.addEventListener('change', renderItemOptions);

  // when item changes: rebuild pack/variant list and autofill price
  itemSelect.addEventListener('change', () => {
    updateVariantOptions();

    if (variantSelect) {
      const vOpt = variantSelect.selectedOptions[0];
      if (vOpt && vOpt.dataset.price) {
        const p = parseFloat(vOpt.dataset.price);
        if (!isNaN(p)) {
          priceInput.value = p.toFixed(2);
          return;
        }
      }
    }

    const opt = itemSelect.selectedOptions[0];
    if (opt && opt.dataset.cost) {
      const c = parseFloat(opt.dataset.cost);
      if (!isNaN(c)) priceInput.value = c.toFixed(2);
    }
  });

  // when user selects pack/variant: update price
  if (variantSelect) {
    variantSelect.addEventListener('change', () => {
      const vOpt = variantSelect.selectedOptions[0];
      if (vOpt && vOpt.dataset.price) {
        const p = parseFloat(vOpt.dataset.price);
        if (!isNaN(p)) {
          priceInput.value = p.toFixed(2);
        }
      }
    });
  }

  itemSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      itemSelect.focus();
    }
  });

  // add to cart
  addBtn.addEventListener('click', () => {
    const id  = Number(itemSelect.value);
    if (!id) {
      showToast('Select an item first.', 'error');
      return;
    }

    const meta = itemsMap.get(id);
    if (!meta) {
      showToast('Invalid item selection.', 'error');
      return;
    }

    const qty  = Math.max(1, Number(qtyInput.value || 1));

    let unit;
    if (priceInput.value !== '') {
      unit = Math.max(0, Number(priceInput.value));
    } else if (variantSelect) {
      const vOpt = variantSelect.selectedOptions[0];
      if (vOpt && vOpt.dataset && vOpt.dataset.price) {
        unit = Math.max(0, Number(vOpt.dataset.price));
      } else {
        unit = Number(meta.cost || 0);
      }
    } else {
      unit = Number(meta.cost || 0);
    }

    let displayName = meta.name;
    if (variantSelect) {
      const vOpt = variantSelect.selectedOptions[0];
      const label = vOpt && vOpt.textContent ? vOpt.textContent.split('—')[0].trim() : '';
      if (label) {
        displayName = `${meta.name} (${label})`;
      }
    }

    cart.push({ item_id: id, name: displayName, qty, unit_price: unit });

    qtyInput.value = 1;
    priceInput.value = '';
    renderCart();
    showToast('Item added to cart.', 'success');
  });

  [discountInput, taxInput].forEach(inp => inp.addEventListener('input', recalcTotals));

  clearCartBtn.addEventListener('click', async () => {
    if (!cart.length) return;
    const ok = await showConfirm('Clear the entire cart?');
    if (!ok) return;
    cart.splice(0, cart.length);
    renderCart();
    showToast('Cart cleared.', 'info');
  });

  checkoutCashBtn.addEventListener('click', () => checkout('CASH'));
  checkoutUpiBtn .addEventListener('click', () => checkout('UPI'));

  /* ===================== INIT ===================== */
  Promise.all([loadCategories(), loadItems()])
    .catch(err => {
      console.error(err);
      showToast('Failed to load items/categories. Check if backend is running.', 'error');
    });

  renderCart();
})();
