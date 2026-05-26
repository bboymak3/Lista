/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Authentication Handler
   ============================================ */

document.addEventListener('DOMContentLoaded', function() {
    // If already logged in, redirect
    const token = getToken();
    const user = getUser();
    if (token && user) {
        redirectByRole(user.rol);
        return;
    }

    const form = document.getElementById('loginForm');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');

    // Toggle password visibility
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function() {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            // Change icon
            if (type === 'text') {
                this.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
            } else {
                this.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
            }
        });
    }

    // Login form submission
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            const cedula = document.getElementById('cedula').value.trim();
            const password = document.getElementById('password').value;

            if (!cedula || !password) {
                showLoginError('Por favor complete todos los campos');
                return;
            }

            const btn = document.getElementById('loginBtn');
            const btnText = btn.querySelector('.btn-text');
            const btnLoading = btn.querySelector('.btn-loading');

            // Show loading state
            btn.disabled = true;
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline-flex';

            hideLoginError();

            try {
                const data = await apiCall('POST', '/auth/login', { cedula, password });

                if (data.token && data.user) {
                    setToken(data.token);
                    setUser(data.user);
                    showToast('Inicio de sesión exitoso', 'success');
                    setTimeout(() => redirectByRole(data.user.rol), 500);
                } else {
                    showLoginError('Respuesta inesperada del servidor');
                }
            } catch (error) {
                showLoginError(error.message || 'Error al iniciar sesión');
            } finally {
                btn.disabled = false;
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
            }
        });
    }

    function showLoginError(message) {
        if (loginError) {
            loginError.textContent = message;
            loginError.style.display = 'block';
        }
    }

    function hideLoginError() {
        if (loginError) {
            loginError.style.display = 'none';
        }
    }

    function redirectByRole(role) {
        const basePath = './';
        const routes = {
            admin: basePath + 'pages/admin.html',
            profesor: basePath + 'pages/profesor.html',
            estudiante: basePath + 'pages/estudiante.html',
            representante: basePath + 'pages/representante.html'
        };

        const url = routes[role];
        if (url) {
            window.location.href = url;
        } else {
            showLoginError('Rol de usuario no reconocido');
        }
    }
});
