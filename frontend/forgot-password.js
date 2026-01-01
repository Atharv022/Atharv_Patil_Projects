// forgot-password.js

document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'http://localhost:3000/api';

  /* ===================== GLOBAL TOAST (Forgot Password Panel) ===================== */
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


  // --- STEP 1: FORGOT (get token) ---
  const forgotForm = document.getElementById('forgotForm');
  const fpUsername = document.getElementById('fpUsername');
  const forgotMessage = document.getElementById('forgotMessage');

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    forgotMessage.textContent = '';
    forgotMessage.style.color = '';

    const username = fpUsername.value.trim();
    if (!username) {
      forgotMessage.textContent = 'Please enter your username.';
      forgotMessage.style.color = 'red';
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      const data = await res.json();
      if (!res.ok) {
        forgotMessage.textContent = data.error || 'Failed to generate reset token.';
        forgotMessage.style.color = 'red';
        return;
      }

      // Show token (in real life you would email it)
      forgotMessage.innerHTML = `
        Token generated successfully.<br>
        <strong>Reset Token:</strong> ${data.resetToken}<br>
        Copy this token and paste it in Step 2 below.
      `;
      forgotMessage.style.color = 'green';
    } catch (err) {
      console.error(err);
      forgotMessage.textContent = 'Network error while requesting reset token.';
      forgotMessage.style.color = 'red';
    }
  });

  // --- STEP 2: RESET (use token + new password) ---
  const resetForm = document.getElementById('resetForm');
  const resetToken = document.getElementById('resetToken');
  const resetNewPassword = document.getElementById('resetNewPassword');
  const resetMessage = document.getElementById('resetMessage');

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    resetMessage.textContent = '';
    resetMessage.style.color = '';

    const token = resetToken.value.trim();
    const newPassword = resetNewPassword.value;

    if (!token || !newPassword) {
      resetMessage.textContent = 'Please enter both token and new password.';
      resetMessage.style.color = 'red';
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        resetMessage.textContent = data.error || 'Failed to reset password.';
        resetMessage.style.color = 'red';
        return;
      }

      resetMessage.textContent =
        'Password reset successfully! You can now log in with your new password.';
      resetMessage.style.color = 'green';
      resetToken.value = '';
      resetNewPassword.value = '';
    } catch (err) {
      console.error(err);
      resetMessage.textContent = 'Network error while resetting password.';
      resetMessage.style.color = 'red';
    }
  });
});
