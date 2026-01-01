// change-password.js

document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'http://localhost:3000/api';

  /* ===================== GLOBAL TOAST (Change Password Panel) ===================== */
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

  const token = localStorage.getItem('authToken');

  if (!token) {
    alert('Please log in first.');
    window.location.href = 'login.html';
    return;
  }

  const form = document.getElementById('changePasswordForm');
  const currentField = document.getElementById('currentPassword');
  const newField = document.getElementById('newPassword');
  const msg = document.getElementById('changePasswordMessage');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.style.color = '';

    const currentPassword = currentField.value;
    const newPassword = newField.value;

    if (!currentPassword || !newPassword) {
      msg.textContent = 'Please fill both fields.';
      msg.style.color = 'red';
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token          // JWT token from localStorage
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.error || 'Failed to change password.';
        msg.style.color = 'red';
        return;
      }

      msg.textContent = 'Password changed successfully! Next time log in with your new password.';
      msg.style.color = 'green';
      currentField.value = '';
      newField.value = '';
    } catch (err) {
      console.error(err);
      msg.textContent = 'Network error while changing password.';
      msg.style.color = 'red';
    }
  });
});
