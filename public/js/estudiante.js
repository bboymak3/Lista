/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Panel de Estudiante - JavaScript v2
   - Carnet con QR
   - Escanear QR del profesor para marcar asistencia
   - Constancias de estudio
   - Notas por lapsos
   ============================================ */

const estudianteApp = {
    carnetData: null,
    historialData: [],
    asistenciaPage: 1,
    asistenciaLimit: 20,
    qrScanner: null,

    async init() {
        try {
            await this.loadCarnet();
        } catch (error) {
            console.error('Error al inicializar panel de estudiante:', error);
            showToast('Error al cargar el panel del estudiante', 'error');
        }
    },

    // ============================================
    // CARNET
    // ============================================
    async loadCarnet() {
        try {
            const data = await apiCall('GET', '/estudiante/carnet?action=carnet');
            const carnet = data.carnet;
            if (!carnet) { showToast('No se pudo obtener la información del carnet', 'error'); return; }
            this.carnetData = carnet;
            this.renderCarnet(carnet);
        } catch (error) {
            showToast('Error al cargar la información del carnet', 'error');
        }
    },

    renderCarnet(carnet) {
        const photoEl = document.getElementById('carnetPhoto');
        if (photoEl) {
            if (carnet.foto) {
                photoEl.innerHTML = `<img src="/api/upload?key=${encodeURIComponent(carnet.foto)}" alt="Foto" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                const initials = ((carnet.nombre?.[0]||'')+(carnet.apellido?.[0]||'')).toUpperCase()||'?';
                photoEl.innerHTML = `<span style="font-size:1.5rem;color:var(--gray-400);">${initials}</span>`;
            }
        }
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '-'; };
        set('carnetNombre', carnet.nombre);
        set('carnetApellido', carnet.apellido);
        set('carnetCedula', carnet.cedula_escolar);
        set('carnetGrado', `${carnet.grado||'-'}° / ${carnet.seccion||'-'}`);
        set('carnetCodigo', carnet.codigo_unico);
        const qrEl = document.getElementById('carnetQR');
        if (qrEl) {
            const qrData = JSON.stringify({ tipo: 'estudiante', id: carnet.id, codigo_unico: carnet.codigo_unico, qr_code: carnet.qr_code, nombre: carnet.nombre, apellido: carnet.apellido });
            qrEl.src = getQRUrl(qrData, 150);
            qrEl.alt = `Código QR: ${carnet.codigo_unico}`;
            qrEl.style.display = 'block';
        }
    },

    printCarnet() { printElement('carnetCard'); },

    // ============================================
    // ESCANEAR QR DEL PROFESOR
    // ============================================
    showEscanearAsistencia() {
        showModal('Escanear Asistencia', `
            <div style="text-align:center;">
                <p style="margin-bottom:1rem;color:var(--gray-500);">Escanea el código QR que el profesor ha habilitado para esta clase</p>
                <div id="studentQrReader" style="width:100%;max-width:400px;margin:0 auto;"></div>
                <button class="btn btn-danger btn-sm" onclick="estudianteApp.stopScanner()" style="margin-top:0.5rem;">Cancelar</button>
            </div>
        `);
        this.startScanner();
    },

    startScanner() {
        if (!window.Html5Qrcode) {
            showToast('Librería de escáner QR no cargada', 'error');
            return;
        }
        try {
            this.qrScanner = new Html5Qrcode('studentQrReader');
            this.qrScanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => { this.onProfessorQRScanned(decodedText); },
                () => {}
            ).catch(e => showToast('No se pudo acceder a la cámara: ' + e.message, 'error'));
        } catch (e) {
            showToast('Error al iniciar escáner: ' + e.message, 'error');
        }
    },

    stopScanner() {
        if (this.qrScanner) {
            this.qrScanner.stop().then(() => { this.qrScanner.clear(); this.qrScanner = null; }).catch(() => {});
        }
        closeModal();
    },

    async onProfessorQRScanned(qrData) {
        try {
            this.stopScanner();
            showToast('Procesando asistencia...', 'info');
            // Enviar datos del QR del profesor para marcar asistencia
            const data = await apiCall('POST', '/estudiante/carnet', { action: 'escanear_asistencia', qr_data: qrData });
            showToast('Asistencia registrada exitosamente', 'success');
        } catch (e) {
            showToast(e.message || 'Error al registrar asistencia por QR', 'error');
        }
    },

    // ============================================
    // ASISTENCIA
    // ============================================
    async loadAsistencia(page = 1) {
        this.asistenciaPage = page;
        const tbody = document.getElementById('asistenciaTableBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" class="table-empty"><div class="spinner"></div> Cargando...</td></tr>';
        try {
            const perfilData = await apiCall('GET', '/estudiante/perfil');
            const resumen = perfilData.resumen_asistencia || {};
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || 0; };
            set('statPresente', resumen.total_presente);
            set('statAusente', resumen.total_ausente);
            set('statTardanza', resumen.total_tardanza);
            set('statJustificado', resumen.total_justificado);

            const data = await apiCall('GET', `/estudiante/carnet?action=historial&page=${page}&limit=${this.asistenciaLimit}`);
            this.historialData = data.historial || [];
            if (this.historialData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No hay registros de asistencia</td></tr>';
                document.getElementById('asistenciaPagination').innerHTML = '';
                return;
            }
            const estadoLabels = {
                presente: { texto:'Presente', clase:'badge-success' },
                ausente: { texto:'Ausente', clase:'badge-danger' },
                tardanza: { texto:'Tardanza', clase:'badge-warning' },
                justificado: { texto:'Justificado', clase:'badge-info' }
            };
            tbody.innerHTML = this.historialData.map(r => {
                const estado = estadoLabels[r.estado] || { texto: r.estado, clase: 'badge-secondary' };
                return `<tr><td>${formatDateString(r.fecha_registro||r.fecha)}</td><td>${escapeHtml(r.materia_nombre||'-')}</td>
                    <td><span class="badge ${estado.clase}">${estado.texto}</span></td><td>${formatTimeString(r.hora_registro||'')}</td></tr>`;
            }).join('');
            document.getElementById('asistenciaPagination').innerHTML = renderPagination(data.pagination?.total||0, data.pagination?.page||1, this.asistenciaLimit, 'estudianteApp.loadAsistencia');
            this.renderCalendar(this.historialData);
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Error al cargar</td></tr>';
        }
    },

    renderCalendar(records) {
        const container = document.getElementById('attendanceCalendar');
        if (!container) return;
        if (!records || records.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:1rem;">Sin datos</p>';
            return;
        }
        const regPorFecha = {};
        records.forEach(r => {
            const fecha = (r.fecha_registro||r.fecha||'').split('T')[0];
            if (fecha) { if (!regPorFecha[fecha]) regPorFecha[fecha] = []; regPorFecha[fecha].push(r); }
        });
        const now = new Date(), year = now.getFullYear(), month = now.getMonth();
        const primer = new Date(year,month,1), ultimo = new Date(year,month+1,0);
        const diasSemana = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
        let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <h4 style="margin:0;">${getMonthName(month)} ${year}</h4>
            <div style="display:flex;gap:0.75rem;font-size:0.75rem;">
                <span><span style="width:10px;height:10px;border-radius:50%;background:var(--secondary);display:inline-block;"></span> Presente</span>
                <span><span style="width:10px;height:10px;border-radius:50%;background:var(--danger);display:inline-block;"></span> Ausente</span>
                <span><span style="width:10px;height:10px;border-radius:50%;background:var(--warning);display:inline-block;"></span> Tardanza</span>
            </div></div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">`;
        diasSemana.forEach(d => { html += `<div style="text-align:center;font-size:0.75rem;font-weight:600;color:var(--gray-500);padding:0.5rem 0;">${d}</div>`; });
        let diaInicio = primer.getDay(); diaInicio = diaInicio===0?6:diaInicio-1;
        for (let i=0;i<diaInicio;i++) html += '<div style="padding:0.375rem;min-height:40px;"></div>';
        for (let dia=1;dia<=ultimo.getDate();dia++) {
            const fechaStr = `${year}-${String(month+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
            const regs = regPorFecha[fechaStr]||[];
            let estadoDia = null;
            if (regs.length > 0) {
                const estados = regs.map(r=>r.estado);
                if (estados.includes('ausente')) estadoDia='ausente';
                else if (estados.includes('tardanza')) estadoDia='tardanza';
                else if (estados.includes('presente')) estadoDia='presente';
            }
            const bg = { presente:'var(--secondary-light)', ausente:'var(--danger-light)', tardanza:'var(--warning-light)' };
            const esHoy = dia===now.getDate()&&month===now.getMonth();
            html += `<div style="padding:0.375rem;min-height:40px;border-radius:0.25rem;text-align:center;${estadoDia?`background:${bg[estadoDia]};`:''}${esHoy?'border:2px solid var(--primary);font-weight:700;':''}">
                <div style="font-size:0.8125rem;">${dia}</div></div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    },

    // ============================================
    // HORARIO SEMANAL
    // ============================================
    async loadHorario() {
        const container = document.getElementById('horarioSemanalContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
        try {
            const data = await apiCall('GET', '/estudiante/horario');
            const horarios = data.horarios || [];
            const horarioPorDia = data.horarioPorDia || {};
            const dias = data.dias || {1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes',6:'Sábado',7:'Domingo'};
            const estudiante = data.estudiante || {};

            if (horarios.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">Sin horario asignado</div><div class="empty-state-text">Aún no tienes materias asignadas en tu horario. Contacta al administrador.</div></div>`;
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
            const diaSemana = [1,2,3,4,5];

            // Build schedule map
            const schedMap = {};
            horarios.forEach(c => {
                const key = `${c.dia_semana}-${c.hora_inicio}`;
                schedMap[key] = c;
            });

            let html = `<h3 style="margin-bottom:0.5rem;">Mi Horario Semanal</h3>
                <p style="font-size:0.875rem;color:var(--gray-500);margin-bottom:1rem;">${escapeHtml(estudiante.grado||'')}° "${escapeHtml(estudiante.seccion||'')}" - ${estudiante.turno === 'manana' ? 'Mañana' : estudiante.turno === 'tarde' ? 'Tarde' : escapeHtml(estudiante.turno||'')}</p>`;

            // Calendar grid view with fixed time slots
            const colors = ['#e8f0fe','#e6f4ea','#fef7e0','#fce8e6','#e8eaed','#f3e8fd','#e0f7fa','#fff3e0','#f1f8e9'];
            html += `<div class="card"><div class="card-header"><h3>Vista Calendario</h3></div><div class="card-body" style="padding:0;"><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:600px;">`;
            html += `<thead><tr><th style="padding:0.625rem;border:1px solid var(--gray-200);background:var(--gray-50);width:90px;text-align:center;font-size:0.8125rem;">Hora</th>`;
            diaSemana.forEach(d => {
                html += `<th style="padding:0.625rem;border:1px solid var(--gray-200);background:var(--gray-50);text-align:center;">${dias[d]||''}</th>`;
            });
            html += `</tr></thead><tbody>`;

            TIME_SLOTS.forEach(slot => {
                html += `<tr><td style="padding:0.5rem;border:1px solid var(--gray-200);font-size:0.75rem;font-weight:600;text-align:center;vertical-align:middle;white-space:nowrap;background:var(--gray-50);">
                    <div>${slot.inicio}</div><div style="color:var(--gray-400);font-weight:400;">${slot.fin}</div>
                    <div style="font-size:0.625rem;color:var(--gray-400);">${slot.label}</div>
                </td>`;
                diaSemana.forEach(dia => {
                    const key = `${dia}-${slot.inicio}`;
                    const c = schedMap[key];
                    if (c) {
                        const bg = colors[(c.materia_id || 0) % colors.length];
                        html += `<td style="padding:0.5rem;border:1px solid var(--gray-200);background:${bg};font-size:0.75rem;vertical-align:top;">
                            <div style="font-weight:600;">${escapeHtml(c.materia_nombre||'')}</div>
                            <div style="color:var(--gray-500);">${escapeHtml(c.profesor_nombre||'')} ${escapeHtml(c.profesor_apellido||'')}</div>
                            <div style="color:var(--gray-400);font-size:0.6875rem;">${escapeHtml(c.aula||'')}</div>
                        </td>`;
                    } else {
                        html += `<td style="padding:0.5rem;border:1px solid var(--gray-200);"></td>`;
                    }
                });
                html += `</tr>`;
            });
            html += `</tbody></table></div></div></div>`;

            // Table list view
            html += `<div class="card" style="margin-top:1rem;"><div class="card-header"><h3>Detalle de Clases</h3></div><div class="table-container"><table><thead><tr><th>Día</th><th>Materia</th><th>Profesor</th><th>Hora</th><th>Aula</th></tr></thead><tbody>`;
            let hasAny = false;
            diaSemana.forEach(dia => {
                const clasesDia = horarioPorDia[dia] || [];
                clasesDia.forEach(c => {
                    hasAny = true;
                    html += `<tr>
                        <td>${dias[dia]||''}</td>
                        <td><strong>${escapeHtml(c.materia_nombre||'-')}</strong></td>
                        <td>${escapeHtml(c.profesor_nombre||'')} ${escapeHtml(c.profesor_apellido||'')}</td>
                        <td>${formatTimeString(c.hora_inicio)} - ${formatTimeString(c.hora_fin)}</td>
                        <td>${escapeHtml(c.aula||'-')}</td>
                    </tr>`;
                });
            });
            if (!hasAny) html += '<tr><td colspan="5" class="table-empty">No hay clases de lunes a viernes</td></tr>';
            html += '</tbody></table></div></div>';

            container.innerHTML = html;
        } catch (e) {
            console.error('Error al cargar horario:', e);
            container.innerHTML = `<p style="color:var(--danger);text-align:center;">Error al cargar horario</p>`;
            showToast('Error al cargar horario semanal', 'error');
        }
    },

    // ============================================
    // CONSTANCIAS
    // ============================================
    async loadConstancias() {
        const container = document.getElementById('constanciasContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
        try {
            const data = await apiCall('GET', '/estudiante/constancias');
            const constancias = data.constancias || [];
            let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3>Constancias y Certificados</h3>
                <button class="btn btn-primary btn-sm" onclick="estudianteApp.solicitarConstancia()">Solicitar Constancia</button>
            </div>`;
            if (constancias.length === 0) {
                html += '<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-title">Sin constancias</div><div class="empty-state-text">Solicite una constancia de estudios aquí</div></div>';
            } else {
                html += '<div class="card"><div class="table-container"><table><thead><tr><th>Tipo</th><th>Estado</th><th>Fecha Solicitud</th><th>Acciones</th></tr></thead><tbody>';
                const tipoLabels = { estudio:'Constancia de Estudio', trabajo:'Constancia de Trabajo', buena_conducta:'Buena Conducta', retiro:'Retiro' };
                const estadoLabels = { pendiente:'badge-warning', aprobada:'badge-success', rechazada:'badge-danger' };
                constancias.forEach(c => {
                    html += `<tr><td>${tipoLabels[c.tipo]||c.tipo}</td>
                        <td><span class="badge ${estadoLabels[c.estado]||'badge-secondary'}">${c.estado}</span></td>
                        <td>${formatDateString(c.fecha_solicitud)}</td>
                        <td>${c.pdf_key ? `<a href="/api/upload?key=${encodeURIComponent(c.pdf_key)}" class="btn btn-outline btn-sm" target="_blank">Descargar PDF</a>` : '-'}</td></tr>`;
                });
                html += '</tbody></table></div></div>';
            }
            container.innerHTML = html;
        } catch (e) { container.innerHTML = '<p style="color:var(--danger);">Error al cargar constancias</p>'; }
    },

    solicitarConstancia() {
        showModal('Solicitar Constancia', `
            <div class="form-group"><label>Tipo de Constancia</label>
                <select class="form-control" id="constTipo">
                    <option value="estudio">Constancia de Estudio</option>
                    <option value="trabajo">Constancia de Trabajo</option>
                    <option value="buena_conducta">Buena Conducta</option>
                    <option value="retiro">Retiro</option>
                </select></div>
            <div class="form-group"><label>Observaciones</label>
                <textarea class="form-control" id="constObs" placeholder="Motivo o detalle adicional"></textarea></div>
        `, `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="estudianteApp.enviarConstancia()">Enviar Solicitud</button>`);
    },

    async enviarConstancia() {
        const tipo = document.getElementById('constTipo')?.value;
        const obs = document.getElementById('constObs')?.value;
        try {
            await apiCall('POST', '/estudiante/constancias', { tipo, observaciones: obs });
            showToast('Constancia solicitada exitosamente', 'success');
            closeModal();
            this.loadConstancias();
        } catch (e) { showToast(e.message || 'Error al solicitar constancia', 'error'); }
    },

    // ============================================
    // NOTAS
    // ============================================
    async loadNotas() {
        const container = document.getElementById('notasContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
        try {
            const data = await apiCall('GET', '/estudiante/notas');
            const lapsos = data.lapsos || [];
            let html = '<h3 style="margin-bottom:1rem;">Mis Notas</h3>';
            if (lapsos.length === 0) {
                html += '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-title">Sin notas registradas</div></div>';
            } else {
                lapsos.forEach(lapso => {
                    html += `<div class="card" style="margin-bottom:1rem;">
                        <div class="card-header"><h3>${escapeHtml(lapso.lapso_nombre||'Lapso')}</h3></div>
                        <div class="card-body">`;
                    const materias = lapso.materias || [];
                    if (materias.length === 0) {
                        html += '<p style="color:var(--gray-400);text-align:center;">Sin notas en este lapso</p>';
                    } else {
                        html += '<table><thead><tr><th>Materia</th><th>Evaluación</th><th>Tipo</th><th>Nota</th><th>Observación</th></tr></thead><tbody>';
                        materias.forEach(mat => {
                            (mat.evaluaciones||[]).forEach(ev => {
                                html += `<tr><td>${escapeHtml(mat.materia_nombre||'')}</td>
                                    <td>${escapeHtml(ev.titulo||'')}</td>
                                    <td>${escapeHtml(ev.tipo||'')}</td>
                                    <td style="font-weight:700;color:var(--primary);">${ev.nota!==null&&ev.nota!==undefined?ev.nota:'-'}</td>
                                    <td>${escapeHtml(ev.observaciones||'')}</td></tr>`;
                            });
                        });
                        html += '</tbody></table>';
                    }
                    html += '</div></div>';
                });
            }
            container.innerHTML = html;
        } catch (e) { container.innerHTML = '<p style="color:var(--danger);">Error al cargar notas</p>'; }
    }
};

// Navegación
const _origNavEst = navigateTo;
window.navigateTo = function(view) {
    _origNavEst(view);
    switch(view) {
        case 'micarnet': estudianteApp.loadCarnet(); break;
        case 'miasistencia': estudianteApp.loadAsistencia(); break;
        case 'mihorario': estudianteApp.loadHorario(); break;
        case 'constancias': estudianteApp.loadConstancias(); break;
        case 'misnotas': estudianteApp.loadNotas(); break;
    }
};
