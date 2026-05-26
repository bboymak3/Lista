/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Panel de Profesor - JavaScript
   Flujo: Iniciar clase → Cargar lista → Marcar P/A → Guardar
   ============================================ */

const profesorApp = {
    // --- Estado de la sesión activa ---
    sesionActiva: null,
    horarioActivo: null,
    asistenciaRegistrada: {}, // { estudianteId: 'presente'|'ausente' }

    // --- Paginación ---
    historialPage: 1,
    historialLimit: 10,

    // ============================================
    // INICIALIZACIÓN
    // ============================================
    async init() {
        try {
            await this.loadTodaySchedules();
            this.updateTodayDate();
        } catch (error) {
            console.error('Error al inicializar panel de profesor:', error);
            showToast('Error al cargar el panel del profesor', 'error');
        }
    },

    updateTodayDate() {
        const dateEl = document.getElementById('todayDate');
        if (!dateEl) return;

        const now = new Date();
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        dateEl.textContent = `${dias[now.getDay()]}, ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
    },

    // ============================================
    // CLASES DE HOY
    // ============================================
    async loadTodaySchedules() {
        const container = document.getElementById('scheduleCards');
        if (!container) return;

        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';

        try {
            const data = await apiCall('GET', '/profesor/clases?action=hoy');
            const clases = data.clases || [];

            if (clases.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📅</div>
                        <div class="empty-state-title">No hay clases hoy</div>
                        <div class="empty-state-text">Sus horarios de clase aparecerán aquí</div>
                    </div>`;
                return;
            }

            container.innerHTML = '<div class="schedule-cards-grid">' + clases.map(clase => {
                const sesionHoy = clase.sesion_hoy;
                const tieneSesion = sesionHoy && (sesionHoy.estado === 'activa' || sesionHoy.estado === 'en_curso');
                const sesionCerrada = sesionHoy && (sesionHoy.estado === 'cerrada' || sesionHoy.estado === 'finalizada');
                const totalEstudiantes = clase.total_estudiantes || 0;

                let estadoBadge = '';
                let botonAccion = '';

                if (tieneSesion) {
                    estadoBadge = '<span class="badge badge-success">En Curso</span>';
                    botonAccion = `<button class="btn btn-primary btn-sm" onclick="profesorApp.retomarClase(${clase.id}, ${sesionHoy.id})">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        Ver Asistencia
                    </button>`;
                } else if (sesionCerrada) {
                    estadoBadge = '<span class="badge badge-secondary">Finalizada</span>';
                    botonAccion = '<span style="font-size:0.8125rem;color:var(--gray-500);">Clase ya registrada</span>';
                } else {
                    estadoBadge = '<span class="badge badge-warning">Pendiente</span>';
                    botonAccion = `<button class="btn btn-primary btn-sm" onclick="profesorApp.iniciarClase(${clase.id})">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Iniciar Clase
                    </button>`;
                }

                return `
                    <div class="card schedule-card">
                        <div class="card-body">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
                                <div>
                                    <h4 style="margin:0;font-size:1rem;color:var(--gray-800);">${escapeHtml(clase.materia_nombre || 'Sin materia')}</h4>
                                    <p style="margin:0.25rem 0 0;font-size:0.8125rem;color:var(--gray-500);">Código: ${escapeHtml(clase.materia_codigo || '-')}</p>
                                </div>
                                ${estadoBadge}
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8125rem;color:var(--gray-600);">
                                <div>
                                    <span style="color:var(--gray-400);">Horario:</span> ${formatTimeString(clase.hora_inicio)} - ${formatTimeString(clase.hora_fin)}
                                </div>
                                <div>
                                    <span style="color:var(--gray-400);">Aula:</span> ${escapeHtml(clase.aula || 'Sin asignar')}
                                </div>
                                <div style="grid-column:1/-1;">
                                    <span style="color:var(--gray-400);">Estudiantes:</span> ${totalEstudiantes}
                                </div>
                            </div>
                            <div style="margin-top:0.75rem;display:flex;justify-content:flex-end;">
                                ${botonAccion}
                            </div>
                        </div>
                    </div>
                `;
            }).join('') + '</div>';

        } catch (error) {
            console.error('Error al cargar clases de hoy:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <div class="empty-state-title">Error al cargar</div>
                    <div class="empty-state-text">No se pudieron obtener las clases de hoy</div>
                </div>`;
            showToast('Error al cargar las clases de hoy', 'error');
        }
    },

    // ============================================
    // INICIAR CLASE
    // ============================================
    async iniciarClase(horarioId) {
        try {
            showLoading();

            // Try to get geolocation (optional)
            let geoData = {};
            try {
                const position = await this.getGeolocation();
                geoData.latitud = position.coords.latitude;
                geoData.longitud = position.coords.longitude;
            } catch (geoError) {
                console.log('Geolocalización no disponible, continuando sin ella:', geoError.message);
                // Continue without geolocation - it's optional
            }

            const data = await apiCall('POST', '/profesor/asistencia', {
                action: 'iniciar',
                horario_id: horarioId,
                ...geoData
            });

            this.sesionActiva = data.sesion;
            this.horarioActivo = horarioId;
            this.asistenciaRegistrada = {};

            showToast('Clase iniciada - Cargando lista de estudiantes...', 'success');

            // Load the attendance list
            await this.loadAttendanceList(data.sesion.id);

            // Show active session panel
            this.showActiveSessionPanel(data.sesion);

            // Refresh schedule cards
            this.loadTodaySchedules();
        } catch (error) {
            console.error('Error al iniciar clase:', error);
            showToast(error.message || 'Error al iniciar la clase', 'error');
        } finally {
            hideLoading();
        }
    },

    async retomarClase(horarioId, sesionId) {
        try {
            showLoading();
            this.sesionActiva = { id: sesionId };
            this.horarioActivo = horarioId;
            this.asistenciaRegistrada = {};

            await this.loadAttendanceList(sesionId);
            this.showActiveSessionPanel({ id: sesionId });
        } catch (error) {
            console.error('Error al retomar clase:', error);
            showToast(error.message || 'Error al cargar la sesión', 'error');
        } finally {
            hideLoading();
        }
    },

    getGeolocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalización no soportada'));
                return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 60000
            });
        });
    },

    showActiveSessionPanel(sesion) {
        const panel = document.getElementById('activeSession');
        if (panel) {
            panel.style.display = 'block';
        }
        // Scroll al panel
        panel?.scrollIntoView({ behavior: 'smooth' });
    },

    hideActiveSessionPanel() {
        const panel = document.getElementById('activeSession');
        if (panel) {
            panel.style.display = 'none';
        }
    },

    // ============================================
    // LISTA DE ASISTENCIA - Con checkboxes P/A
    // ============================================
    async loadAttendanceList(sesionId) {
        const container = document.getElementById('attendanceListContainer');
        if (!container) return;

        container.innerHTML = '<div class="spinner" style="margin:1rem auto;"></div>';

        try {
            const data = await apiCall('GET', `/profesor/asistencia?sesion_id=${sesionId}`);
            const estudiantes = data.estudiantes || [];
            const sesion = data.sesion || {};

            // Actualizar título con info de la materia
            const titleEl = document.getElementById('activeSessionTitle');
            if (titleEl) {
                const materiaNombre = sesion.materia_nombre || 'Clase';
                titleEl.innerHTML = `${escapeHtml(materiaNombre)} - <span style="color:var(--secondary);">En Curso</span>`;
            }

            // Actualizar hora de inicio
            const timeEl = document.getElementById('sessionStartTime');
            if (timeEl && sesion.fecha_inicio) {
                const fecha = new Date(sesion.fecha_inicio);
                timeEl.textContent = `Iniciada: ${fecha.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
            }

            if (estudiantes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="padding:1.5rem;">
                        <div class="empty-state-icon">👥</div>
                        <div class="empty-state-title">Sin estudiantes</div>
                        <div class="empty-state-text">No hay estudiantes asignados a este horario</div>
                    </div>`;
                return;
            }

            // Inicializar asistencia registrada - todos "presente" por defecto
            this.asistenciaRegistrada = {};
            estudiantes.forEach(e => {
                if (e.estado_asistencia && e.estado_asistencia !== 'sin_registro') {
                    this.asistenciaRegistrada[e.id] = e.estado_asistencia;
                } else {
                    this.asistenciaRegistrada[e.id] = 'presente'; // Default: presente
                }
            });

            // Contadores de asistencia
            let presentes = 0, ausentes = 0;
            estudiantes.forEach(e => {
                const estado = this.asistenciaRegistrada[e.id];
                if (estado === 'presente') presentes++;
                else if (estado === 'ausente') ausentes++;
            });

            let html = `
                <!-- Contadores resumen -->
                <div class="attendance-summary">
                    <div class="attendance-summary-card presente">
                        <div class="attendance-summary-number" id="countPresente">${presentes}</div>
                        <div class="attendance-summary-label">Presentes</div>
                    </div>
                    <div class="attendance-summary-card ausente">
                        <div class="attendance-summary-number" id="countAusente">${ausentes}</div>
                        <div class="attendance-summary-label">Ausentes</div>
                    </div>
                    <div class="attendance-summary-card total">
                        <div class="attendance-summary-number">${estudiantes.length}</div>
                        <div class="attendance-summary-label">Total</div>
                    </div>
                </div>

                <!-- Acciones rápidas -->
                <div class="attendance-quick-actions">
                    <button class="btn btn-outline btn-sm" onclick="profesorApp.markAllAs('presente')">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                        Todos Presentes
                    </button>
                    <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger-light);" onclick="profesorApp.markAllAs('ausente')">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        Todos Ausentes
                    </button>
                </div>
            `;

            // Lista de estudiantes con checkboxes
            html += '<div class="attendance-student-list">';

            estudiantes.forEach((e, index) => {
                const estadoActual = this.asistenciaRegistrada[e.id] || 'presente';
                const fotoUrl = e.foto ? `/api/upload?key=${encodeURIComponent(e.foto)}` : '';
                const nombreCompleto = `${escapeHtml(e.apellido)}, ${escapeHtml(e.nombre)}`;
                const esPresente = estadoActual === 'presente';
                const esAusente = estadoActual === 'ausente';

                html += `
                    <div class="attendance-item ${esAusente ? 'is-ausente' : 'is-presente'}" id="attendance-item-${e.id}">
                        <div class="attendance-item-number">${index + 1}</div>
                        <div class="attendance-photo">
                            ${fotoUrl
                                ? `<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;">`
                                : `<span class="attendance-photo-placeholder">${(e.nombre?.[0] || '')}${(e.apellido?.[0] || '')}</span>`
                            }
                        </div>
                        <div class="attendance-student-info">
                            <div class="attendance-student-name">${nombreCompleto}</div>
                            <div class="attendance-student-detail">${escapeHtml(e.codigo_unico || '')} | ${e.grado || '-'}° "${escapeHtml(e.seccion || '-')}"</div>
                        </div>
                        <div class="attendance-checkboxes">
                            <label class="attendance-check check-presente ${esPresente ? 'active' : ''}" title="Presente">
                                <input type="checkbox"
                                    id="chk-presente-${e.id}"
                                    ${esPresente ? 'checked' : ''}
                                    onchange="profesorApp.markAttendance(${e.id}, 'presente')">
                                <span class="check-icon">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                </span>
                                <span class="check-label">P</span>
                            </label>
                            <label class="attendance-check check-ausente ${esAusente ? 'active' : ''}" title="Ausente">
                                <input type="checkbox"
                                    id="chk-ausente-${e.id}"
                                    ${esAusente ? 'checked' : ''}
                                    onchange="profesorApp.markAttendance(${e.id}, 'ausente')">
                                <span class="check-icon">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </span>
                                <span class="check-label">A</span>
                            </label>
                        </div>
                    </div>
                `;
            });

            html += '</div>'; // Close attendance-student-list

            // Botón guardar flotante
            html += `
                <div class="attendance-save-bar" id="attendanceSaveBar">
                    <div class="save-bar-info">
                        <span id="saveBarPresente">${presentes} presentes</span> ·
                        <span id="saveBarAusente">${ausentes} ausentes</span>
                    </div>
                    <button class="btn btn-success" onclick="profesorApp.saveAllAttendance()" id="btnSaveAttendance">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        Guardar Asistencia
                    </button>
                </div>
            `;

            container.innerHTML = html;

        } catch (error) {
            console.error('Error al cargar lista de asistencia:', error);
            container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:1rem;">Error al cargar la lista de estudiantes</p>';
            showToast('Error al cargar la lista de asistencia', 'error');
        }
    },

    // ============================================
    // REGISTRAR ASISTENCIA - Con checkboxes P/A
    // ============================================
    markAttendance(estudianteId, estado) {
        // Actualizar estado local
        this.asistenciaRegistrada[estudianteId] = estado;

        // Actualizar checkboxes visualmente
        const chkPresente = document.getElementById(`chk-presente-${estudianteId}`);
        const chkAusente = document.getElementById(`chk-ausente-${estudianteId}`);
        const labelPresente = chkPresente?.closest('.check-presente');
        const labelAusente = chkAusente?.closest('.check-ausente');
        const item = document.getElementById(`attendance-item-${estudianteId}`);

        if (estado === 'presente') {
            if (chkPresente) chkPresente.checked = true;
            if (chkAusente) chkAusente.checked = false;
            if (labelPresente) labelPresente.classList.add('active');
            if (labelAusente) labelAusente.classList.remove('active');
            if (item) {
                item.classList.remove('is-ausente');
                item.classList.add('is-presente');
            }
        } else if (estado === 'ausente') {
            if (chkPresente) chkPresente.checked = false;
            if (chkAusente) chkAusente.checked = true;
            if (labelPresente) labelPresente.classList.remove('active');
            if (labelAusente) labelAusente.classList.add('active');
            if (item) {
                item.classList.remove('is-presente');
                item.classList.add('is-ausente');
            }
        }

        // Actualizar contadores
        this.updateAttendanceCounters();
    },

    updateAttendanceCounters() {
        let presentes = 0, ausentes = 0;
        Object.values(this.asistenciaRegistrada).forEach(estado => {
            if (estado === 'presente') presentes++;
            else if (estado === 'ausente') ausentes++;
        });

        const elP = document.getElementById('countPresente');
        const elA = document.getElementById('countAusente');
        const saveP = document.getElementById('saveBarPresente');
        const saveA = document.getElementById('saveBarAusente');

        if (elP) elP.textContent = presentes;
        if (elA) elA.textContent = ausentes;
        if (saveP) saveP.textContent = `${presentes} presentes`;
        if (saveA) saveA.textContent = `${ausentes} ausentes`;
    },

    markAllAs(estado) {
        Object.keys(this.asistenciaRegistrada).forEach(estudianteId => {
            this.markAttendance(parseInt(estudianteId), estado);
        });
        showToast(`Todos marcados como ${estado}`, 'info');
    },

    async saveAllAttendance() {
        if (!this.sesionActiva) {
            showToast('No hay una sesión activa', 'warning');
            return;
        }

        const registros = Object.entries(this.asistenciaRegistrada).map(([estudianteId, estado]) => ({
            estudiante_id: parseInt(estudianteId),
            estado: estado
        }));

        if (registros.length === 0) {
            showToast('No hay registros de asistencia para guardar', 'warning');
            return;
        }

        const btn = document.getElementById('btnSaveAttendance');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner spinner-white" style="width:16px;height:16px;border-width:2px;"></div> Guardando...';
        }

        try {
            const data = await apiCall('POST', '/profesor/asistencia', {
                sesion_id: this.sesionActiva.id,
                registros: registros
            });

            const ausentesCount = registros.filter(r => r.estado === 'ausente').length;
            let msg = data.message || 'Asistencia guardada exitosamente';
            if (ausentesCount > 0) {
                msg += ` (${ausentesCount} ausente${ausentesCount > 1 ? 's' : ''} - representante${ausentesCount > 1 ? 's' : ''} notificado${ausentesCount > 1 ? 's' : ''})`;
            }
            showToast(msg, 'success');

            // Reload list to reflect saved state
            await this.loadAttendanceList(this.sesionActiva.id);
        } catch (error) {
            console.error('Error al guardar asistencia:', error);
            showToast(error.message || 'Error al guardar la asistencia', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar Asistencia';
            }
        }
    },

    // ============================================
    // FINALIZAR CLASE
    // ============================================
    async finalizarClase() {
        if (!this.sesionActiva) {
            showToast('No hay una sesión activa para finalizar', 'warning');
            return;
        }

        // Count unmarked or present students for info
        const totalEstudiantes = Object.keys(this.asistenciaRegistrada).length;
        const ausentesActuales = Object.values(this.asistenciaRegistrada).filter(e => e === 'ausente').length;

        const msg = `¿Está seguro de que desea finalizar esta clase?` +
            (ausentesActuales > 0 ? `\n\nSe notificará a ${ausentesActuales} representante${ausentesActuales > 1 ? 's' : ''} sobre la ausencia de su representado.` : '') +
            `\n\nLos estudiantes no marcados se registrarán como ausentes automáticamente.`;

        showConfirm(msg, async () => {
            try {
                showLoading();

                // Save attendance first
                const registros = Object.entries(this.asistenciaRegistrada).map(([estudianteId, estado]) => ({
                    estudiante_id: parseInt(estudianteId),
                    estado: estado
                }));

                if (registros.length > 0) {
                    await apiCall('POST', '/profesor/asistencia', {
                        sesion_id: this.sesionActiva.id,
                        registros: registros
                    });
                }

                // Close session
                const closeData = await apiCall('PUT', '/profesor/asistencia', {
                    sesion_id: this.sesionActiva.id
                });

                let closeMsg = 'Clase finalizada exitosamente';
                if (closeData.auto_marked_ausente > 0) {
                    closeMsg += ` - ${closeData.auto_marked_ausente} estudiante(s) marcado(s) como ausente(s) automáticamente`;
                }

                this.sesionActiva = null;
                this.horarioActivo = null;
                this.asistenciaRegistrada = {};

                this.hideActiveSessionPanel();
                showToast(closeMsg, 'success');
                this.loadTodaySchedules();
            } catch (error) {
                console.error('Error al finalizar clase:', error);
                showToast(error.message || 'Error al finalizar la clase', 'error');
            } finally {
                hideLoading();
            }
        });
    },

    // ============================================
    // HISTORIAL
    // ============================================
    async loadHistorial(page = 1) {
        this.historialPage = page;
        const tbody = document.getElementById('historialTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><div class="spinner"></div> Cargando historial...</td></tr>';

        try {
            const data = await apiCall('GET', `/profesor/clases?action=historial&page=${page}&limit=${this.historialLimit}`);
            const sesiones = data.sesiones || [];

            if (sesiones.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No hay registros en el historial</td></tr>';
                document.getElementById('historialPagination').innerHTML = '';
                return;
            }

            // For each session, get attendance counts
            tbody.innerHTML = sesiones.map(s => {
                return `
                    <tr>
                        <td>${formatDateString(s.fecha_inicio)}</td>
                        <td>${escapeHtml(s.materia_nombre || '-')}</td>
                        <td>${escapeHtml(s.aula || '-')}</td>
                        <td style="color:var(--secondary);font-weight:600;">${s.presentes || '-'}</td>
                        <td style="color:var(--danger);font-weight:600;">${s.ausentes || '-'}</td>
                        <td style="color:var(--warning-dark);font-weight:600;">${s.tardanzas || '-'}</td>
                        <td style="font-weight:600;">${s.total || '-'}</td>
                    </tr>
                `;
            }).join('');

            // Paginación
            const paginationHtml = renderPagination(
                data.pagination.total,
                data.pagination.page,
                this.historialLimit,
                'profesorApp.loadHistorial'
            );
            document.getElementById('historialPagination').innerHTML = paginationHtml;

        } catch (error) {
            console.error('Error al cargar historial:', error);
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Error al cargar el historial</td></tr>';
            showToast('Error al cargar el historial de asistencias', 'error');
        }
    }
};

// ============================================
// NAVEGACIÓN - Cargar datos al cambiar vista
// ============================================
const _originalNavigateToProfesor = navigateTo;
window.navigateTo = function(view) {
    _originalNavigateToProfesor(view);

    switch (view) {
        case 'miclase':
            profesorApp.loadTodaySchedules();
            break;
        case 'historial':
            profesorApp.loadHistorial(profesorApp.historialPage);
            break;
    }
};
