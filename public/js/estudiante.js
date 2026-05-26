/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Panel de Estudiante - JavaScript
   ============================================ */

const estudianteApp = {
    // --- Datos del estudiante ---
    carnetData: null,
    historialData: [],

    // --- Paginación ---
    asistenciaPage: 1,
    asistenciaLimit: 20,

    // ============================================
    // INICIALIZACIÓN
    // ============================================
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

            if (!carnet) {
                showToast('No se pudo obtener la información del carnet', 'error');
                return;
            }

            this.carnetData = carnet;
            this.renderCarnet(carnet);
        } catch (error) {
            console.error('Error al cargar carnet:', error);
            showToast('Error al cargar la información del carnet', 'error');
        }
    },

    renderCarnet(carnet) {
        // Actualizar foto
        const photoEl = document.getElementById('carnetPhoto');
        if (photoEl) {
            if (carnet.foto) {
                const fotoUrl = `/api/upload?key=${encodeURIComponent(carnet.foto)}`;
                photoEl.innerHTML = `<img src="${fotoUrl}" alt="Foto" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                const initials = ((carnet.nombre?.[0] || '') + (carnet.apellido?.[0] || '')).toUpperCase() || '?';
                photoEl.innerHTML = `<span style="font-size:1.5rem;color:var(--gray-400);">${initials}</span>`;
            }
        }

        // Actualizar información
        const nombreEl = document.getElementById('carnetNombre');
        const apellidoEl = document.getElementById('carnetApellido');
        const cedulaEl = document.getElementById('carnetCedula');
        const gradoEl = document.getElementById('carnetGrado');
        const codigoEl = document.getElementById('carnetCodigo');
        const qrEl = document.getElementById('carnetQR');

        if (nombreEl) nombreEl.textContent = carnet.nombre || '-';
        if (apellidoEl) apellidoEl.textContent = carnet.apellido || '-';
        if (cedulaEl) cedulaEl.textContent = carnet.cedula_escolar || '-';
        if (gradoEl) gradoEl.textContent = `${carnet.grado || '-'}° / ${carnet.seccion || '-'}`;
        if (codigoEl) codigoEl.textContent = carnet.codigo_unico || '-';

        // Actualizar código QR
        if (qrEl) {
            const qrData = carnet.qr_code || carnet.codigo_unico || `EST-${carnet.id}`;
            qrEl.src = getQRUrl(qrData, 150);
            qrEl.alt = `Código QR: ${qrData}`;
            qrEl.style.display = 'block';
        }
    },

    printCarnet() {
        printElement('carnetCard');
    },

    // ============================================
    // ASISTENCIA
    // ============================================
    async loadAsistencia(page = 1) {
        this.asistenciaPage = page;
        const tbody = document.getElementById('asistenciaTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" class="table-empty"><div class="spinner"></div> Cargando historial...</td></tr>';

        try {
            // Cargar datos del perfil para las estadísticas
            const perfilData = await apiCall('GET', '/estudiante/perfil');
            const resumen = perfilData.resumen_asistencia || {};

            // Actualizar estadísticas
            const statPresente = document.getElementById('statPresente');
            const statAusente = document.getElementById('statAusente');
            const statTardanza = document.getElementById('statTardanza');
            const statJustificado = document.getElementById('statJustificado');

            if (statPresente) statPresente.textContent = resumen.total_presente || 0;
            if (statAusente) statAusente.textContent = resumen.total_ausente || 0;
            if (statTardanza) statTardanza.textContent = resumen.total_tardanza || 0;
            if (statJustificado) statJustificado.textContent = resumen.total_justificado || 0;

            // Cargar historial de asistencia
            const data = await apiCall('GET', `/estudiante/carnet?action=historial&page=${page}&limit=${this.asistenciaLimit}`);
            this.historialData = data.historial || [];

            if (this.historialData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No hay registros de asistencia</td></tr>';
                document.getElementById('asistenciaPagination').innerHTML = '';
                document.getElementById('attendanceCalendar').innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:1rem;">Sin datos para mostrar en el calendario</p>';
                return;
            }

            // Renderizar tabla
            const estadoLabels = {
                presente: { texto: 'Presente', clase: 'badge-success' },
                ausente: { texto: 'Ausente', clase: 'badge-danger' },
                tardanza: { texto: 'Tardanza', clase: 'badge-warning' },
                justificado: { texto: 'Justificado', clase: 'badge-info' }
            };

            tbody.innerHTML = this.historialData.map(r => {
                const estado = estadoLabels[r.estado] || { texto: r.estado, clase: 'badge-secondary' };
                const fecha = r.fecha_registro || r.fecha_inicio;
                const hora = r.fecha_registro ? formatTimeString(r.fecha_registro.split(' ')[1] || r.fecha_registro.split('T')[1]) : '-';

                return `
                    <tr>
                        <td>${formatDateString(fecha)}</td>
                        <td>${escapeHtml(r.materia_nombre || '-')}</td>
                        <td><span class="badge ${estado.clase}">${estado.texto}</span></td>
                        <td>${hora}</td>
                    </tr>
                `;
            }).join('');

            // Paginación
            const paginationHtml = renderPagination(
                data.pagination.total,
                data.pagination.page,
                this.asistenciaLimit,
                'estudianteApp.loadAsistencia'
            );
            document.getElementById('asistenciaPagination').innerHTML = paginationHtml;

            // Renderizar calendario
            this.renderCalendar(this.historialData);

        } catch (error) {
            console.error('Error al cargar asistencia:', error);
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Error al cargar el historial de asistencia</td></tr>';
            showToast('Error al cargar el historial de asistencia', 'error');
        }
    },

    // ============================================
    // CALENDARIO DE ASISTENCIA
    // ============================================
    renderCalendar(records) {
        const container = document.getElementById('attendanceCalendar');
        if (!container) return;

        if (!records || records.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:1rem;">Sin datos para mostrar en el calendario</p>';
            return;
        }

        // Organizar registros por fecha
        const registrosPorFecha = {};
        records.forEach(r => {
            const fecha = r.fecha_registro ? r.fecha_registro.split('T')[0] : (r.fecha_inicio ? r.fecha_inicio.split('T')[0] : null);
            if (fecha) {
                if (!registrosPorFecha[fecha]) {
                    registrosPorFecha[fecha] = [];
                }
                registrosPorFecha[fecha].push(r);
            }
        });

        // Obtener mes actual
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        // Calcular primer y último día del mes
        const primerDia = new Date(year, month, 1);
        const ultimoDia = new Date(year, month + 1, 0);

        const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const nombreMes = getMonthName(month);

        let html = `
            <div class="calendar-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                <h4 style="margin:0;font-size:1rem;color:var(--gray-700);">${nombreMes} ${year}</h4>
                <div style="display:flex;gap:0.75rem;font-size:0.75rem;">
                    <span style="display:flex;align-items:center;gap:0.25rem;"><span style="width:10px;height:10px;border-radius:50%;background:var(--green-500);display:inline-block;"></span> Presente</span>
                    <span style="display:flex;align-items:center;gap:0.25rem;"><span style="width:10px;height:10px;border-radius:50%;background:var(--red-500);display:inline-block;"></span> Ausente</span>
                    <span style="display:flex;align-items:center;gap:0.25rem;"><span style="width:10px;height:10px;border-radius:50%;background:var(--yellow-500);display:inline-block;"></span> Tardanza</span>
                    <span style="display:flex;align-items:center;gap:0.25rem;"><span style="width:10px;height:10px;border-radius:50%;background:var(--blue-500);display:inline-block;"></span> Justificado</span>
                </div>
            </div>
            <div class="calendar-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">
        `;

        // Encabezados de días
        diasSemana.forEach(dia => {
            html += `<div style="text-align:center;font-size:0.75rem;font-weight:600;color:var(--gray-500);padding:0.5rem 0;">${dia}</div>`;
        });

        // Días vacíos antes del primer día del mes
        let diaInicio = primerDia.getDay(); // 0 = Domingo
        // Convertir para que Lunes = 0
        diaInicio = diaInicio === 0 ? 6 : diaInicio - 1;

        for (let i = 0; i < diaInicio; i++) {
            html += '<div style="padding:0.375rem;min-height:40px;"></div>';
        }

        // Días del mes
        for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
            const fechaStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const registrosDia = registrosPorFecha[fechaStr] || [];
            const esHoy = dia === now.getDate() && month === now.getMonth() && year === now.getFullYear();

            let estadoDia = null;
            let indicadores = [];

            if (registrosDia.length > 0) {
                // Determinar el peor estado del día (ausente > tardanza > justificado > presente)
                const estados = registrosDia.map(r => r.estado);
                if (estados.includes('ausente')) {
                    estadoDia = 'ausente';
                } else if (estados.includes('tardanza')) {
                    estadoDia = 'tardanza';
                } else if (estados.includes('justificado')) {
                    estadoDia = 'justificado';
                } else if (estados.includes('presente')) {
                    estadoDia = 'presente';
                }

                // Crear indicadores para cada materia
                indicadores = registrosDia.map(r => {
                    const colores = {
                        presente: 'var(--green-500)',
                        ausente: 'var(--red-500)',
                        tardanza: 'var(--yellow-500)',
                        justificado: 'var(--blue-500)'
                    };
                    return `<span style="width:6px;height:6px;border-radius:50%;background:${colores[r.estado] || 'var(--gray-400)'};display:inline-block;" title="${escapeHtml(r.materia_nombre || '')}: ${r.estado}"></span>`;
                });
            }

            const bgColors = {
                presente: 'var(--green-50)',
                ausente: 'var(--red-50)',
                tardanza: 'var(--yellow-50)',
                justificado: 'var(--blue-50)'
            };

            const borderColors = {
                presente: 'var(--green-200)',
                ausente: 'var(--red-200)',
                tardanza: 'var(--yellow-200)',
                justificado: 'var(--blue-200)'
            };

            const cellStyle = estadoDia
                ? `background:${bgColors[estadoDia]};border:1px solid ${borderColors[estadoDia]};`
                : 'background:white;border:1px solid var(--gray-100);';

            const hoyStyle = esHoy ? 'border:2px solid var(--primary-500) !important;font-weight:700;' : '';

            html += `
                <div style="padding:0.375rem;min-height:40px;border-radius:0.25rem;${cellStyle}${hoyStyle}text-align:center;">
                    <div style="font-size:0.8125rem;color:var(--gray-700);">${dia}</div>
                    ${indicadores.length > 0 ? `<div style="display:flex;gap:2px;justify-content:center;margin-top:2px;">${indicadores.join('')}</div>` : ''}
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;
    }
};

// ============================================
// NAVEGACIÓN - Cargar datos al cambiar vista
// ============================================
const _originalNavigateToEstudiante = navigateTo;
window.navigateTo = function(view) {
    _originalNavigateToEstudiante(view);

    switch (view) {
        case 'micarnet':
            estudianteApp.loadCarnet();
            break;
        case 'miasistencia':
            estudianteApp.loadAsistencia(estudianteApp.asistenciaPage);
            break;
    }
};
