/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Panel de Profesor - JavaScript v2
   - QR Bidireccional (escanear alumnos / permitir que alumnos escaneen)
   - Diario de inicio de labores
   - Notas, Lapsos, Evaluaciones
   - Geolocalización
   ============================================ */

const profesorApp = {
    sesionActiva: null,
    horarioActivo: null,
    asistenciaRegistrada: {},
    qrScanner: null,
    permitirEscaneoAlumnos: false,
    historialPage: 1,
    historialLimit: 10,

    async init() {
        try {
            await this.loadTodaySchedules();
            this.updateTodayDate();
            await this.checkDiarioStatus();
        } catch (error) {
            console.error('Error al inicializar panel de profesor:', error);
            showToast('Error al cargar el panel del profesor', 'error');
        }
    },

    updateTodayDate() {
        const dateEl = document.getElementById('todayDate');
        if (!dateEl) return;
        const now = new Date();
        const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        dateEl.textContent = `${dias[now.getDay()]}, ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
    },

    // ============================================
    // GEOLOCALIZACIÓN
    // ============================================
    getGeolocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalización no disponible en este dispositivo'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
                err => reject(new Error('No se pudo obtener la ubicación. Habilite el GPS.')),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    },

    // ============================================
    // DIARIO DE LABORES
    // ============================================
    async checkDiarioStatus() {
        try {
            const data = await apiCall('GET', '/profesor/diario');
            this.diarioData = data.diario || null;
            this.updateDiarioUI();
        } catch (e) { console.error('Error diario:', e); }
    },

    updateDiarioUI() {
        const el = document.getElementById('diarioStatus');
        if (!el) return;
        if (this.diarioData && this.diarioData.hora_entrada && !this.diarioData.hora_salida) {
            el.innerHTML = `<span class="badge badge-success">Checked In: ${formatTimeString(this.diarioData.hora_entrada)}</span>
                <button class="btn btn-warning btn-sm" onclick="profesorApp.checkOut()" style="margin-left:8px;">Registrar Salida</button>`;
        } else if (this.diarioData && this.diarioData.hora_salida) {
            el.innerHTML = `<span class="badge badge-secondary">Jornada completada</span>`;
        } else {
            el.innerHTML = `<button class="btn btn-success btn-sm" onclick="profesorApp.checkIn()">Registrar Entrada</button>`;
        }
    },

    async checkIn() {
        try {
            showLoading();
            const geo = await this.getGeolocation();
            const data = await apiCall('POST', '/profesor/diario', geo);
            if (data.geoWarning) {
                showToast('⚠️ ' + data.geoWarning, 'warning');
            }
            showToast('Entrada registrada exitosamente', 'success');
            await this.checkDiarioStatus();
        } catch (e) {
            showToast(e.message || 'Error al registrar entrada', 'error');
        } finally { hideLoading(); }
    },

    async checkOut() {
        try {
            showLoading();
            const geo = await this.getGeolocation();
            const data = await apiCall('PUT', '/profesor/diario', geo);
            if (data.geoWarning) {
                showToast('⚠️ ' + data.geoWarning, 'warning');
            }
            showToast('Salida registrada exitosamente', 'success');
            await this.checkDiarioStatus();
        } catch (e) {
            showToast(e.message || 'Error al registrar salida', 'error');
        } finally { hideLoading(); }
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
                container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">No hay clases hoy</div><div class="empty-state-text">Sus horarios de clase aparecerán aquí</div></div>`;
                return;
            }
            container.innerHTML = '<div class="schedule-cards-grid">' + clases.map(clase => {
                const sesionHoy = clase.sesion_hoy;
                const tieneSesion = sesionHoy && (sesionHoy.estado === 'activa' || sesionHoy.estado === 'en_curso');
                const sesionCerrada = sesionHoy && (sesionHoy.estado === 'cerrada' || sesionHoy.estado === 'finalizada');
                const totalEstudiantes = clase.total_estudiantes || 0;
                let estadoBadge = '', botonAccion = '';
                if (tieneSesion) {
                    estadoBadge = '<span class="badge badge-success">En Curso</span>';
                    botonAccion = `<button class="btn btn-primary btn-sm" onclick="profesorApp.retomarClase(${clase.id}, ${sesionHoy.id})">Ver Asistencia</button>`;
                } else if (sesionCerrada) {
                    estadoBadge = '<span class="badge badge-secondary">Finalizada</span>';
                    botonAccion = '<span style="font-size:0.8125rem;color:var(--gray-500);">Clase ya registrada</span>';
                } else {
                    estadoBadge = '<span class="badge badge-warning">Pendiente</span>';
                    botonAccion = `<button class="btn btn-primary btn-sm" onclick="profesorApp.iniciarClase(${clase.id})">Iniciar Clase</button>`;
                }
                return `<div class="card schedule-card"><div class="card-body">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
                        <div><h4 style="margin:0;font-size:1rem;color:var(--gray-800);">${escapeHtml(clase.materia_nombre||'Sin materia')}</h4>
                        <p style="margin:0.25rem 0 0;font-size:0.8125rem;color:var(--gray-500);">Sección: ${escapeHtml(clase.seccion||'-')}</p></div>
                        ${estadoBadge}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8125rem;color:var(--gray-600);">
                        <div><span style="color:var(--gray-400);">Horario:</span> ${formatTimeString(clase.hora_inicio)} - ${formatTimeString(clase.hora_fin)}</div>
                        <div><span style="color:var(--gray-400);">Aula:</span> ${escapeHtml(clase.aula||'Sin asignar')}</div>
                        <div style="grid-column:1/-1;"><span style="color:var(--gray-400);">Estudiantes:</span> ${totalEstudiantes}</div>
                    </div>
                    <div style="margin-top:0.75rem;display:flex;justify-content:flex-end;gap:0.5rem;">${botonAccion}
                        ${!sesionCerrada ? `<button class="btn btn-outline btn-sm" onclick="profesorApp.showQRClase(${clase.id})">QR Clase</button>` : ''}
                    </div></div></div>`;
            }).join('') + '</div>';
        } catch (error) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Error al cargar</div></div>`;
            showToast('Error al cargar las clases de hoy', 'error');
        }
    },

    // ============================================
    // INICIAR CLASE CON GEOLOCALIZACIÓN
    // ============================================
    async iniciarClase(horarioId) {
        try {
            showLoading();
            let geo = {};
            try { geo = await this.getGeolocation(); } catch(e) {
                showToast('No se pudo obtener ubicación. Se continuará sin validación de ubicación.', 'warning');
            }
            const data = await apiCall('POST', '/profesor/asistencia', { action: 'iniciar', horario_id: horarioId, ...geo });
            this.sesionActiva = data.sesion;
            this.horarioActivo = horarioId;
            this.asistenciaRegistrada = {};
            this.permitirEscaneoAlumnos = false;
            if (data.geoWarning) {
                showToast('⚠️ ' + data.geoWarning, 'warning');
            }
            showToast('Sesión de asistencia iniciada', 'success');
            await this.loadAttendanceList(data.sesion.id);
            this.showActiveSessionPanel(data.sesion);
            this.loadTodaySchedules();
        } catch (error) {
            showToast(error.message || 'Error al iniciar la clase', 'error');
        } finally { hideLoading(); }
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
            showToast(error.message || 'Error al cargar la sesión', 'error');
        } finally { hideLoading(); }
    },

    showActiveSessionPanel(sesion) {
        const panel = document.getElementById('activeSession');
        if (panel) panel.style.display = 'block';
        panel?.scrollIntoView({ behavior: 'smooth' });
    },

    hideActiveSessionPanel() {
        const panel = document.getElementById('activeSession');
        if (panel) panel.style.display = 'none';
    },

    // ============================================
    // LISTA DE ASISTENCIA
    // ============================================
    async loadAttendanceList(sesionId) {
        const container = document.getElementById('attendanceListContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner" style="margin:1rem auto;"></div>';
        try {
            const data = await apiCall('GET', `/profesor/asistencia?sesion_id=${sesionId}`);
            const estudiantes = data.estudiantes || [];
            const sesion = data.sesion || {};
            const titleEl = document.getElementById('activeSessionTitle');
            if (titleEl) titleEl.textContent = `Clase en Curso - Sesión #${sesionId}`;

            if (estudiantes.length === 0) {
                container.innerHTML = `<div class="empty-state" style="padding:1.5rem;"><div class="empty-state-icon">👥</div><div class="empty-state-title">Sin estudiantes</div></div>`;
                return;
            }

            let presentes=0, ausentes=0, tardanzas=0, justificados=0;
            estudiantes.forEach(e => {
                if (e.estado_asistencia==='presente') presentes++;
                else if (e.estado_asistencia==='ausente') ausentes++;
                else if (e.estado_asistencia==='tardanza') tardanzas++;
                else if (e.estado_asistencia==='justificado') justificados++;
            });

            let html = `
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1rem;">
                    <div style="text-align:center;padding:0.75rem;background:var(--secondary-light);border-radius:0.5rem;">
                        <div style="font-size:1.25rem;font-weight:700;color:var(--secondary);" id="countPresente">${presentes}</div>
                        <div style="font-size:0.75rem;color:var(--secondary-dark);">Presentes</div></div>
                    <div style="text-align:center;padding:0.75rem;background:var(--danger-light);border-radius:0.5rem;">
                        <div style="font-size:1.25rem;font-weight:700;color:var(--danger);" id="countAusente">${ausentes}</div>
                        <div style="font-size:0.75rem;color:var(--danger-dark);">Ausentes</div></div>
                    <div style="text-align:center;padding:0.75rem;background:var(--warning-light);border-radius:0.5rem;">
                        <div style="font-size:1.25rem;font-weight:700;color:var(--warning);" id="countTardanza">${tardanzas}</div>
                        <div style="font-size:0.75rem;color:var(--warning-dark);">Tardanzas</div></div>
                    <div style="text-align:center;padding:0.75rem;background:var(--info-light);border-radius:0.5rem;">
                        <div style="font-size:1.25rem;font-weight:700;color:var(--info);" id="countJustificado">${justificados}</div>
                        <div style="font-size:0.75rem;color:var(--info);">Justificados</div></div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem;">
                    <div style="display:flex;gap:0.5rem;">
                        <button class="btn btn-outline btn-sm" onclick="profesorApp.markAllAs('presente')">Todos Presentes</button>
                        <button class="btn btn-success btn-sm" onclick="profesorApp.saveAllAttendance()">Guardar Asistencia</button>
                    </div>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="btn btn-outline btn-sm" onclick="profesorApp.toggleEscanearQR()" id="btnEscanearQR">
                            📷 Escanear QR Alumnos
                        </button>
                        <button class="btn ${this.permitirEscaneoAlumnos ? 'btn-success' : 'btn-outline'} btn-sm" onclick="profesorApp.togglePermitirEscaneoAlumnos()" id="btnPermitirEscaneo">
                            📱 Permitir que alumnos escaneen mi QR
                        </button>
                    </div>
                </div>
                <div id="qrScannerContainer" style="display:none;margin-bottom:1rem;">
                    <div class="card"><div class="card-body" style="text-align:center;">
                        <h4>Escanear QR de Alumnos</h4>
                        <p style="font-size:0.8125rem;color:var(--gray-500);">Apunte la cámara al código QR del carnet del alumno</p>
                        <div id="qrReader" style="width:100%;max-width:400px;margin:0 auto;"></div>
                        <button class="btn btn-danger btn-sm" onclick="profesorApp.stopQRScanner()" style="margin-top:0.5rem;">Cerrar Escáner</button>
                    </div></div>
                </div>
                <div id="profesorQRDisplay" style="display:none;margin-bottom:1rem;">
                    <div class="card"><div class="card-body" style="text-align:center;">
                        <h4>Mi QR de Clase</h4>
                        <p style="font-size:0.8125rem;color:var(--gray-500);">Los alumnos pueden escanear este código para marcar su asistencia</p>
                        <div id="profesorQRImage" style="margin:1rem auto;"></div>
                        <button class="btn btn-danger btn-sm" onclick="profesorApp.desactivarEscaneoAlumnos()">Desactivar Escaneo de Alumnos</button>
                    </div></div>
                </div>`;

            html += '<div class="attendance-student-list">';
            estudiantes.forEach(e => {
                const estadoActual = e.estado_asistencia || 'sin_registro';
                const fotoUrl = e.foto ? `/api/upload?key=${encodeURIComponent(e.foto)}` : '';
                const nombreCompleto = `${escapeHtml(e.apellido)}, ${escapeHtml(e.nombre)}`;
                html += `<div class="attendance-item" id="attendance-item-${e.id}" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;border:1px solid var(--gray-200);border-radius:0.5rem;margin-bottom:0.5rem;">
                    <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--gray-100);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        ${fotoUrl ? `<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:0.75rem;color:var(--gray-400);">${(e.nombre?.[0]||'')}${(e.apellido?.[0]||'')}</span>`}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.875rem;font-weight:500;color:var(--gray-800);">${nombreCompleto}</div>
                        <div style="font-size:0.75rem;color:var(--gray-400);">${escapeHtml(e.codigo_unico||'')} | ${e.grado}° "${e.seccion}"</div>
                    </div>
                    <div style="display:flex;gap:0.25rem;flex-shrink:0;">
                        <button class="btn-attendance btn-presente ${estadoActual==='presente'?'active':''}" onclick="profesorApp.markAttendance(${e.id},'presente')" title="Presente">P</button>
                        <button class="btn-attendance btn-ausente ${estadoActual==='ausente'?'active':''}" onclick="profesorApp.markAttendance(${e.id},'ausente')" title="Ausente">A</button>
                        <button class="btn-attendance btn-tardanza ${estadoActual==='tardanza'?'active':''}" onclick="profesorApp.markAttendance(${e.id},'tardanza')" title="Tardanza">T</button>
                        <button class="btn-attendance btn-justificado ${estadoActual==='justificado'?'active':''}" onclick="profesorApp.markAttendance(${e.id},'justificado')" title="Justificado">J</button>
                    </div>
                </div>`;
            });
            html += '</div>';
            container.innerHTML = html;

            estudiantes.forEach(e => {
                if (e.estado_asistencia && e.estado_asistencia !== 'sin_registro') {
                    this.asistenciaRegistrada[e.id] = e.estado_asistencia;
                }
            });
        } catch (error) {
            container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:1rem;">Error al cargar la lista</p>';
            showToast('Error al cargar la lista de asistencia', 'error');
        }
    },

    // ============================================
    // QR BIDIRECCIONAL
    // ============================================
    async showQRClase(horarioId) {
        try {
            const data = await apiCall('GET', `/profesor/qr?horario_id=${horarioId}`);
            const qrUrl = data.qr_url || getQRUrl(data.qr_data || JSON.stringify(data), 300);
            showModal('QR de Clase', `
                <div style="text-align:center;">
                    <p style="margin-bottom:1rem;color:var(--gray-500);">Los alumnos pueden escanear este código para marcar asistencia</p>
                    <img src="${qrUrl}" alt="QR Clase" style="max-width:300px;border:3px solid var(--gray-200);border-radius:8px;padding:8px;">
                    <p style="margin-top:0.75rem;font-size:0.8125rem;color:var(--gray-400);">Código: ${escapeHtml(data.codigo || '')}</p>
                </div>
            `);
        } catch (e) {
            showToast(e.message || 'Error al generar QR', 'error');
        }
    },

    toggleEscanearQR() {
        const container = document.getElementById('qrScannerContainer');
        if (!container) return;
        if (container.style.display === 'none') {
            container.style.display = 'block';
            this.startQRScanner();
        } else {
            this.stopQRScanner();
        }
    },

    startQRScanner() {
        if (!window.Html5Qrcode) {
            showToast('Librería de escáner QR no cargada. Recargue la página.', 'error');
            return;
        }
        try {
            this.qrScanner = new Html5Qrcode('qrReader');
            this.qrScanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => { this.onQRScanned(decodedText); },
                () => {} // ignore errors during scan
            ).catch(e => {
                showToast('No se pudo acceder a la cámara: ' + e.message, 'error');
            });
        } catch (e) {
            showToast('Error al iniciar escáner QR: ' + e.message, 'error');
        }
    },

    stopQRScanner() {
        if (this.qrScanner) {
            this.qrScanner.stop().then(() => {
                this.qrScanner.clear();
                this.qrScanner = null;
            }).catch(() => {});
        }
        const container = document.getElementById('qrScannerContainer');
        if (container) container.style.display = 'none';
    },

    async onQRScanned(qrData) {
        try {
            // qrData puede ser un JSON con estudiante info o un código directo
            let codigoEstudiante = qrData;
            try {
                const parsed = JSON.parse(qrData);
                codigoEstudiante = parsed.codigo_unico || parsed.qr_code || parsed.estudiante_id || qrData;
            } catch(e) {}

            showToast(`QR escaneado: ${codigoEstudiante}`, 'info');
            this.stopQRScanner();

            // Buscar estudiante por código QR y marcar como presente
            if (this.sesionActiva) {
                // Buscar el estudiante en la lista actual
                const items = document.querySelectorAll('.attendance-item');
                let found = false;
                items.forEach(item => {
                    const idMatch = item.id.match(/attendance-item-(\d+)/);
                    if (idMatch) {
                        const detailEl = item.querySelector('[data-codigo]');
                        if (detailEl && detailEl.dataset.codigo === codigoEstudiante) {
                            const id = parseInt(idMatch[1]);
                            this.markAttendance(id, 'presente');
                            found = true;
                            showToast('Alumno marcado como presente', 'success');
                        }
                    }
                });

                // Si no se encontró por código en la UI, intentar vía API
                if (!found) {
                    await apiCall('POST', '/profesor/asistencia', {
                        sesion_id: this.sesionActiva.id,
                        registros: [{ qr_data: codigoEstudiante, estado: 'presente' }]
                    });
                    showToast('Asistencia registrada por QR', 'success');
                    await this.loadAttendanceList(this.sesionActiva.id);
                }
            }
        } catch (e) {
            showToast('Error al procesar QR: ' + e.message, 'error');
        }
    },

    async togglePermitirEscaneoAlumnos() {
        if (!this.sesionActiva) {
            showToast('Debe iniciar una clase primero', 'warning');
            return;
        }
        this.permitirEscaneoAlumnos = !this.permitirEscaneoAlumnos;
        const btn = document.getElementById('btnPermitirEscaneo');
        if (btn) {
            btn.className = `btn ${this.permitirEscaneoAlumnos ? 'btn-success' : 'btn-outline'} btn-sm`;
        }

        if (this.permitirEscaneoAlumnos) {
            // Mostrar QR del profesor para que los alumnos escaneen
            try {
                const data = await apiCall('GET', `/profesor/qr?horario_id=${this.horarioActivo}`);
                const qrUrl = data.qr_url || getQRUrl(data.qr_data || JSON.stringify(data), 300);
                const display = document.getElementById('profesorQRDisplay');
                const imgContainer = document.getElementById('profesorQRImage');
                if (display && imgContainer) {
                    imgContainer.innerHTML = `<img src="${qrUrl}" alt="QR Profesor" style="max-width:300px;border:3px solid var(--primary);border-radius:8px;padding:8px;">`;
                    display.style.display = 'block';
                }
                showToast('Los alumnos ahora pueden escanear su QR para marcar asistencia', 'success');
            } catch (e) {
                showToast('Error al generar QR: ' + e.message, 'error');
                this.permitirEscaneoAlumnos = false;
            }
        } else {
            const display = document.getElementById('profesorQRDisplay');
            if (display) display.style.display = 'none';
            showToast('Escaneo de alumnos desactivado', 'info');
        }
    },

    desactivarEscaneoAlumnos() {
        this.permitirEscaneoAlumnos = false;
        const btn = document.getElementById('btnPermitirEscaneo');
        if (btn) btn.className = 'btn btn-outline btn-sm';
        const display = document.getElementById('profesorQRDisplay');
        if (display) display.style.display = 'none';
        showToast('Escaneo de alumnos desactivado', 'info');
    },

    // ============================================
    // REGISTRAR ASISTENCIA MANUAL
    // ============================================
    markAttendance(estudianteId, estado) {
        this.asistenciaRegistrada[estudianteId] = estado;
        const item = document.getElementById(`attendance-item-${estudianteId}`);
        if (!item) return;
        const buttons = item.querySelectorAll('.btn-attendance');
        buttons.forEach(btn => btn.classList.remove('active'));
        const estados = { presente:'btn-presente', ausente:'btn-ausente', tardanza:'btn-tardanza', justificado:'btn-justificado' };
        const btnClass = estados[estado];
        if (btnClass) { const btn = item.querySelector(`.${btnClass}`); if (btn) btn.classList.add('active'); }
        this.updateAttendanceCounters();
    },

    updateAttendanceCounters() {
        let p=0,a=0,t=0,j=0;
        Object.values(this.asistenciaRegistrada).forEach(e => {
            if (e==='presente') p++; else if (e==='ausente') a++; else if (e==='tardanza') t++; else if (e==='justificado') j++;
        });
        const elP=document.getElementById('countPresente'), elA=document.getElementById('countAusente');
        const elT=document.getElementById('countTardanza'), elJ=document.getElementById('countJustificado');
        if (elP) elP.textContent=p; if (elA) elA.textContent=a; if (elT) elT.textContent=t; if (elJ) elJ.textContent=j;
    },

    markAllAs(estado) {
        document.querySelectorAll('.attendance-item').forEach(item => {
            const m = item.id.match(/attendance-item-(\d+)/);
            if (m) this.markAttendance(parseInt(m[1]), estado);
        });
        showToast(`Todos marcados como ${estado}`, 'info');
    },

    async saveAllAttendance() {
        if (!this.sesionActiva) { showToast('No hay sesión activa', 'warning'); return; }
        const registros = Object.entries(this.asistenciaRegistrada).map(([id, estado]) => ({ estudiante_id: parseInt(id), estado }));
        if (registros.length === 0) { showToast('No hay registros para guardar', 'warning'); return; }
        try {
            showLoading();
            const data = await apiCall('POST', '/profesor/asistencia', { sesion_id: this.sesionActiva.id, registros });
            showToast(data.message || 'Asistencia guardada exitosamente', 'success');
            await this.loadAttendanceList(this.sesionActiva.id);
        } catch (e) { showToast(e.message || 'Error al guardar', 'error'); }
        finally { hideLoading(); }
    },

    // ============================================
    // FINALIZAR CLASE
    // ============================================
    async finalizarClase() {
        if (!this.sesionActiva) return;
        showConfirm('¿Finalizar esta clase? No podrá registrar más asistencias.', async () => {
            try {
                showLoading();
                if (Object.keys(this.asistenciaRegistrada).length > 0) {
                    const registros = Object.entries(this.asistenciaRegistrada).map(([id, estado]) => ({ estudiante_id: parseInt(id), estado }));
                    await apiCall('POST', '/profesor/asistencia', { sesion_id: this.sesionActiva.id, registros });
                }
                await apiCall('PUT', '/profesor/asistencia', { sesion_id: this.sesionActiva.id });
                this.stopQRScanner();
                this.desactivarEscaneoAlumnos();
                this.sesionActiva = null;
                this.horarioActivo = null;
                this.asistenciaRegistrada = {};
                this.hideActiveSessionPanel();
                showToast('Clase finalizada exitosamente', 'success');
                this.loadTodaySchedules();
            } catch (e) { showToast(e.message || 'Error al finalizar', 'error'); }
            finally { hideLoading(); }
        });
    },

    // ============================================
    // HISTORIAL
    // ============================================
    async loadHistorial(page = 1) {
        this.historialPage = page;
        const tbody = document.getElementById('historialTableBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><div class="spinner"></div> Cargando...</td></tr>';
        try {
            const data = await apiCall('GET', `/profesor/clases?action=historial&page=${page}&limit=${this.historialLimit}`);
            const sesiones = data.sesiones || [];
            if (sesiones.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No hay registros</td></tr>';
                document.getElementById('historialPagination').innerHTML = '';
                return;
            }
            tbody.innerHTML = sesiones.map(s => `<tr>
                <td>${formatDateString(s.fecha_inicio || s.fecha)}</td>
                <td>${escapeHtml(s.materia_nombre||'-')}</td>
                <td>${escapeHtml(s.aula||'-')}</td>
                <td style="color:var(--secondary);font-weight:600;">${s.presentes||0}</td>
                <td style="color:var(--danger);font-weight:600;">${s.ausentes||0}</td>
                <td style="color:var(--warning);font-weight:600;">${s.tardanzas||0}</td>
                <td style="font-weight:600;">${s.total||0}</td>
            </tr>`).join('');
            const paginationHtml = renderPagination(data.pagination?.total||0, data.pagination?.page||1, this.historialLimit, 'profesorApp.loadHistorial');
            document.getElementById('historialPagination').innerHTML = paginationHtml;
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Error al cargar</td></tr>';
        }
    },

    // ============================================
    // NOTAS Y EVALUACIONES
    // ============================================
    async loadNotas() {
        const container = document.getElementById('notasContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
        try {
            const lapsosData = await apiCall('GET', '/admin/lapsos');
            const lapsos = lapsosData.lapsos || [];
            const clasesData = await apiCall('GET', '/profesor/clases?action=todos');
            const materias = [];
            (clasesData.clases || []).forEach(c => {
                if (!materias.find(m => m.materia_id === c.materia_id)) {
                    materias.push({ materia_id: c.materia_id, materia_nombre: c.materia_nombre, materia_codigo: c.materia_codigo });
                }
            });

            let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3>Evaluaciones y Notas</h3>
                <button class="btn btn-primary btn-sm" onclick="profesorApp.showEvaluacionModal()">Nueva Evaluación</button>
            </div>`;

            // Filtros
            html += `<div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
                <select class="form-control" id="filterMateriaNotas" style="width:auto;" onchange="profesorApp.loadEvaluaciones()">
                    <option value="">Todas las materias</option>
                    ${materias.map(m => `<option value="${m.materia_id}">${escapeHtml(m.materia_nombre)}</option>`).join('')}
                </select>
                <select class="form-control" id="filterLapsoNotas" style="width:auto;" onchange="profesorApp.loadEvaluaciones()">
                    <option value="">Todos los lapsos</option>
                    ${lapsos.map(l => `<option value="${l.id}">${escapeHtml(l.nombre)} (${l.periodo_escolar})</option>`).join('')}
                </select>
            </div>`;

            html += '<div id="evaluacionesList"></div>';
            container.innerHTML = html;
            await this.loadEvaluaciones();
        } catch (e) {
            container.innerHTML = `<p style="color:var(--danger);text-align:center;">Error al cargar notas</p>`;
        }
    },

    async loadEvaluaciones() {
        const listEl = document.getElementById('evaluacionesList');
        if (!listEl) return;
        const materiaId = document.getElementById('filterMateriaNotas')?.value || '';
        const lapsoId = document.getElementById('filterLapsoNotas')?.value || '';
        let url = '/profesor/notas?';
        if (materiaId) url += `materia_id=${materiaId}&`;
        if (lapsoId) url += `lapso_id=${lapsoId}`;
        try {
            const data = await apiCall('GET', url);
            const evaluaciones = data.evaluaciones || [];
            if (evaluaciones.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-title">Sin evaluaciones</div></div>';
                return;
            }
            listEl.innerHTML = evaluaciones.map(ev => `<div class="card" style="margin-bottom:0.75rem;">
                <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                    <div>
                        <h4 style="margin:0;font-size:0.9375rem;">${escapeHtml(ev.titulo)}</h4>
                        <p style="margin:0;font-size:0.8125rem;color:var(--gray-500);">${escapeHtml(ev.materia_nombre||'')} | ${escapeHtml(ev.lapso_nombre||'')} | Ponderación: ${ev.ponderacion||0}%</p>
                    </div>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                        <button class="btn btn-success btn-sm" onclick="profesorApp.showCalificarModal(${ev.id})">Calificar</button>
                        <button class="btn btn-outline btn-sm" onclick="profesorApp.showEvaluacionModal(${ev.id})">Editar</button>
                        <button class="btn btn-success btn-sm" onclick="profesorApp.enviarCalificaciones(${ev.id})" title="Enviar calificaciones a representantes">📤 Enviar</button>
                        <button class="btn btn-danger btn-sm" onclick="profesorApp.deleteEvaluacion(${ev.id})">Eliminar</button>
                    </div>
                </div>
            </div>`).join('');
        } catch (e) { listEl.innerHTML = '<p style="color:var(--danger);">Error al cargar evaluaciones</p>'; }
    },

    async showEvaluacionModal(id = null) {
        let evaluacion = null;
        if (id) {
            try {
                const evalRes = await apiCall('GET', `/profesor/notas?action=evaluaciones&evaluacion_id=${id}`);
                evaluacion = evalRes.evaluaciones?.[0] || null;
                if (!evaluacion) {
                    const allData = await apiCall('GET', '/profesor/notas');
                    evaluacion = (allData.evaluaciones || []).find(e => e.id == id) || null;
                }
            } catch(e) {
                try {
                    const allData = await apiCall('GET', '/profesor/notas');
                    evaluacion = (allData.evaluaciones || []).find(e => e.id == id) || null;
                } catch(e2) {}
            }
        }

        // Load materias and lapsos for dropdowns
        let materias = [];
        let lapsos = [];
        try {
            const clasesData = await apiCall('GET', '/profesor/clases?action=todos');
            (clasesData.clases || []).forEach(c => {
                if (!materias.find(m => m.id === c.materia_id)) {
                    materias.push({ id: c.materia_id, nombre: c.materia_nombre });
                }
            });
        } catch(e) {}

        try {
            const lapsosData = await apiCall('GET', '/admin/lapsos');
            lapsos = lapsosData.lapsos || [];
        } catch(e) {
            try {
                const lapsosData = await apiCall('GET', '/profesor/notas?action=lapsos');
                lapsos = lapsosData.lapsos || [];
            } catch(e2) {}
        }

        const content = `
            <form id="evalForm">
                <input type="hidden" id="evalId" value="${id || ''}">
                <div class="form-group"><label>Título *</label><input class="form-control" id="evalTitulo" required value="${evaluacion?.titulo || ''}"></div>
                <div class="form-group"><label>Descripción</label><textarea class="form-control" id="evalDescripcion">${evaluacion?.descripcion || ''}</textarea></div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Materia *</label>
                        <select class="form-control" id="evalMateriaId" required>
                            <option value="">Seleccione</option>
                            ${materias.map(m => `<option value="${m.id}" ${evaluacion?.materia_id == m.id ? 'selected' : ''}>${escapeHtml(m.nombre)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Lapso *</label>
                        <select class="form-control" id="evalLapsoId" required>
                            <option value="">Seleccione</option>
                            ${lapsos.map(l => `<option value="${l.id}" ${evaluacion?.lapso_id == l.id ? 'selected' : ''}>${escapeHtml(l.nombre)} (${l.periodo_escolar || ''})</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Tipo</label>
                        <select class="form-control" id="evalTipo">
                            <option value="examen" ${evaluacion?.tipo === 'examen' ? 'selected' : ''}>Examen</option>
                            <option value="trabajo" ${evaluacion?.tipo === 'trabajo' ? 'selected' : ''}>Trabajo</option>
                            <option value="proyecto" ${evaluacion?.tipo === 'proyecto' ? 'selected' : ''}>Proyecto</option>
                            <option value="participacion" ${evaluacion?.tipo === 'participacion' ? 'selected' : ''}>Participación</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Ponderación (%)</label>
                        <input class="form-control" id="evalPonderacion" type="number" min="0" max="100" value="${evaluacion?.ponderacion || 0}">
                    </div>
                </div>
                <div class="form-group"><label>Fecha Aplicación</label><input class="form-control" id="evalFecha" type="date" value="${evaluacion?.fecha_aplicacion || ''}"></div>
            </form>
        `;

        showModal(id ? 'Editar Evaluación' : 'Nueva Evaluación', content, `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="profesorApp.saveEvaluacion()">Guardar</button>
        `);
    },

    async saveEvaluacion() {
        const id = document.getElementById('evalId')?.value;
        const body = {
            titulo: document.getElementById('evalTitulo')?.value,
            descripcion: document.getElementById('evalDescripcion')?.value,
            materia_id: parseInt(document.getElementById('evalMateriaId')?.value),
            lapso_id: parseInt(document.getElementById('evalLapsoId')?.value),
            tipo: document.getElementById('evalTipo')?.value,
            ponderacion: parseFloat(document.getElementById('evalPonderacion')?.value),
            fecha_aplicacion: document.getElementById('evalFecha')?.value,
        };
        if (id) body.id = parseInt(id);
        try {
            if (id) await apiCall('PUT', '/profesor/notas', body);
            else await apiCall('POST', '/profesor/notas', body);
            showToast('Evaluación guardada', 'success');
            closeModal();
            this.loadEvaluaciones();
        } catch (e) { showToast(e.message || 'Error al guardar', 'error'); }
    },

    async deleteEvaluacion(id) {
        showConfirm('¿Eliminar esta evaluación y todas sus notas?', async () => {
            try {
                await apiCall('DELETE', `/profesor/notas?id=${id}`);
                showToast('Evaluación eliminada', 'success');
                this.loadEvaluaciones();
            } catch (e) { showToast(e.message || 'Error al eliminar', 'error'); }
        });
    },

    async enviarCalificaciones(evaluacionId) {
        showConfirm('¿Desea enviar estas calificaciones a los estudiantes y sus representantes?', async () => {
            try {
                showLoading();
                await apiCall('POST', '/profesor/notas', {
                    action: 'enviar_calificaciones',
                    evaluacion_id: evaluacionId
                });
                showToast('Calificaciones enviadas exitosamente', 'success');
            } catch (e) {
                showToast(e.message || 'Error al enviar calificaciones', 'error');
            } finally {
                hideLoading();
            }
        });
    },

    async showCalificarModal(evaluacionId) {
        try {
            showLoading();
            const data = await apiCall('GET', `/profesor/notas?action=estudiantes_nota&evaluacion_id=${evaluacionId}`);
            const estudiantes = data.estudiantes || [];
            const evaluacion = data.evaluacion || {};
            let html = `<h4 style="margin-bottom:0.5rem;">${escapeHtml(evaluacion.titulo||'')}</h4>
                <p style="font-size:0.8125rem;color:var(--gray-500);margin-bottom:1rem;">Ingrese la nota para cada estudiante</p>
                <div style="max-height:400px;overflow-y:auto;">`;
            estudiantes.forEach(e => {
                html += `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--gray-100);">
                    <span style="flex:1;font-size:0.875rem;">${escapeHtml(e.nombre||'')} ${escapeHtml(e.apellido||'')}</span>
                    <input type="number" class="form-control" style="width:80px;" id="nota-${e.id}" min="0" max="20" step="0.01" value="${e.nota !== null && e.nota !== undefined ? e.nota : ''}">
                    <input type="text" class="form-control" style="width:120px;" id="obs-${e.id}" placeholder="Observación" value="${escapeHtml(e.observaciones||'')}">
                </div>`;
            });
            html += '</div>';
            showModal('Calificar Estudiantes', html,
                `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
                 <button class="btn btn-success" onclick="profesorApp.saveCalificaciones(${evaluacionId})">Guardar Notas</button>`);
        } catch (e) { showToast(e.message || 'Error al cargar estudiantes', 'error'); }
        finally { hideLoading(); }
    },

    async saveCalificaciones(evaluacionId) {
        const inputs = document.querySelectorAll('[id^="nota-"]');
        const notas = [];
        inputs.forEach(input => {
            const id = input.id.replace('nota-', '');
            const notaVal = input.value;
            if (notaVal !== '') {
                notas.push({
                    estudiante_id: parseInt(id),
                    nota: parseFloat(notaVal),
                    observaciones: document.getElementById(`obs-${id}`)?.value || ''
                });
            }
        });
        if (notas.length === 0) { showToast('No hay notas para guardar', 'warning'); return; }
        try {
            await apiCall('POST', '/profesor/notas?action=calificar', { evaluacion_id: evaluacionId, notas });
            showToast('Notas guardadas exitosamente', 'success');
            closeModal();
        } catch (e) { showToast(e.message || 'Error al guardar notas', 'error'); }
    },

    // ============================================
    // LAPSOS
    // ============================================
    async loadLapsos() {
        const container = document.getElementById('lapsosContainer');
        if (!container) return;
        try {
            const data = await apiCall('GET', '/admin/lapsos');
            const lapsos = data.lapsos || [];
            container.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3>Lapsos Académicos</h3>
            </div>` + (lapsos.length === 0 ? '<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">Sin lapsos</div></div>' :
            lapsos.map(l => `<div class="card" style="margin-bottom:0.5rem;"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;">
                <div><strong>${escapeHtml(l.nombre)}</strong> <span style="color:var(--gray-500);font-size:0.8125rem;">| ${l.fecha_inicio} al ${l.fecha_fin} | ${escapeHtml(l.periodo_escolar)}</span></div>
                <span class="badge ${l.activo ? 'badge-success' : 'badge-secondary'}">${l.activo ? 'Activo' : 'Inactivo'}</span>
            </div></div>`).join(''));
        } catch (e) { container.innerHTML = '<p style="color:var(--danger);">Error al cargar lapsos</p>'; }
    },

    // ============================================
    // HORARIO SEMANAL
    // ============================================
    async loadHorarioSemanal() {
        const container = document.getElementById('horarioSemanalContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
        try {
            const data = await apiCall('GET', '/profesor/clases?action=semana');
            const clases = data.clases || [];
            const horarioPorDia = data.horarioPorDia || {};
            const dias = data.dias || {1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes',6:'Sábado',7:'Domingo'};

            if (clases.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">Sin horario asignado</div><div class="empty-state-text">Contacte al administrador para que le asigne materias y horarios</div></div>`;
                return;
            }

            const TIME_SLOTS = [
                {inicio:'07:00', fin:'07:40', label:'1ra'},
                {inicio:'07:40', fin:'08:20', label:'2da'},
                {inicio:'08:20', fin:'09:10', label:'3ra'},
                {inicio:'09:10', fin:'09:50', label:'4ta'},
                {inicio:'09:50', fin:'10:30', label:'5ta'},
                {inicio:'10:30', fin:'11:10', label:'6ta'},
                {inicio:'11:10', fin:'11:50', label:'7ma'},
                {inicio:'11:50', fin:'12:30', label:'8va'},
                {inicio:'12:30', fin:'12:45', label:'9na'}
            ];
            const diaSemana = [1,2,3,4,5]; // Mon-Fri

            // Build schedule map
            const schedMap = {};
            clases.forEach(c => {
                const key = `${c.dia_semana}-${c.hora_inicio}`;
                schedMap[key] = c;
            });

            let html = `<h3 style="margin-bottom:1rem;">Mi Horario Semanal</h3>`;
            html += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:700px;">`;
            html += `<thead><tr><th style="padding:0.75rem;border:1px solid var(--gray-200);background:var(--gray-50);width:90px;">Hora</th>`;
            diaSemana.forEach(d => {
                html += `<th style="padding:0.75rem;border:1px solid var(--gray-200);background:var(--gray-50);text-align:center;">${dias[d]||''}</th>`;
            });
            html += `</tr></thead><tbody>`;

            const colors = ['#e8f0fe','#e6f4ea','#fef7e0','#fce8e6','#e8eaed','#f3e8fd','#e0f7fa','#fff3e0','#f1f8e9'];

            TIME_SLOTS.forEach((slot, idx) => {
                html += `<tr><td style="padding:0.5rem;border:1px solid var(--gray-200);font-size:0.75rem;font-weight:600;text-align:center;vertical-align:middle;white-space:nowrap;background:var(--gray-50);">
                    <div>${slot.inicio}</div><div style="color:var(--gray-400);font-weight:400;">${slot.fin}</div>
                    <div style="font-size:0.625rem;color:var(--gray-400);">${slot.label}</div>
                </td>`;
                diaSemana.forEach(dia => {
                    const key = `${dia}-${slot.inicio}`;
                    const c = schedMap[key];
                    if (c) {
                        const bg = colors[(c.materia_id || 0) % colors.length];
                        html += `<td style="padding:0.5rem;border:1px solid var(--gray-200);background:${bg};vertical-align:top;">
                            <div style="font-weight:600;font-size:0.8125rem;">${escapeHtml(c.materia_nombre||'')}</div>
                            <div style="font-size:0.75rem;color:var(--gray-600);">${formatTimeString(c.hora_inicio)} - ${formatTimeString(c.hora_fin)}</div>
                            <div style="font-size:0.75rem;color:var(--gray-500);">Sec: ${escapeHtml(c.seccion||'-')} | Aula: ${escapeHtml(c.aula||'-')}</div>
                            <div style="font-size:0.6875rem;color:var(--gray-400);">${c.total_estudiantes||0} alumnos</div>
                        </td>`;
                    } else {
                        html += `<td style="padding:0.5rem;border:1px solid var(--gray-200);"></td>`;
                    }
                });
                html += `</tr>`;
            });

            html += `</tbody></table></div>`;

            // Also show list view below
            html += `<div class="card" style="margin-top:1rem;"><div class="card-header"><h3>Lista de Clases</h3></div><div class="table-container"><table><thead><tr><th>Día</th><th>Materia</th><th>Sección</th><th>Hora</th><th>Aula</th><th>Estudiantes</th></tr></thead><tbody>`;
            const diasOrd = [1,2,3,4,5];
            diasOrd.forEach(dia => {
                const clasesDia = horarioPorDia[dia] || [];
                clasesDia.forEach(c => {
                    html += `<tr><td>${dias[dia]||''}</td><td>${escapeHtml(c.materia_nombre||'-')}</td><td>${escapeHtml(c.seccion||'-')}</td><td>${formatTimeString(c.hora_inicio)} - ${formatTimeString(c.hora_fin)}</td><td>${escapeHtml(c.aula||'-')}</td><td>${c.total_estudiantes||0}</td></tr>`;
                });
            });
            html += '</tbody></table></div></div>';

            container.innerHTML = html;
        } catch (e) {
            console.error('Error al cargar horario semanal:', e);
            container.innerHTML = `<p style="color:var(--danger);text-align:center;">Error al cargar horario semanal</p>`;
            showToast('Error al cargar horario semanal', 'error');
        }
    }
};

// Navegación
const _origNavProf = navigateTo;
window.navigateTo = function(view) {
    _origNavProf(view);
    switch(view) {
        case 'miclase': profesorApp.loadTodaySchedules(); break;
        case 'miHorario': profesorApp.loadHorarioSemanal(); break;
        case 'historial': profesorApp.loadHistorial(); break;
        case 'diario': break;
        case 'notas': profesorApp.loadNotas(); break;
        case 'lapsos': profesorApp.loadLapsos(); break;
    }
};
