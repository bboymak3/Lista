/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Core Application JavaScript
   ============================================ */

const API_BASE = '/api';

// --- Token & Auth Helpers ---
function getToken() {
    return localStorage.getItem('token');
}

function setToken(token) {
    localStorage.setItem('token', token);
}

function clearToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

function getUser() {
    try {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    } catch {
        return null;
    }
}

function setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
}

// --- API Call Helper ---
async function apiCall(method, url, body = null) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
    };

    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE}${url}`, options);

        if (response.status === 401) {
            clearToken();
            showToast('Sesión expirada. Por favor inicie sesión nuevamente.', 'error');
            setTimeout(() => {
                window.location.href = getBasePath() + 'index.html';
            }, 1500);
            throw new Error('No autorizado');
        }

        if (response.status === 204) {
            return { success: true };
        }

        const data = await response.json();

        if (!response.ok) {
            const errorMsg = data.message || data.error || 'Error en la solicitud';
            throw new Error(errorMsg);
        }

        return data;
    } catch (error) {
        if (error.message === 'No autorizado') throw error;
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showToast('Error de conexión con el servidor', 'error');
            throw error;
        }
        throw error;
    }
}

// --- Base Path Helper ---
function getBasePath() {
    const path = window.location.pathname;
    if (path.includes('/pages/')) {
        return '../';
    }
    return './';
}

// --- Logout ---
function logout() {
    clearToken();
    window.location.href = getBasePath() + 'index.html';
}

// --- Auth Check ---
function checkAuth(requiredRole = null) {
    const token = getToken();
    const user = getUser();

    if (!token || !user) {
        window.location.href = getBasePath() + 'index.html';
        return false;
    }

    if (requiredRole && user.rol !== requiredRole) {
        showToast('No tiene permisos para acceder a esta página', 'error');
        setTimeout(() => {
            window.location.href = getBasePath() + 'index.html';
        }, 1500);
        return false;
    }

    return true;
}

// --- Toast Notifications ---
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const titles = {
        success: 'Éxito',
        error: 'Error',
        warning: 'Advertencia',
        info: 'Información'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            <div class="toast-title">${titles[type] || titles.info}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// --- Modal ---
function showModal(title, contentHtml, footerHtml = '') {
    let overlay = document.getElementById('modalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modalOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close" onclick="closeModal()">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">${contentHtml}</div>
            ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
        </div>
    `;

    overlay.classList.add('active');

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeModal();
    });
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// --- Loading ---
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// --- Date/Time Helpers ---
function formatDateString(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTimeString(timeStr) {
    if (!timeStr) return '-';
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        const h = parseInt(parts[0]);
        const m = parts[1];
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m} ${ampm}`;
    }
    return timeStr;
}

function formatDateTimeString(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getDayName(dayIndex) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayIndex] || '';
}

function getShortDayName(dayIndex) {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[dayIndex] || '';
}

function getMonthName(monthIndex) {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[monthIndex] || '';
}

// --- Sidebar Toggle (Mobile) ---
function initSidebar() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (toggle) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    // Close sidebar on nav click (mobile)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }
        });
    });
}

// --- Initialize User Info in Header ---
function initUserInfo() {
    const user = getUser();
    if (!user) return;

    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const avatarEl = document.getElementById('userAvatar');

    if (nameEl) {
        nameEl.textContent = `${user.nombre || ''} ${user.apellido || ''}`.trim() || user.cedula;
    }

    if (roleEl) {
        const roles = {
            admin: 'Administrador',
            profesor: 'Profesor',
            estudiante: 'Estudiante',
            representante: 'Representante'
        };
        roleEl.textContent = roles[user.rol] || user.rol;
    }

    if (avatarEl) {
        const initials = ((user.nombre?.[0] || '') + (user.apellido?.[0] || '')).toUpperCase() || 'U';
        avatarEl.textContent = initials;
    }
}

// --- Navigation Handler ---
function navigateTo(view) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(section => {
        section.style.display = 'none';
    });

    // Show target view
    const target = document.getElementById(`view-${view}`);
    if (target) {
        target.style.display = 'block';
    }

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    const activeNav = document.querySelector(`[data-view="${view}"]`);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    // Update page title
    const titleEl = document.getElementById('pageTitle');
    if (titleEl && activeNav) {
        titleEl.textContent = activeNav.querySelector('.nav-item-text')?.textContent || view;
    }
}

// --- Pagination Helper ---
function renderPagination(totalItems, currentPage, itemsPerPage, onPageChange) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return '';

    let html = '<div class="pagination">';

    html += `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})">&laquo;</button>`;

    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        html += `<button class="pagination-btn" onclick="${onPageChange}(1)">1</button>`;
        if (startPage > 2) html += '<span style="padding:0 4px">...</span>';
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += '<span style="padding:0 4px">...</span>';
        html += `<button class="pagination-btn" onclick="${onPageChange}(${totalPages})">${totalPages}</button>`;
    }

    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})">&raquo;</button>`;
    html += '</div>';

    return html;
}

// --- QR Code URL Generator ---
function getQRUrl(data, size = 200) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

// --- Escape HTML ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Confirm Dialog ---
function showConfirm(message, onConfirm) {
    const content = `<p style="color:var(--gray-600);font-size:0.9375rem;">${message}</p>`;
    const footer = `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-danger" id="confirmBtn">Confirmar</button>
    `;
    showModal('Confirmar Acción', content, footer);

    setTimeout(() => {
        const btn = document.getElementById('confirmBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                closeModal();
                if (onConfirm) onConfirm();
            });
        }
    }, 50);
}

// --- Print Helper ---
function printElement(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Imprimir</title>
            <link rel="stylesheet" href="${getBasePath()}css/styles.css">
            <style>
                body { margin: 20px; }
                @media print { body { margin: 0; } }
            </style>
        </head>
        <body>${el.innerHTML}</body>
        </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

// --- Debounce ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
