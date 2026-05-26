/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Panel de Representante - JavaScript
   - Notificaciones de ausencia
   - Notas de alumnos
   - Detalle de asistencia
   ============================================ */

const representanteApp = {
    estudiantesData: [],
    pollingActive: false,

    async init() {
        try {
            await this.loadStudents();
            this.updateUnreadBadge();
            this.startNotificationPolling();
            requestBrowserNotification();
        } catch (error) {
            console.error('Error al inicializar panel de representante:', error);
            showToast('Error al cargar el panel', 'error');
        }
    },

    // ============================================
    // MIS ESTUDIANTES
    // ============================================
    async loadStudents() {
        const container = document.getElementById('studentsGrid');
        if (!container) return;
        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
        try {
            const data = await apiCall('GET', '/representante/estudiantes');
            this.estudiantesData = data.estudiantes || [];
            if (this.estudiantesData.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👨‍👩‍👧‍👦</div><div class="empty-state-title">Sin estudiantes asociados</div><div class="empty-state-text">Los estudiantes vinculados a su cuenta aparecerán aquí</div></div>';
                return;
            }
            container.innerHTML = this.estudiantesData.map(est => {
                const stats = est.resumen_asistencia || {};
                const totalP = stats.total_presente || 0;
                const totalA = stats.total_ausente || 0;
                const totalT = stats.total_tardanza || 0;
                const totalJ = stats.total_justificado || 0;
                return `<div class="student-card" onclick="representanteApp.showStudentDetail(${est.id})">
                    <div class="student-card-header">
                        <div class="student-card-avatar">${(est.nombre?.[0]||'')}${(est.apellido?.[0]||'')}</div>
                        <div>
                            <div class="student-card-name">${escapeHtml(est.nombre||'')} ${escapeHtml(est.apellido||'')}</div>
                            <div class="student-card-grade">${est.grado||'-'}° Sección "${est.seccion||'-'}" | ${escapeHtml(est.codigo_unico||'')}</div>
                        </div>
                    </div>
                    <div class="student-card-stats">
                        <div class="student-stat presente"><div class="student-stat-value">${totalP}</div><div class="student-stat-label">Presentes</div></div>
                        <div class="student-stat ausente"><div class="student-stat-value">${totalA}</div><div class="student-stat-label">Ausentes</div></div>
                        <div class="student-stat tardanza"><div class="student-stat-value">${totalT}</div><div class="student-stat-label">Tardanzas</div></div>
                    </div>
                </div>`;
            }).join('');
        } catch (e) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Error al cargar</div></div>';
        }
    },

    async showStudentDetail(estudianteId) {
        const mainView = document.getElementById('studentsGrid');
        const detailView = document.getElementById('studentDetail');
        if (mainView) mainView.style.display = 'none';
        if (detailView) detailView.style.display = 'block';
        try {
            const data = await apiCall('GET', `/representante/notas?estudiante_id=${estudianteId}`);
            const est = this.estudiantesData.find(e => e.id === estudianteId) || {};
            const nameEl = document.getElementById('detailStudentName');
            if (nameEl) nameEl.textContent = `${est.nombre||''} ${est.apellido||''} - Asistencia Detallada`;

            // Get attendance detail from estudiante endpoint
            const asistData = await apiCall('GET', `/estudiante/carnet?action=historial&limit=50`);
            const records = asistData.historial || [];
            const stats = est.resumen_asistencia || {};
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || 0; };
            set('detailPresente', stats.total_presente);
            set('detailAusente', stats.total_ausente);
            set('detailTardanza', stats.total_tardanza);
            set('detailJustificado', stats.total_justificado);

            const tbody = document.getElementById('detailTableBody');
            if (tbody) {
                const estadoLabels = { presente:'badge-success', ausente:'badge-danger', tardanza:'badge-warning', justificado:'badge-info' };
                tbody.innerHTML = records.map(r => `<tr>
                    <td>${formatDateString(r.fecha_registro||r.fecha)}</td>
                    <td>${escapeHtml(r.materia_nombre||'-')}</td>
                    <td><span class="badge ${estadoLabels[r.estado]||'badge-secondary'}">${r.estado}</span></td>
                    <td>${formatTimeString(r.hora_registro||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="table-empty">Sin registros</td></tr>';
            }
        } catch (e) { showToast('Error al cargar detalle', 'error'); }
    },

    closeStudentDetail() {
        const mainView = document.getElementById('studentsGrid');
        const detailView = document.getElementById('studentDetail');
        if (mainView) mainView.style.display = '';
        if (detailView) detailView.style.display = 'none';
    },

    // ============================================
    // NOTIFICACIONES
    // ============================================
    async loadNotifications() {
        const container = document.getElementById('notificationList');
        if (!container) return;
        try {
            const data = await apiCall('GET', '/representante/notificaciones?action=lista&limit=50');
            const notifs = data.notificaciones || [];
            if (notifs.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔔</div><div class="empty-state-title">Sin notificaciones</div><div class="empty-state-text">Las alertas de ausencia y tardanza aparecerán aquí</div></div>';
                return;
            }
            container.innerHTML = notifs.map(n => {
                const iconMap = { ausencia:'❌', tardanza:'⏰', general:'ℹ️', nota:'📝', constancia:'📄' };
                const classMap = { ausencia:'ausencia', tardanza:'tardanza', general:'info', nota:'info', constancia:'info' };
                return `<div class="notification-item ${n.leida ? '' : 'unread'}" onclick="representanteApp.markAsRead(${n.id})">
                    <div class="notification-icon ${classMap[n.tipo]||'info'}">${iconMap[n.tipo]||'ℹ️'}</div>
                    <div class="notification-content">
                        <div class="notification-title">${escapeHtml(n.titulo)}</div>
                        <div class="notification-text">${escapeHtml(n.mensaje)}</div>
                        <div class="notification-time">${formatDateTimeString(n.fecha_creacion)}</div>
                    </div>
                    ${!n.leida ? '<div class="notification-unread-dot"></div>' : ''}
                </div>`;
            }).join('');
            this.updateUnreadBadge();
        } catch (e) { container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:1rem;">Error al cargar notificaciones</p>'; }
    },

    async markAsRead(id) {
        try {
            await apiCall('PUT', '/representante/notificaciones', { id });
            this.loadNotifications();
        } catch (e) { /* silent */ }
    },

    async markAllRead() {
        try {
            await apiCall('PUT', '/representante/notificaciones', { marcar_todas: true });
            showToast('Todas las notificaciones marcadas como leídas', 'success');
            this.loadNotifications();
        } catch (e) { showToast('Error al marcar notificaciones', 'error'); }
    },

    async updateUnreadBadge() {
        try {
            const data = await apiCall('GET', '/representante/notificaciones?action=no_leidas');
            const count = data.total || 0;
            const badge = document.getElementById('unreadBadge');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline' : 'none';
            }
        } catch (e) { /* silent */ }
    },

    startNotificationPolling() {
        if (this.pollingActive) return;
        this.pollingActive = true;
        initNotificationPolling(() => this.updateUnreadBadge(), 30000);
    },

    // ============================================
    // NOTAS DE REPRESENTANTE
    // ============================================
    async loadNotasRepresentante() {
        const container = document.getElementById('notasContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
        try {
            const data = await apiCall('GET', '/representante/notas');
            const estudiantes = data.estudiantes || [];
            let html = '<h3 style="margin-bottom:1rem;">Notas de Mis Estudiantes</h3>';
            if (estudiantes.length === 0) {
                html += '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-title">Sin notas</div></div>';
            } else {
                estudiantes.forEach(est => {
                    html += `<div class="card" style="margin-bottom:1rem;">
                        <div class="card-header"><h3>${escapeHtml(est.nombre||'')} ${escapeHtml(est.apellido||'')}</h3></div>
                        <div class="card-body">`;
                    const lapsos = est.lapsos || [];
                    if (lapsos.length === 0) {
                        html += '<p style="color:var(--gray-400);text-align:center;">Sin notas registradas</p>';
                    } else {
                        lapsos.forEach(lapso => {
                            html += `<h4 style="margin:0.75rem 0 0.5rem;font-size:0.9375rem;color:var(--primary);">${escapeHtml(lapso.lapso_nombre||'')}</h4>`;
                            html += '<table><thead><tr><th>Materia</th><th>Evaluación</th><th>Nota</th></tr></thead><tbody>';
                            (lapso.materias||[]).forEach(mat => {
                                (mat.evaluaciones||[]).forEach(ev => {
                                    html += `<tr><td>${escapeHtml(mat.materia_nombre||'')}</td><td>${escapeHtml(ev.titulo||'')}</td>
                                        <td style="font-weight:700;color:var(--primary);">${ev.nota!==null&&ev.nota!==undefined?ev.nota:'-'}</td></tr>`;
                                });
                            });
                            html += '</tbody></table>';
                        });
                    }
                    html += '</div></div>';
                });
            }
            container.innerHTML = html;
        } catch (e) { container.innerHTML = '<p style="color:var(--danger);">Error al cargar notas</p>'; }
    }
};

// Navegación
const _origNavRep = navigateTo;
window.navigateTo = function(view) {
    _origNavRep(view);
    switch(view) {
        case 'misestudiantes': representanteApp.loadStudents(); break;
        case 'notificaciones': representanteApp.loadNotifications(); break;
        case 'notas': representanteApp.loadNotasRepresentante(); break;
    }
};
