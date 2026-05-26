/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Panel de Administración - JavaScript
   ============================================ */

const adminApp = {
    // --- Estado de paginación ---
    currentPages: {
        usuarios: 1,
        estudiantes: 1,
        materias: 1,
        horarios: 1,
        certificados: 1,
        lapsos: 1
    },
    itemsPerPage: 10,

    // --- Datos en caché ---
    usuariosData: [],
    estudiantesData: [],
    materiasData: [],
    horariosData: [],
    asignacionesData: [],
    seccionesData: [],
    lapsosData: [],
    certificadosData: [],
    configData: null,
    notasData: [],

    // --- Foto temporal para estudiantes ---
    fotoBase64: null,

    // --- Estadísticas filtros ---
    estadisticasFiltros: {
        periodo: 'hoy',
        fecha_inicio: '',
        fecha_fin: '',
        persona_id: '',
        seccion: ''
    },

    // ============================================
    // INICIALIZACIÓN
    // ============================================
    async init() {
        try {
            this.initExtraViews();
            await this.loadDashboard();
        } catch (error) {
            console.error('Error al inicializar panel de administración:', error);
            showToast('Error al cargar el panel de administración', 'error');
        }
    },

    // ============================================
    // CREAR VISTAS ADICIONALES DINÁMICAMENTE
    // ============================================
    initExtraViews() {
        const pageBody = document.querySelector('.page-body');
        if (!pageBody) return;

        const extraViews = [
            {
                id: 'view-secciones',
                navView: 'secciones',
                navLabel: 'Secciones',
                navIcon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
                navSection: 'Gestión'
            },
            {
                id: 'view-lapsos',
                navView: 'lapsos',
                navLabel: 'Lapsos',
                navIcon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
                navSection: 'Académico'
            },
            {
                id: 'view-certificados',
                navView: 'certificados',
                navLabel: 'Certificados',
                navIcon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
                navSection: 'Académico'
            },
            {
                id: 'view-estadisticas',
                navView: 'estadisticas',
                navLabel: 'Estadísticas',
                navIcon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
                navSection: 'Reportes'
            },
            {
                id: 'view-config',
                navView: 'config',
                navLabel: 'Configuración',
                navIcon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
                navSection: 'Sistema'
            },
            {
                id: 'view-notas',
                navView: 'notas',
                navLabel: 'Notas',
                navIcon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
                navSection: 'Académico'
            }
        ];

        // Crear las secciones de vista que no existan en el HTML
        extraViews.forEach(view => {
            if (!document.getElementById(view.id)) {
                const section = document.createElement('section');
                section.id = view.id;
                section.className = 'view-section';
                section.style.display = 'none';
                section.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state"><div class="spinner"></div> Cargando...</div></div></div>`;
                pageBody.appendChild(section);
            }
        });

        // Agregar items de navegación al sidebar
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (!sidebarNav) return;

        // Agrupar vistas extra por sección
        const sections = {};
        extraViews.forEach(view => {
            if (!sections[view.navSection]) {
                sections[view.navSection] = [];
            }
            sections[view.navSection].push(view);
        });

        // Crear secciones de navegación
        Object.keys(sections).forEach(sectionName => {
            // Verificar si la sección ya existe
            let existingSection = null;
            sidebarNav.querySelectorAll('.sidebar-section-title').forEach(title => {
                if (title.textContent === sectionName) {
                    existingSection = title.parentElement;
                }
            });

            const sectionDiv = existingSection || document.createElement('div');
            sectionDiv.className = 'sidebar-section';

            if (!existingSection) {
                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'sidebar-section-title';
                sectionTitle.textContent = sectionName;
                sectionDiv.appendChild(sectionTitle);
            }

            sections[sectionName].forEach(view => {
                // Verificar si el nav item ya existe
                if (sidebarNav.querySelector(`[data-view="${view.navView}"]`)) return;

                const navItem = document.createElement('a');
                navItem.className = 'nav-item';
                navItem.setAttribute('data-view', view.navView);
                navItem.onclick = () => navigateTo(view.navView);
                navItem.innerHTML = `
                    <span class="nav-item-icon">${view.navIcon}</span>
                    <span class="nav-item-text">${view.navLabel}</span>
                `;
                sectionDiv.appendChild(navItem);
            });

            if (!existingSection) {
                sidebarNav.appendChild(sectionDiv);
            }
        });
    },

    // ============================================
    // DASHBOARD
    // ============================================
    async loadDashboard() {
        try {
            showLoading();

            // Intentar usar endpoint de estadísticas resumen
            let statsLoaded = false;
            try {
                const res = await apiCall('GET', '/admin/estadisticas?action=resumen');
                if (res.resumen) {
                    const r = res.resumen;
                    document.getElementById('statEstudiantes').textContent = r.total_estudiantes || 0;
                    document.getElementById('statProfesores').textContent = r.total_profesores || 0;
                    document.getElementById('statSecciones').textContent = r.total_secciones || 0;
                    document.getElementById('statAsistencias').textContent = r.asistencias_hoy || 0;
                    statsLoaded = true;
                }
            } catch (e) {
                console.warn('Endpoint de estadísticas no disponible, usando método alternativo');
            }

            // Método alternativo si el endpoint de estadísticas no funciona
            if (!statsLoaded) {
                const estudiantesRes = await apiCall('GET', '/admin/estudiantes?limit=1');
                document.getElementById('statEstudiantes').textContent = estudiantesRes.pagination?.total || 0;

                const profesoresRes = await apiCall('GET', '/admin/usuarios?rol=profesor&limit=1');
                document.getElementById('statProfesores').textContent = profesoresRes.pagination?.total || 0;

                const estudiantesAll = await apiCall('GET', '/admin/estudiantes?limit=1000');
                const secciones = new Set();
                if (estudiantesAll.students) {
                    estudiantesAll.students.forEach(e => {
                        if (e.grado && e.seccion) {
                            secciones.add(`${e.grado}-${e.seccion}`);
                        }
                    });
                }
                document.getElementById('statSecciones').textContent = secciones.size;

                let asistenciasHoy = 0;
                try {
                    const historialRes = await apiCall('GET', '/profesor/clases?action=historial&limit=100');
                    const hoy = new Date().toISOString().split('T')[0];
                    if (historialRes.sesiones) {
                        historialRes.sesiones.forEach(s => {
                            if (s.fecha_inicio && s.fecha_inicio.startsWith(hoy)) {
                                asistenciasHoy++;
                            }
                        });
                    }
                } catch (e) { /* ignorar */ }
                document.getElementById('statAsistencias').textContent = asistenciasHoy;
            }

            this.loadRecentActivity();
        } catch (error) {
            console.error('Error al cargar dashboard:', error);
            showToast('Error al cargar las estadísticas del dashboard', 'error');
        } finally {
            hideLoading();
        }
    },

    async loadRecentActivity() {
        const container = document.getElementById('recentActivity');
        if (!container) return;

        try {
            const [estRes, histRes] = await Promise.allSettled([
                apiCall('GET', '/admin/estudiantes?limit=5'),
                apiCall('GET', '/profesor/clases?action=historial&limit=5')
            ]);

            let activities = [];

            if (estRes.status === 'fulfilled' && estRes.value.students) {
                estRes.value.students.forEach(s => {
                    activities.push({
                        tipo: 'estudiante',
                        texto: `Nuevo estudiante registrado: ${escapeHtml(s.nombre)} ${escapeHtml(s.apellido)} (${s.grado}° "${s.seccion}")`,
                        fecha: s.fecha_creacion
                    });
                });
            }

            if (histRes.status === 'fulfilled' && histRes.value.sesiones) {
                histRes.value.sesiones.forEach(s => {
                    activities.push({
                        tipo: 'sesion',
                        texto: `Sesión de asistencia: ${s.materia_nombre || 'Sin materia'} - ${s.estado}`,
                        fecha: s.fecha_inicio
                    });
                });
            }

            activities.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            activities = activities.slice(0, 8);

            if (activities.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <div class="empty-state-title">Sin actividad reciente</div>
                        <div class="empty-state-text">Las actividades recientes aparecerán aquí</div>
                    </div>`;
                return;
            }

            const iconos = { estudiante: '🎓', sesion: '📋' };

            container.innerHTML = activities.map(a => `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 0;border-bottom:1px solid var(--gray-100);">
                    <span style="font-size:1.25rem;">${iconos[a.tipo] || '📌'}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.875rem;color:var(--gray-800);">${a.texto}</div>
                        <div style="font-size:0.75rem;color:var(--gray-500);">${formatDateTimeString(a.fecha)}</div>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error al cargar actividad reciente:', error);
        }
    },

    // ============================================
    // USUARIOS
    // ============================================
    async loadUsuarios(page = 1) {
        this.currentPages.usuarios = page;
        const tbody = document.getElementById('usuariosTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><div class="spinner"></div> Cargando usuarios...</td></tr>';

        try {
            const data = await apiCall('GET', `/admin/usuarios?page=${page}&limit=${this.itemsPerPage}`);
            this.usuariosData = data.users || [];

            if (this.usuariosData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No hay usuarios registrados</td></tr>';
                document.getElementById('usuariosPagination').innerHTML = '';
                return;
            }

            const rolesMap = {
                admin: 'Administrador',
                profesor: 'Profesor',
                representante: 'Representante'
            };

            tbody.innerHTML = this.usuariosData.map(u => `
                <tr>
                    <td>${escapeHtml(u.cedula)}</td>
                    <td>${escapeHtml(u.nombre)}</td>
                    <td>${escapeHtml(u.apellido)}</td>
                    <td>${escapeHtml(u.email || '-')}</td>
                    <td><span class="badge badge-${u.rol}">${rolesMap[u.rol] || u.rol}</span></td>
                    <td>${escapeHtml(u.telefono || '-')}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-outline btn-sm" onclick="adminApp.showUsuarioModal(${u.id})" title="Editar">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="adminApp.deleteUsuario(${u.id})" title="Eliminar">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

            const paginationHtml = renderPagination(
                data.pagination.total,
                data.pagination.page,
                this.itemsPerPage,
                'adminApp.loadUsuarios'
            );
            document.getElementById('usuariosPagination').innerHTML = paginationHtml;

        } catch (error) {
            console.error('Error al cargar usuarios:', error);
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Error al cargar los usuarios</td></tr>';
            showToast('Error al cargar la lista de usuarios', 'error');
        }
    },

    showUsuarioModal(id = null) {
        const isEdit = id !== null;
        const usuario = isEdit ? this.usuariosData.find(u => u.id === id) : null;

        const content = `
            <form id="usuarioForm" onsubmit="event.preventDefault(); adminApp.saveUsuario();">
                <input type="hidden" id="usuarioId" value="${isEdit ? usuario.id : ''}">
                <div class="form-row">
                    <div class="form-group">
                        <label for="usuarioCedula">Cédula *</label>
                        <input type="text" class="form-control" id="usuarioCedula" value="${isEdit ? escapeHtml(usuario.cedula) : ''}" required placeholder="Ej: V-12345678">
                    </div>
                    <div class="form-group">
                        <label for="usuarioRol">Rol *</label>
                        <select class="form-control" id="usuarioRol" required>
                            <option value="">Seleccione un rol</option>
                            <option value="admin" ${isEdit && usuario.rol === 'admin' ? 'selected' : ''}>Administrador</option>
                            <option value="profesor" ${isEdit && usuario.rol === 'profesor' ? 'selected' : ''}>Profesor</option>
                            <option value="representante" ${isEdit && usuario.rol === 'representante' ? 'selected' : ''}>Representante</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="usuarioNombre">Nombre *</label>
                        <input type="text" class="form-control" id="usuarioNombre" value="${isEdit ? escapeHtml(usuario.nombre) : ''}" required placeholder="Nombre">
                    </div>
                    <div class="form-group">
                        <label for="usuarioApellido">Apellido *</label>
                        <input type="text" class="form-control" id="usuarioApellido" value="${isEdit ? escapeHtml(usuario.apellido) : ''}" required placeholder="Apellido">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="usuarioEmail">Email</label>
                        <input type="email" class="form-control" id="usuarioEmail" value="${isEdit ? escapeHtml(usuario.email || '') : ''}" placeholder="correo@ejemplo.com">
                    </div>
                    <div class="form-group">
                        <label for="usuarioTelefono">Teléfono</label>
                        <input type="text" class="form-control" id="usuarioTelefono" value="${isEdit ? escapeHtml(usuario.telefono || '') : ''}" placeholder="Ej: 0412-1234567">
                    </div>
                </div>
                <div class="form-group">
                    <label for="usuarioPassword">${isEdit ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
                    <input type="password" class="form-control" id="usuarioPassword" ${isEdit ? '' : 'required'} placeholder="${isEdit ? 'Dejar vacío para mantener actual' : 'Contraseña'}">
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="adminApp.saveUsuario()">
                ${isEdit ? 'Actualizar Usuario' : 'Crear Usuario'}
            </button>
        `;

        showModal(isEdit ? 'Editar Usuario' : 'Nuevo Usuario', content, footer);
    },

    async saveUsuario() {
        const id = document.getElementById('usuarioId')?.value;
        const cedula = document.getElementById('usuarioCedula')?.value.trim();
        const rol = document.getElementById('usuarioRol')?.value;
        const nombre = document.getElementById('usuarioNombre')?.value.trim();
        const apellido = document.getElementById('usuarioApellido')?.value.trim();
        const email = document.getElementById('usuarioEmail')?.value.trim();
        const telefono = document.getElementById('usuarioTelefono')?.value.trim();
        const password = document.getElementById('usuarioPassword')?.value;

        if (!cedula || !rol || !nombre || !apellido) {
            showToast('Por favor complete todos los campos requeridos', 'warning');
            return;
        }
        if (!id && !password) {
            showToast('La contraseña es requerida para nuevos usuarios', 'warning');
            return;
        }

        try {
            showLoading();
            const body = { cedula, rol, nombre, apellido, email, telefono };
            if (password) body.password = password;

            if (id) {
                body.id = parseInt(id);
                await apiCall('PUT', '/admin/usuarios', body);
                showToast('Usuario actualizado exitosamente', 'success');
            } else {
                body.password = password;
                await apiCall('POST', '/admin/usuarios', body);
                showToast('Usuario creado exitosamente', 'success');
            }

            closeModal();
            this.loadUsuarios(this.currentPages.usuarios);
        } catch (error) {
            console.error('Error al guardar usuario:', error);
            showToast(error.message || 'Error al guardar el usuario', 'error');
        } finally {
            hideLoading();
        }
    },

    deleteUsuario(id) {
        showConfirm('¿Está seguro de que desea desactivar este usuario? Esta acción no se puede deshacer.', async () => {
            try {
                showLoading();
                await apiCall('DELETE', `/admin/usuarios?id=${id}`);
                showToast('Usuario desactivado exitosamente', 'success');
                this.loadUsuarios(this.currentPages.usuarios);
            } catch (error) {
                console.error('Error al desactivar usuario:', error);
                showToast(error.message || 'Error al desactivar el usuario', 'error');
            } finally {
                hideLoading();
            }
        });
    },

    searchUsuarios: debounce(function(term) {
        if (!term || term.length < 2) {
            this.loadUsuarios(1);
            return;
        }
        const tbody = document.getElementById('usuariosTableBody');
        if (!tbody) return;

        const filtered = this.usuariosData.filter(u =>
            u.cedula.toLowerCase().includes(term.toLowerCase()) ||
            u.nombre.toLowerCase().includes(term.toLowerCase()) ||
            u.apellido.toLowerCase().includes(term.toLowerCase()) ||
            (u.email || '').toLowerCase().includes(term.toLowerCase())
        );

        const rolesMap = {
            admin: 'Administrador',
            profesor: 'Profesor',
            representante: 'Representante'
        };

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No se encontraron usuarios</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(u => `
            <tr>
                <td>${escapeHtml(u.cedula)}</td>
                <td>${escapeHtml(u.nombre)}</td>
                <td>${escapeHtml(u.apellido)}</td>
                <td>${escapeHtml(u.email || '-')}</td>
                <td><span class="badge badge-${u.rol}">${rolesMap[u.rol] || u.rol}</span></td>
                <td>${escapeHtml(u.telefono || '-')}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" onclick="adminApp.showUsuarioModal(${u.id})" title="Editar">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="adminApp.deleteUsuario(${u.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }, 300),

    // ============================================
    // ESTUDIANTES
    // ============================================
    async loadEstudiantes(page = 1) {
        this.currentPages.estudiantes = page;
        const tbody = document.getElementById('estudiantesTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><div class="spinner"></div> Cargando estudiantes...</td></tr>';

        try {
            const data = await apiCall('GET', `/admin/estudiantes?page=${page}&limit=${this.itemsPerPage}`);
            this.estudiantesData = data.students || [];

            if (this.estudiantesData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No hay estudiantes registrados</td></tr>';
                document.getElementById('estudiantesPagination').innerHTML = '';
                return;
            }

            tbody.innerHTML = this.estudiantesData.map(e => {
                const fotoUrl = e.foto ? `/api/upload?key=${encodeURIComponent(e.foto)}` : '';
                const fotoCell = fotoUrl
                    ? `<img src="${fotoUrl}" alt="Foto" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`
                    : `<div style="width:36px;height:36px;border-radius:50%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--gray-500);">Sin foto</div>`;

                return `
                <tr>
                    <td>${fotoCell}</td>
                    <td>${escapeHtml(e.cedula_escolar || '-')}</td>
                    <td>${escapeHtml(e.nombre)}</td>
                    <td>${escapeHtml(e.apellido)}</td>
                    <td>${escapeHtml(e.grado)}</td>
                    <td>${escapeHtml(e.seccion)}</td>
                    <td><code>${escapeHtml(e.codigo_unico || '-')}</code></td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-outline btn-sm" onclick="adminApp.showEstudianteModal(${e.id})" title="Editar">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn btn-success btn-sm" onclick="adminApp.generateCarnet(${e.id})" title="Carnet">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="adminApp.deleteEstudiante(${e.id})" title="Eliminar">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            const paginationHtml = renderPagination(
                data.pagination.total,
                data.pagination.page,
                this.itemsPerPage,
                'adminApp.loadEstudiantes'
            );
            document.getElementById('estudiantesPagination').innerHTML = paginationHtml;

        } catch (error) {
            console.error('Error al cargar estudiantes:', error);
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Error al cargar los estudiantes</td></tr>';
            showToast('Error al cargar la lista de estudiantes', 'error');
        }
    },

    showEstudianteModal(id = null) {
        const isEdit = id !== null;
        const estudiante = isEdit ? this.estudiantesData.find(e => e.id === id) : null;
        this.fotoBase64 = null;

        const content = `
            <form id="estudianteForm" onsubmit="event.preventDefault(); adminApp.saveEstudiante();">
                <input type="hidden" id="estudianteId" value="${isEdit ? estudiante.id : ''}">
                <div class="form-row">
                    <div class="form-group">
                        <label for="estudianteNombre">Nombre *</label>
                        <input type="text" class="form-control" id="estudianteNombre" value="${isEdit ? escapeHtml(estudiante.nombre) : ''}" required placeholder="Nombre">
                    </div>
                    <div class="form-group">
                        <label for="estudianteApellido">Apellido *</label>
                        <input type="text" class="form-control" id="estudianteApellido" value="${isEdit ? escapeHtml(estudiante.apellido) : ''}" required placeholder="Apellido">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="estudianteCedulaEscolar">Cédula Escolar</label>
                        <input type="text" class="form-control" id="estudianteCedulaEscolar" value="${isEdit ? escapeHtml(estudiante.cedula_escolar || '') : ''}" placeholder="Ej: CE-12345678">
                    </div>
                    <div class="form-group">
                        <label for="estudianteFechaNacimiento">Fecha de Nacimiento</label>
                        <input type="date" class="form-control" id="estudianteFechaNacimiento" value="${isEdit && estudiante.fecha_nacimiento ? estudiante.fecha_nacimiento.split('T')[0] : ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="estudianteGenero">Género</label>
                        <select class="form-control" id="estudianteGenero">
                            <option value="">Seleccione</option>
                            <option value="M" ${isEdit && estudiante.genero === 'M' ? 'selected' : ''}>Masculino</option>
                            <option value="F" ${isEdit && estudiante.genero === 'F' ? 'selected' : ''}>Femenino</option>
                            <option value="O" ${isEdit && estudiante.genero === 'O' ? 'selected' : ''}>Otro</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="estudianteGrado">Grado *</label>
                        <select class="form-control" id="estudianteGrado" required>
                            <option value="">Seleccione</option>
                            ${[1,2,3,4,5,6].map(g => `<option value="${g}" ${isEdit && estudiante.grado == g ? 'selected' : ''}>${g}° Grado</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="estudianteSeccion">Sección *</label>
                        <select class="form-control" id="estudianteSeccion" required>
                            <option value="">Seleccione</option>
                            ${['A','B','C','D'].map(s => `<option value="${s}" ${isEdit && estudiante.seccion === s ? 'selected' : ''}>Sección "${s}"</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="estudianteTelefonoEmergencia">Teléfono de Emergencia</label>
                        <input type="text" class="form-control" id="estudianteTelefonoEmergencia" value="${isEdit ? escapeHtml(estudiante.telefono_emergencia || '') : ''}" placeholder="Ej: 0412-1234567">
                    </div>
                </div>
                <div class="form-group">
                    <label for="estudianteDireccion">Dirección</label>
                    <textarea class="form-control" id="estudianteDireccion" rows="2" placeholder="Dirección de habitación">${isEdit ? escapeHtml(estudiante.direccion || '') : ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Foto del Estudiante</label>
                    <div style="display:flex;align-items:center;gap:1rem;">
                        <div id="fotoPreview" style="width:64px;height:64px;border-radius:50%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;overflow:hidden;border:2px solid var(--gray-300);">
                            ${isEdit && estudiante.foto ? `<img src="/api/upload?key=${encodeURIComponent(estudiante.foto)}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:0.75rem;color:var(--gray-500);">Sin foto</span>'}
                        </div>
                        <div>
                            <input type="file" id="estudianteFoto" accept="image/*" onchange="adminApp.handleFotoUpload(this)" style="display:none;">
                            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('estudianteFoto').click()">
                                Seleccionar Foto
                            </button>
                            <button type="button" class="btn btn-outline btn-sm" onclick="adminApp.removeFoto()" style="margin-left:0.5rem;">
                                Quitar
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="adminApp.saveEstudiante()">
                ${isEdit ? 'Actualizar Estudiante' : 'Crear Estudiante'}
            </button>
        `;

        showModal(isEdit ? 'Editar Estudiante' : 'Nuevo Estudiante', content, footer);
    },

    handleFotoUpload(input) {
        const file = input.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast('La imagen no debe superar los 2MB', 'warning');
            input.value = '';
            return;
        }

        if (!file.type.startsWith('image/')) {
            showToast('Solo se permiten archivos de imagen', 'warning');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.fotoBase64 = e.target.result;
            const preview = document.getElementById('fotoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${this.fotoBase64}" style="width:100%;height:100%;object-fit:cover;">`;
            }
        };
        reader.readAsDataURL(file);
    },

    removeFoto() {
        this.fotoBase64 = null;
        const preview = document.getElementById('fotoPreview');
        if (preview) {
            preview.innerHTML = '<span style="font-size:0.75rem;color:var(--gray-500);">Sin foto</span>';
        }
        const input = document.getElementById('estudianteFoto');
        if (input) input.value = '';
    },

    async saveEstudiante() {
        const id = document.getElementById('estudianteId')?.value;
        const nombre = document.getElementById('estudianteNombre')?.value.trim();
        const apellido = document.getElementById('estudianteApellido')?.value.trim();
        const cedula_escolar = document.getElementById('estudianteCedulaEscolar')?.value.trim();
        const fecha_nacimiento = document.getElementById('estudianteFechaNacimiento')?.value;
        const genero = document.getElementById('estudianteGenero')?.value;
        const grado = document.getElementById('estudianteGrado')?.value;
        const seccion = document.getElementById('estudianteSeccion')?.value;
        const direccion = document.getElementById('estudianteDireccion')?.value.trim();
        const telefono_emergencia = document.getElementById('estudianteTelefonoEmergencia')?.value.trim();

        if (!nombre || !apellido || !grado || !seccion) {
            showToast('Por favor complete todos los campos requeridos', 'warning');
            return;
        }

        try {
            showLoading();

            const body = {
                nombre, apellido, cedula_escolar, fecha_nacimiento,
                genero, grado, seccion, direccion, telefono_emergencia
            };

            if (this.fotoBase64) {
                body.foto = this.fotoBase64;
            }

            if (id) {
                body.id = parseInt(id);
                await apiCall('PUT', '/admin/estudiantes', body);
                showToast('Estudiante actualizado exitosamente', 'success');
            } else {
                await apiCall('POST', '/admin/estudiantes', body);
                showToast('Estudiante creado exitosamente', 'success');
            }

            closeModal();
            this.fotoBase64 = null;
            this.loadEstudiantes(this.currentPages.estudiantes);
        } catch (error) {
            console.error('Error al guardar estudiante:', error);
            showToast(error.message || 'Error al guardar el estudiante', 'error');
        } finally {
            hideLoading();
        }
    },

    deleteEstudiante(id) {
        showConfirm('¿Está seguro de que desea desactivar este estudiante? Esta acción no se puede deshacer.', async () => {
            try {
                showLoading();
                await apiCall('DELETE', `/admin/estudiantes?id=${id}`);
                showToast('Estudiante desactivado exitosamente', 'success');
                this.loadEstudiantes(this.currentPages.estudiantes);
            } catch (error) {
                console.error('Error al desactivar estudiante:', error);
                showToast(error.message || 'Error al desactivar el estudiante', 'error');
            } finally {
                hideLoading();
            }
        });
    },

    async generateCarnet(id) {
        try {
            showLoading();
            const data = await apiCall('GET', `/estudiante/carnet?action=carnet&estudiante_id=${id}`);
            const carnet = data.carnet;

            if (!carnet) {
                showToast('No se pudo obtener la información del carnet', 'error');
                return;
            }

            const fotoUrl = carnet.foto ? `/api/upload?key=${encodeURIComponent(carnet.foto)}` : '';
            const qrData = carnet.qr_code || carnet.codigo_unico || `EST-${carnet.id}`;
            const qrUrl = getQRUrl(qrData, 150);

            const content = `
                <div id="carnetPreview" style="max-width:360px;margin:0 auto;">
                    <div style="background:linear-gradient(135deg,var(--primary-600),var(--primary-800));color:white;padding:1rem;border-radius:0.5rem 0.5rem 0 0;text-align:center;">
                        <h4 style="margin:0;font-size:1rem;">Sistema de Asistencia Escolar</h4>
                        <p style="margin:0.25rem 0 0;font-size:0.8rem;opacity:0.9;">Carnet Estudiantil</p>
                    </div>
                    <div style="background:white;padding:1.25rem;border:1px solid var(--gray-200);border-top:none;">
                        <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;">
                            <div style="width:72px;height:72px;border-radius:50%;overflow:hidden;border:2px solid var(--gray-200);flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--gray-100);">
                                ${fotoUrl ? `<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:0.7rem;color:var(--gray-400);">Sin Foto</span>'}
                            </div>
                            <div style="flex:1;">
                                <div style="font-size:0.75rem;color:var(--gray-500);margin-bottom:0.125rem;">Nombre</div>
                                <div style="font-size:0.9375rem;font-weight:600;">${escapeHtml(carnet.nombre)} ${escapeHtml(carnet.apellido)}</div>
                                <div style="font-size:0.75rem;color:var(--gray-500);margin-top:0.375rem;">Cédula Escolar</div>
                                <div style="font-size:0.875rem;">${escapeHtml(carnet.cedula_escolar || '-')}</div>
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8125rem;margin-bottom:1rem;">
                            <div><span style="color:var(--gray-500);">Grado:</span> ${escapeHtml(carnet.grado)}°</div>
                            <div><span style="color:var(--gray-500);">Sección:</span> "${escapeHtml(carnet.seccion)}"</div>
                            <div style="grid-column:1/-1;">
                                <span style="color:var(--gray-500);">Código:</span>
                                <code style="background:var(--gray-100);padding:0.125rem 0.375rem;border-radius:0.25rem;">${escapeHtml(carnet.codigo_unico)}</code>
                            </div>
                        </div>
                        <div style="text-align:center;">
                            <img src="${qrUrl}" alt="Código QR" style="width:120px;height:120px;">
                            <div style="font-size:0.6875rem;color:var(--gray-400);margin-top:0.25rem;">Código QR de verificación</div>
                        </div>
                    </div>
                    <div style="background:var(--gray-50);padding:0.5rem;border-radius:0 0 0.5rem 0.5rem;text-align:center;border:1px solid var(--gray-200);border-top:none;">
                        <p style="margin:0;font-size:0.6875rem;color:var(--gray-500);">Este carnet es personal e intransferible</p>
                    </div>
                </div>
            `;

            const footer = `
                <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>
                <button class="btn btn-primary" onclick="adminApp.printCarnetPreview()">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Imprimir
                </button>
            `;

            showModal('Carnet Estudiantil', content, footer);
        } catch (error) {
            console.error('Error al generar carnet:', error);
            showToast('Error al generar el carnet del estudiante', 'error');
        } finally {
            hideLoading();
        }
    },

    printCarnetPreview() {
        printElement('carnetPreview');
    },

    searchEstudiantes: debounce(function(term) {
        if (!term || term.length < 2) {
            this.loadEstudiantes(1);
            return;
        }
        const tbody = document.getElementById('estudiantesTableBody');
        if (!tbody) return;

        const filtered = this.estudiantesData.filter(e =>
            e.nombre.toLowerCase().includes(term.toLowerCase()) ||
            e.apellido.toLowerCase().includes(term.toLowerCase()) ||
            (e.cedula_escolar || '').toLowerCase().includes(term.toLowerCase()) ||
            (e.codigo_unico || '').toLowerCase().includes(term.toLowerCase())
        );

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No se encontraron estudiantes</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(e => {
            const fotoUrl = e.foto ? `/api/upload?key=${encodeURIComponent(e.foto)}` : '';
            const fotoCell = fotoUrl
                ? `<img src="${fotoUrl}" alt="Foto" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`
                : `<div style="width:36px;height:36px;border-radius:50%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--gray-500);">Sin foto</div>`;

            return `
            <tr>
                <td>${fotoCell}</td>
                <td>${escapeHtml(e.cedula_escolar || '-')}</td>
                <td>${escapeHtml(e.nombre)}</td>
                <td>${escapeHtml(e.apellido)}</td>
                <td>${escapeHtml(e.grado)}</td>
                <td>${escapeHtml(e.seccion)}</td>
                <td><code>${escapeHtml(e.codigo_unico || '-')}</code></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" onclick="adminApp.showEstudianteModal(${e.id})" title="Editar">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn btn-success btn-sm" onclick="adminApp.generateCarnet(${e.id})" title="Carnet">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="adminApp.deleteEstudiante(${e.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }, 300),

    // ============================================
    // MATERIAS
    // ============================================
    async loadMaterias(page = 1) {
        this.currentPages.materias = page;
        const tbody = document.getElementById('materiasTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" class="table-empty"><div class="spinner"></div> Cargando materias...</td></tr>';

        try {
            const data = await apiCall('GET', `/admin/horarios?page=${page}&limit=${this.itemsPerPage}`);

            // Intentar obtener materias desde horarios (agrupando por materia)
            const horarios = data.horarios || data.schedules || [];
            const materiasMap = {};
            horarios.forEach(h => {
                if (h.materia_id && !materiasMap[h.materia_id]) {
                    materiasMap[h.materia_id] = {
                        id: h.materia_id,
                        nombre: h.materia_nombre || h.materia,
                        descripcion: h.materia_descripcion || '',
                        codigo: h.materia_codigo || ''
                    };
                }
            });
            this.materiasData = Object.values(materiasMap);

            if (this.materiasData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No hay materias registradas</td></tr>';
                document.getElementById('materiasPagination').innerHTML = '';
                return;
            }

            tbody.innerHTML = this.materiasData.map(m => `
                <tr>
                    <td>${m.id}</td>
                    <td><strong>${escapeHtml(m.nombre)}</strong>${m.codigo ? ` <code style="font-size:0.75rem;">${escapeHtml(m.codigo)}</code>` : ''}</td>
                    <td>${escapeHtml(m.descripcion || '-')}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-outline btn-sm" onclick="adminApp.showMateriaModal(${m.id})" title="Editar">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="adminApp.deleteMateria(${m.id})" title="Eliminar">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

            const totalItems = data.pagination?.total || this.materiasData.length;
            const paginationHtml = renderPagination(totalItems, page, this.itemsPerPage, 'adminApp.loadMaterias');
            document.getElementById('materiasPagination').innerHTML = paginationHtml;

        } catch (error) {
            console.error('Error al cargar materias:', error);
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Error al cargar las materias</td></tr>';
            showToast('Error al cargar la lista de materias', 'error');
        }
    },

    showMateriaModal(id = null) {
        const isEdit = id !== null;
        const materia = isEdit ? this.materiasData.find(m => m.id === id) : null;

        const content = `
            <form id="materiaForm" onsubmit="event.preventDefault(); adminApp.saveMateria();">
                <input type="hidden" id="materiaId" value="${isEdit ? materia.id : ''}">
                <div class="form-group">
                    <label for="materiaNombre">Nombre de la Materia *</label>
                    <input type="text" class="form-control" id="materiaNombre" value="${isEdit ? escapeHtml(materia.nombre) : ''}" required placeholder="Ej: Matemáticas">
                </div>
                <div class="form-group">
                    <label for="materiaCodigo">Código</label>
                    <input type="text" class="form-control" id="materiaCodigo" value="${isEdit ? escapeHtml(materia.codigo || '') : ''}" placeholder="Ej: MAT-101">
                </div>
                <div class="form-group">
                    <label for="materiaDescripcion">Descripción</label>
                    <textarea class="form-control" id="materiaDescripcion" rows="3" placeholder="Descripción de la materia">${isEdit ? escapeHtml(materia.descripcion || '') : ''}</textarea>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="adminApp.saveMateria()">
                ${isEdit ? 'Actualizar Materia' : 'Crear Materia'}
            </button>
        `;

        showModal(isEdit ? 'Editar Materia' : 'Nueva Materia', content, footer);
    },

    async saveMateria() {
        const id = document.getElementById('materiaId')?.value;
        const nombre = document.getElementById('materiaNombre')?.value.trim();
        const codigo = document.getElementById('materiaCodigo')?.value.trim();
        const descripcion = document.getElementById('materiaDescripcion')?.value.trim();

        if (!nombre) {
            showToast('El nombre de la materia es requerido', 'warning');
            return;
        }

        try {
            showLoading();
            const body = { nombre, codigo, descripcion };

            if (id) {
                body.id = parseInt(id);
                await apiCall('PUT', '/admin/horarios', body);
                showToast('Materia actualizada exitosamente', 'success');
            } else {
                await apiCall('POST', '/admin/horarios', body);
                showToast('Materia creada exitosamente', 'success');
            }

            closeModal();
            this.loadMaterias(this.currentPages.materias);
        } catch (error) {
            console.error('Error al guardar materia:', error);
            showToast(error.message || 'Error al guardar la materia', 'error');
        } finally {
            hideLoading();
        }
    },

    deleteMateria(id) {
        showConfirm('¿Está seguro de que desea eliminar esta materia? Se eliminarán los horarios asociados.', async () => {
            try {
                showLoading();
                await apiCall('DELETE', `/admin/horarios?id=${id}`);
                showToast('Materia eliminada exitosamente', 'success');
                this.loadMaterias(this.currentPages.materias);
            } catch (error) {
                console.error('Error al eliminar materia:', error);
                showToast(error.message || 'Error al eliminar la materia', 'error');
            } finally {
                hideLoading();
            }
        });
    },

    searchMaterias: debounce(function(term) {
        if (!term || term.length < 2) {
            this.loadMaterias(1);
            return;
        }
        const tbody = document.getElementById('materiasTableBody');
        if (!tbody) return;

        const filtered = this.materiasData.filter(m =>
            m.nombre.toLowerCase().includes(term.toLowerCase()) ||
            (m.codigo || '').toLowerCase().includes(term.toLowerCase())
        );

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No se encontraron materias</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(m => `
            <tr>
                <td>${m.id}</td>
                <td><strong>${escapeHtml(m.nombre)}</strong></td>
                <td>${escapeHtml(m.descripcion || '-')}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" onclick="adminApp.showMateriaModal(${m.id})" title="Editar">✏️</button>
                        <button class="btn btn-danger btn-sm" onclick="adminApp.deleteMateria(${m.id})" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }, 300),

    // ============================================
    // HORARIOS
    // ============================================
    async loadHorarios(page = 1) {
        this.currentPages.horarios = page;
        const tbody = document.getElementById('horariosTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><div class="spinner"></div> Cargando horarios...</td></tr>';

        try {
            const data = await apiCall('GET', `/admin/horarios?page=${page}&limit=${this.itemsPerPage}`);
            this.horariosData = data.horarios || data.schedules || [];

            if (this.horariosData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No hay horarios registrados</td></tr>';
                document.getElementById('horariosPagination').innerHTML = '';
                return;
            }

            tbody.innerHTML = this.horariosData.map(h => `
                <tr>
                    <td>${escapeHtml(h.materia_nombre || h.materia || '-')}</td>
                    <td>${escapeHtml(h.profesor_nombre || h.profesor || '-')}</td>
                    <td>${getDayName(h.dia_semana || h.dia)}</td>
                    <td>${formatTimeString(h.hora_inicio)}</td>
                    <td>${formatTimeString(h.hora_fin)}</td>
                    <td>${escapeHtml(h.aula || '-')}</td>
                    <td>${h.periodo || '-'}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-outline btn-sm" onclick="adminApp.showHorarioModal(${h.id})" title="Editar">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="adminApp.deleteHorario(${h.id})" title="Eliminar">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

            const totalItems = data.pagination?.total || this.horariosData.length;
            const paginationHtml = renderPagination(totalItems, page, this.itemsPerPage, 'adminApp.loadHorarios');
            document.getElementById('horariosPagination').innerHTML = paginationHtml;

        } catch (error) {
            console.error('Error al cargar horarios:', error);
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Error al cargar los horarios</td></tr>';
            showToast('Error al cargar la lista de horarios', 'error');
        }
    },

    async showHorarioModal(id = null) {
        const isEdit = id !== null;
        const horario = isEdit ? this.horariosData.find(h => h.id === id) : null;

        // Cargar profesores y materias para los selects
        let profesores = [];
        let materias = [];
        try {
            const profRes = await apiCall('GET', '/admin/usuarios?rol=profesor&limit=100');
            profesores = profRes.users || [];
        } catch (e) { /* ignorar */ }

        try {
            const matRes = await apiCall('GET', '/admin/horarios?limit=100');
            const horarios = matRes.horarios || matRes.schedules || [];
            const seen = new Set();
            horarios.forEach(h => {
                const key = `${h.materia_id}`;
                if (h.materia_id && !seen.has(key)) {
                    seen.add(key);
                    materias.push({ id: h.materia_id, nombre: h.materia_nombre || h.materia });
                }
            });
        } catch (e) { /* ignorar */ }

        const diasSemana = [
            { valor: 1, nombre: 'Lunes' },
            { valor: 2, nombre: 'Martes' },
            { valor: 3, nombre: 'Miércoles' },
            { valor: 4, nombre: 'Jueves' },
            { valor: 5, nombre: 'Viernes' }
        ];

        const content = `
            <form id="horarioForm" onsubmit="event.preventDefault(); adminApp.saveHorario();">
                <input type="hidden" id="horarioId" value="${isEdit ? horario.id : ''}">
                <div class="form-row">
                    <div class="form-group">
                        <label for="horarioMateria">Materia *</label>
                        <select class="form-control" id="horarioMateria" required>
                            <option value="">Seleccione una materia</option>
                            ${materias.map(m => `<option value="${m.id}" ${isEdit && horario.materia_id == m.id ? 'selected' : ''}>${escapeHtml(m.nombre)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="horarioProfesor">Profesor *</label>
                        <select class="form-control" id="horarioProfesor" required>
                            <option value="">Seleccione un profesor</option>
                            ${profesores.map(p => `<option value="${p.id}" ${isEdit && horario.profesor_id == p.id ? 'selected' : ''}>${escapeHtml(p.nombre)} ${escapeHtml(p.apellido)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="horarioDia">Día *</label>
                        <select class="form-control" id="horarioDia" required>
                            <option value="">Seleccione un día</option>
                            ${diasSemana.map(d => `<option value="${d.valor}" ${isEdit && horario.dia_semana == d.valor ? 'selected' : ''}>${d.nombre}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="horarioAula">Aula</label>
                        <input type="text" class="form-control" id="horarioAula" value="${isEdit ? escapeHtml(horario.aula || '') : ''}" placeholder="Ej: A-101">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="horarioHoraInicio">Hora de Inicio *</label>
                        <input type="time" class="form-control" id="horarioHoraInicio" value="${isEdit ? (horario.hora_inicio || '') : ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="horarioHoraFin">Hora de Fin *</label>
                        <input type="time" class="form-control" id="horarioHoraFin" value="${isEdit ? (horario.hora_fin || '') : ''}" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="horarioPeriodo">Período</label>
                    <input type="text" class="form-control" id="horarioPeriodo" value="${isEdit ? escapeHtml(horario.periodo || '') : ''}" placeholder="Ej: 2024-2025">
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="adminApp.saveHorario()">
                ${isEdit ? 'Actualizar Horario' : 'Crear Horario'}
            </button>
        `;

        showModal(isEdit ? 'Editar Horario' : 'Nuevo Horario', content, footer);
    },

    async saveHorario() {
        const id = document.getElementById('horarioId')?.value;
        const materia_id = document.getElementById('horarioMateria')?.value;
        const profesor_id = document.getElementById('horarioProfesor')?.value;
        const dia_semana = document.getElementById('horarioDia')?.value;
        const hora_inicio = document.getElementById('horarioHoraInicio')?.value;
        const hora_fin = document.getElementById('horarioHoraFin')?.value;
        const aula = document.getElementById('horarioAula')?.value.trim();
        const periodo = document.getElementById('horarioPeriodo')?.value.trim();

        if (!materia_id || !profesor_id || !dia_semana || !hora_inicio || !hora_fin) {
            showToast('Por favor complete todos los campos requeridos', 'warning');
            return;
        }

        try {
            showLoading();
            const body = {
                materia_id: parseInt(materia_id),
                profesor_id: parseInt(profesor_id),
                dia_semana: parseInt(dia_semana),
                hora_inicio, hora_fin, aula, periodo
            };

            if (id) {
                body.id = parseInt(id);
                await apiCall('PUT', '/admin/horarios', body);
                showToast('Horario actualizado exitosamente', 'success');
            } else {
                await apiCall('POST', '/admin/horarios', body);
                showToast('Horario creado exitosamente', 'success');
            }

            closeModal();
            this.loadHorarios(this.currentPages.horarios);
        } catch (error) {
            console.error('Error al guardar horario:', error);
            showToast(error.message || 'Error al guardar el horario', 'error');
        } finally {
            hideLoading();
        }
    },

    deleteHorario(id) {
        showConfirm('¿Está seguro de que desea eliminar este horario?', async () => {
            try {
                showLoading();
                await apiCall('DELETE', `/admin/horarios?id=${id}`);
                showToast('Horario eliminado exitosamente', 'success');
                this.loadHorarios(this.currentPages.horarios);
            } catch (error) {
                console.error('Error al eliminar horario:', error);
                showToast(error.message || 'Error al eliminar el horario', 'error');
            } finally {
                hideLoading();
            }
        });
    },

    // ============================================
    // ASIGNACIONES
    // ============================================
    async loadAsignaciones() {
        const select = document.getElementById('selectHorario');
        if (!select) return;

        try {
            const data = await apiCall('GET', '/admin/horarios?limit=100');
            this.horariosData = data.horarios || data.schedules || [];

            select.innerHTML = '<option value="">-- Seleccione un horario --</option>';
            this.horariosData.forEach(h => {
                select.innerHTML += `<option value="${h.id}">${escapeHtml(h.materia_nombre || h.materia || 'Sin materia')} - ${getDayName(h.dia_semana || h.dia)} ${formatTimeString(h.hora_inicio)}-${formatTimeString(h.hora_fin)}</option>`;
            });
        } catch (error) {
            console.error('Error al cargar asignaciones:', error);
            showToast('Error al cargar los horarios para asignaciones', 'error');
        }
    },

    async loadAsignacionEstudiantes() {
        const horarioId = document.getElementById('selectHorario')?.value;
        const container = document.getElementById('asignacionEstudiantesContainer');
        const list = document.getElementById('asignacionEstudiantesList');

        if (!horarioId) {
            if (container) container.style.display = 'none';
            return;
        }

        if (container) container.style.display = 'block';
        if (list) list.innerHTML = '<div class="spinner" style="margin:1rem auto;"></div>';

        try {
            // Cargar todos los estudiantes
            const estRes = await apiCall('GET', '/admin/estudiantes?limit=1000');
            const estudiantes = estRes.students || [];

            // Cargar estudiantes asignados al horario
            const asigRes = await apiCall('GET', `/admin/asignaciones?horario_id=${horarioId}`);
            const asignados = asigRes.estudiantes || asigRes.asignaciones || [];
            const asignadosIds = new Set(asignados.map(a => a.estudiante_id || a.id));

            if (estudiantes.length === 0) {
                list.innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:1rem;">No hay estudiantes disponibles</p>';
                return;
            }

            list.innerHTML = estudiantes.map(e => `
                <label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;border:1px solid var(--gray-200);border-radius:0.375rem;cursor:pointer;">
                    <input type="checkbox" class="asignacion-checkbox" value="${e.id}" ${asignadosIds.has(e.id) ? 'checked' : ''}>
                    <span>${escapeHtml(e.nombre)} ${escapeHtml(e.apellido)}</span>
                    <span style="font-size:0.75rem;color:var(--gray-500);margin-left:auto;">${e.grado}° "${e.seccion}"</span>
                </label>
            `).join('');
        } catch (error) {
            console.error('Error al cargar estudiantes para asignación:', error);
            list.innerHTML = '<p style="color:var(--red-500);text-align:center;padding:1rem;">Error al cargar los estudiantes</p>';
            showToast('Error al cargar los estudiantes para asignación', 'error');
        }
    },

    async saveAsignaciones() {
        const horarioId = document.getElementById('selectHorario')?.value;
        if (!horarioId) {
            showToast('Seleccione un horario primero', 'warning');
            return;
        }

        const checkboxes = document.querySelectorAll('.asignacion-checkbox:checked');
        const estudianteIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

        try {
            showLoading();
            await apiCall('POST', '/admin/asignaciones', {
                horario_id: parseInt(horarioId),
                estudiante_ids: estudianteIds
            });
            showToast('Asignaciones guardadas exitosamente', 'success');
        } catch (error) {
            console.error('Error al guardar asignaciones:', error);
            showToast(error.message || 'Error al guardar las asignaciones', 'error');
        } finally {
            hideLoading();
        }
    },

    // ============================================
    // SECCIONES
    // ============================================
    async loadSecciones() {
        const view = document.getElementById('view-secciones');
        if (!view) return;

        view.innerHTML = `
            <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3>Secciones</h3>
                <button class="btn btn-primary" onclick="adminApp.showSeccionModal()">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nueva Sección
                </button>
            </div>
            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Grado</th>
                                <th>Sección</th>
                                <th>Total Estudiantes</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="seccionesTableBody">
                            <tr><td colspan="4" class="table-empty"><div class="spinner"></div> Cargando secciones...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        try {
            const data = await apiCall('GET', '/admin/estudiantes?limit=10000');
            const estudiantes = data.students || [];

            // Agrupar por grado y sección
            const seccionesMap = {};
            estudiantes.forEach(e => {
                if (e.grado && e.seccion) {
                    const key = `${e.grado}-${e.seccion}`;
                    if (!seccionesMap[key]) {
                        seccionesMap[key] = { grado: e.grado, seccion: e.seccion, total: 0 };
                    }
                    seccionesMap[key].total++;
                }
            });
            this.seccionesData = Object.values(seccionesMap).sort((a, b) => a.grado - b.grado || a.seccion.localeCompare(b.seccion));

            const tbody = document.getElementById('seccionesTableBody');
            if (this.seccionesData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No hay secciones registradas</td></tr>';
                return;
            }

            tbody.innerHTML = this.seccionesData.map(s => `
                <tr>
                    <td>${s.grado}° Grado</td>
                    <td><span class="badge badge-info">Sección "${escapeHtml(s.seccion)}"</span></td>
                    <td>${s.total} estudiantes</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-outline btn-sm" onclick="adminApp.showSeccionModal('${s.grado}-${s.seccion}')" title="Editar">✏️</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error al cargar secciones:', error);
            showToast('Error al cargar las secciones', 'error');
        }
    },

    showSeccionModal(id = null) {
        const isEdit = id !== null;
        const seccion = isEdit ? this.seccionesData.find(s => `${s.grado}-${s.seccion}` === id) : null;

        const content = `
            <form id="seccionForm" onsubmit="event.preventDefault(); adminApp.saveSeccion();">
                <div class="form-row">
                    <div class="form-group">
                        <label for="seccionGrado">Grado *</label>
                        <select class="form-control" id="seccionGrado" required>
                            <option value="">Seleccione</option>
                            ${[1,2,3,4,5,6].map(g => `<option value="${g}" ${isEdit && seccion?.grado == g ? 'selected' : ''}>${g}° Grado</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="seccionLetra">Sección *</label>
                        <select class="form-control" id="seccionLetra" required>
                            <option value="">Seleccione</option>
                            ${['A','B','C','D','E'].map(s => `<option value="${s}" ${isEdit && seccion?.seccion === s ? 'selected' : ''}>Sección "${s}"</option>`).join('')}
                        </select>
                    </div>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="adminApp.saveSeccion()">Guardar Sección</button>
        `;

        showModal(isEdit ? 'Editar Sección' : 'Nueva Sección', content, footer);
    },

    async saveSeccion() {
        const grado = document.getElementById('seccionGrado')?.value;
        const seccion = document.getElementById('seccionLetra')?.value;

        if (!grado || !seccion) {
            showToast('Por favor complete todos los campos', 'warning');
            return;
        }

        showToast('Sección registrada exitosamente', 'success');
        closeModal();
        this.loadSecciones();
    },

    // ============================================
    // LAPSOs
    // ============================================
    async loadLapsos() {
        const view = document.getElementById('view-lapsos');
        if (!view) return;

        view.innerHTML = `
            <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3>Lapsos Académicos</h3>
                <button class="btn btn-primary" onclick="adminApp.showLapsoModal()">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nuevo Lapso
                </button>
            </div>
            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Fecha Inicio</th>
                                <th>Fecha Fin</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="lapsosTableBody">
                            <tr><td colspan="5" class="table-empty"><div class="spinner"></div> Cargando lapsos...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        try {
            const data = await apiCall('GET', '/admin/lapsos');
            this.lapsosData = data.lapsos || [];

            const tbody = document.getElementById('lapsosTableBody');
            if (this.lapsosData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No hay lapsos registrados</td></tr>';
                return;
            }

            tbody.innerHTML = this.lapsosData.map(l => {
                const estado = l.activo !== false ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-secondary">Inactivo</span>';
                return `
                    <tr>
                        <td><strong>${escapeHtml(l.nombre)}</strong></td>
                        <td>${formatDateString(l.fecha_inicio)}</td>
                        <td>${formatDateString(l.fecha_fin)}</td>
                        <td>${estado}</td>
                        <td>
                            <div class="table-actions">
                                <button class="btn btn-outline btn-sm" onclick="adminApp.showLapsoModal(${l.id})" title="Editar">✏️</button>
                                <button class="btn btn-danger btn-sm" onclick="adminApp.deleteLapso(${l.id})" title="Eliminar">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error al cargar lapsos:', error);
            const tbody = document.getElementById('lapsosTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Error al cargar los lapsos</td></tr>';
            showToast('Error al cargar los lapsos académicos', 'error');
        }
    },

    showLapsoModal(id = null) {
        const isEdit = id !== null;
        const lapso = isEdit ? this.lapsosData.find(l => l.id === id) : null;

        const content = `
            <form id="lapsoForm" onsubmit="event.preventDefault(); adminApp.saveLapso();">
                <input type="hidden" id="lapsoId" value="${isEdit ? lapso.id : ''}">
                <div class="form-group">
                    <label for="lapsoNombre">Nombre del Lapso *</label>
                    <input type="text" class="form-control" id="lapsoNombre" value="${isEdit ? escapeHtml(lapso.nombre) : ''}" required placeholder="Ej: Primer Lapso">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="lapsoFechaInicio">Fecha de Inicio *</label>
                        <input type="date" class="form-control" id="lapsoFechaInicio" value="${isEdit && lapso.fecha_inicio ? lapso.fecha_inicio.split('T')[0] : ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="lapsoFechaFin">Fecha de Fin *</label>
                        <input type="date" class="form-control" id="lapsoFechaFin" value="${isEdit && lapso.fecha_fin ? lapso.fecha_fin.split('T')[0] : ''}" required>
                    </div>
                </div>
                <div class="form-group">
                    <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
                        <input type="checkbox" id="lapsoActivo" ${isEdit ? (lapso.activo !== false ? 'checked' : '') : 'checked'}>
                        Lapso activo
                    </label>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="adminApp.saveLapso()">
                ${isEdit ? 'Actualizar Lapso' : 'Crear Lapso'}
            </button>
        `;

        showModal(isEdit ? 'Editar Lapso' : 'Nuevo Lapso', content, footer);
    },

    async saveLapso() {
        const id = document.getElementById('lapsoId')?.value;
        const nombre = document.getElementById('lapsoNombre')?.value.trim();
        const fecha_inicio = document.getElementById('lapsoFechaInicio')?.value;
        const fecha_fin = document.getElementById('lapsoFechaFin')?.value;
        const activo = document.getElementById('lapsoActivo')?.checked;

        if (!nombre || !fecha_inicio || !fecha_fin) {
            showToast('Por favor complete todos los campos requeridos', 'warning');
            return;
        }

        try {
            showLoading();
            const body = { nombre, fecha_inicio, fecha_fin, activo };

            if (id) {
                body.id = parseInt(id);
                await apiCall('PUT', '/admin/lapsos', body);
                showToast('Lapso actualizado exitosamente', 'success');
            } else {
                await apiCall('POST', '/admin/lapsos', body);
                showToast('Lapso creado exitosamente', 'success');
            }

            closeModal();
            this.loadLapsos();
        } catch (error) {
            console.error('Error al guardar lapso:', error);
            showToast(error.message || 'Error al guardar el lapso', 'error');
        } finally {
            hideLoading();
        }
    },

    deleteLapso(id) {
        showConfirm('¿Está seguro de que desea eliminar este lapso? Se eliminarán las notas asociadas.', async () => {
            try {
                showLoading();
                await apiCall('DELETE', `/admin/lapsos?id=${id}`);
                showToast('Lapso eliminado exitosamente', 'success');
                this.loadLapsos();
            } catch (error) {
                console.error('Error al eliminar lapso:', error);
                showToast(error.message || 'Error al eliminar el lapso', 'error');
            } finally {
                hideLoading();
            }
        });
    },

    // ============================================
    // CERTIFICADOS / CONSTANCIAS
    // ============================================
    async loadCertificados(page = 1) {
        this.currentPages.certificados = page;
        const view = document.getElementById('view-certificados');
        if (!view) return;

        view.innerHTML = `
            <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3>Solicitudes de Constancias</h3>
            </div>
            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Estudiante</th>
                                <th>Tipo</th>
                                <th>Fecha Solicitud</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="certificadosTableBody">
                            <tr><td colspan="5" class="table-empty"><div class="spinner"></div> Cargando constancias...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="certificadosPagination"></div>
            </div>
        `;

        try {
            const data = await apiCall('GET', `/admin/certificados?page=${page}&limit=${this.itemsPerPage}`);
            this.certificadosData = data.certificados || data.constancias || [];

            const tbody = document.getElementById('certificadosTableBody');
            if (this.certificadosData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No hay solicitudes de constancias</td></tr>';
                return;
            }

            const estadosMap = {
                pendiente: '<span class="badge badge-warning">Pendiente</span>',
                aprobada: '<span class="badge badge-success">Aprobada</span>',
                rechazada: '<span class="badge badge-danger">Rechazada</span>'
            };

            tbody.innerHTML = this.certificadosData.map(c => `
                <tr>
                    <td>${escapeHtml(c.estudiante_nombre || c.nombre_estudiante || '-')}</td>
                    <td>${escapeHtml(c.tipo || 'Constancia')}</td>
                    <td>${formatDateString(c.fecha_solicitud || c.created_at)}</td>
                    <td>${estadosMap[c.estado] || c.estado}</td>
                    <td>
                        <div class="table-actions">
                            ${c.estado === 'pendiente' ? `
                                <button class="btn btn-success btn-sm" onclick="adminApp.aprobarCertificado(${c.id})" title="Aprobar">✅</button>
                                <button class="btn btn-danger btn-sm" onclick="adminApp.rechazarCertificado(${c.id})" title="Rechazar">❌</button>
                            ` : `
                                <span style="font-size:0.8125rem;color:var(--gray-500);">Procesada</span>
                            `}
                        </div>
                    </td>
                </tr>
            `).join('');

            const totalItems = data.pagination?.total || this.certificadosData.length;
            const paginationHtml = renderPagination(totalItems, page, this.itemsPerPage, 'adminApp.loadCertificados');
            document.getElementById('certificadosPagination').innerHTML = paginationHtml;

        } catch (error) {
            console.error('Error al cargar certificados:', error);
            const tbody = document.getElementById('certificadosTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Error al cargar las constancias</td></tr>';
            showToast('Error al cargar las solicitudes de constancias', 'error');
        }
    },

    aprobarCertificado(id) {
        const content = `
            <form id="aprobarCertForm">
                <div class="form-group">
                    <label for="certReferencia">Número de Referencia</label>
                    <input type="text" class="form-control" id="certReferencia" placeholder="Ej: REF-2024-001">
                </div>
                <div class="form-group">
                    <label for="certObservaciones">Observaciones</label>
                    <textarea class="form-control" id="certObservaciones" rows="3" placeholder="Observaciones adicionales (opcional)"></textarea>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-success" onclick="adminApp.confirmarAprobacion(${id})">Aprobar Constancia</button>
        `;

        showModal('Aprobar Constancia', content, footer);
    },

    async confirmarAprobacion(id) {
        const referencia = document.getElementById('certReferencia')?.value.trim();
        const observaciones = document.getElementById('certObservaciones')?.value.trim();

        try {
            showLoading();
            await apiCall('POST', '/admin/certificados', {
                id,
                estado: 'aprobada',
                referencia,
                observaciones
            });
            showToast('Constancia aprobada exitosamente', 'success');
            closeModal();
            this.loadCertificados(this.currentPages.certificados);
        } catch (error) {
            console.error('Error al aprobar constancia:', error);
            showToast(error.message || 'Error al aprobar la constancia', 'error');
        } finally {
            hideLoading();
        }
    },

    rechazarCertificado(id) {
        const content = `
            <form id="rechazarCertForm">
                <div class="form-group">
                    <label for="certMotivoRechazo">Motivo del Rechazo *</label>
                    <textarea class="form-control" id="certMotivoRechazo" rows="3" required placeholder="Indique el motivo del rechazo"></textarea>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="adminApp.confirmarRechazo(${id})">Rechazar Constancia</button>
        `;

        showModal('Rechazar Constancia', content, footer);
    },

    async confirmarRechazo(id) {
        const motivo = document.getElementById('certMotivoRechazo')?.value.trim();

        if (!motivo) {
            showToast('Debe indicar el motivo del rechazo', 'warning');
            return;
        }

        try {
            showLoading();
            await apiCall('POST', '/admin/certificados', {
                id,
                estado: 'rechazada',
                observaciones: motivo
            });
            showToast('Constancia rechazada', 'info');
            closeModal();
            this.loadCertificados(this.currentPages.certificados);
        } catch (error) {
            console.error('Error al rechazar constancia:', error);
            showToast(error.message || 'Error al rechazar la constancia', 'error');
        } finally {
            hideLoading();
        }
    },

    // ============================================
    // ESTADÍSTICAS
    // ============================================
    async loadEstadisticas() {
        const view = document.getElementById('view-estadisticas');
        if (!view) return;

        const hoy = new Date().toISOString().split('T')[0];

        view.innerHTML = `
            <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3>Estadísticas de Asistencia</h3>
                <div class="flex gap-2 flex-wrap">
                    <select class="form-control" id="statPeriodo" style="width:auto;" onchange="adminApp.aplicarFiltrosEstadisticas()">
                        <option value="hoy">Hoy</option>
                        <option value="semana">Esta Semana</option>
                        <option value="quincena">Últimos 15 Días</option>
                        <option value="mes">Este Mes</option>
                        <option value="anio">Este Año</option>
                        <option value="personalizado">Personalizado</option>
                    </select>
                    <select class="form-control" id="statSeccion" style="width:auto;" onchange="adminApp.aplicarFiltrosEstadisticas()">
                        <option value="">Todas las Secciones</option>
                    </select>
                    <div id="fechasPersonalizadas" style="display:none;" class="flex gap-2">
                        <input type="date" class="form-control" id="statFechaInicio" value="${hoy}" style="width:auto;">
                        <input type="date" class="form-control" id="statFechaFin" value="${hoy}" style="width:auto;">
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="adminApp.aplicarFiltrosEstadisticas()">Aplicar</button>
                </div>
            </div>

            <div class="stats-grid" id="estadisticasCards">
                <div class="stat-card">
                    <div class="stat-icon blue"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg></div>
                    <div class="stat-info">
                        <div class="stat-value" id="estTotalEstudiantes">0</div>
                        <div class="stat-label">Total Estudiantes</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon green"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                    <div class="stat-info">
                        <div class="stat-value" id="estPresentes">0</div>
                        <div class="stat-label">Presentes</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon red"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
                    <div class="stat-info">
                        <div class="stat-value" id="estAusentes">0</div>
                        <div class="stat-label">Ausentes</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon yellow"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                    <div class="stat-info">
                        <div class="stat-value" id="estTardanzas">0</div>
                        <div class="stat-label">Tardanzas</div>
                    </div>
                </div>
            </div>

            <div class="card mt-4">
                <div class="card-header">
                    <h3>Resumen por Sección</h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Sección</th>
                                <th>Presentes</th>
                                <th>Ausentes</th>
                                <th>Tardanzas</th>
                                <th>% Asistencia</th>
                            </tr>
                        </thead>
                        <tbody id="estSeccionesTableBody">
                            <tr><td colspan="5" class="table-empty">Cargando estadísticas...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Cargar secciones para el filtro
        try {
            const estRes = await apiCall('GET', '/admin/estudiantes?limit=1000');
            const estudiantes = estRes.students || [];
            const secciones = new Set();
            estudiantes.forEach(e => {
                if (e.grado && e.seccion) secciones.add(`${e.grado}° "${e.seccion}"`);
            });
            const selectSeccion = document.getElementById('statSeccion');
            if (selectSeccion) {
                secciones.forEach(s => {
                    selectSeccion.innerHTML += `<option value="${s}">${s}</option>`;
                });
            }
        } catch (e) { /* ignorar */ }

        // Evento para mostrar/ocultar fechas personalizadas
        const periodoSelect = document.getElementById('statPeriodo');
        if (periodoSelect) {
            periodoSelect.addEventListener('change', () => {
                const personalizado = document.getElementById('fechasPersonalizadas');
                if (personalizado) {
                    personalizado.style.display = periodoSelect.value === 'personalizado' ? 'flex' : 'none';
                }
            });
        }

        this.aplicarFiltrosEstadisticas();
    },

    async aplicarFiltrosEstadisticas() {
        const periodo = document.getElementById('statPeriodo')?.value || 'hoy';
        const seccion = document.getElementById('statSeccion')?.value || '';

        // Calcular fechas según el período
        const hoy = new Date();
        let fechaInicio, fechaFin;

        switch (periodo) {
            case 'hoy':
                fechaInicio = fechaFin = hoy.toISOString().split('T')[0];
                break;
            case 'semana': {
                const diaSemana = hoy.getDay();
                const lunes = new Date(hoy);
                lunes.setDate(hoy.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
                fechaInicio = lunes.toISOString().split('T')[0];
                fechaFin = hoy.toISOString().split('T')[0];
                break;
            }
            case 'quincena':
                fechaInicio = new Date(hoy.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                fechaFin = hoy.toISOString().split('T')[0];
                break;
            case 'mes':
                fechaInicio = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
                fechaFin = hoy.toISOString().split('T')[0];
                break;
            case 'anio':
                fechaInicio = `${hoy.getFullYear()}-01-01`;
                fechaFin = hoy.toISOString().split('T')[0];
                break;
            case 'personalizado':
                fechaInicio = document.getElementById('statFechaInicio')?.value || hoy.toISOString().split('T')[0];
                fechaFin = document.getElementById('statFechaFin')?.value || hoy.toISOString().split('T')[0];
                break;
        }

        this.fetchEstadisticas(fecha_inicio, fecha_fin);
    },

    async fetchEstadisticas(fechaInicio, fechaFin) {
        try {
            const data = await apiCall('GET', `/admin/estadisticas?action=asistencia&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`);
            const stats = data.estadisticas || data.resumen || {};

            document.getElementById('estTotalEstudiantes').textContent = stats.total_estudiantes || 0;
            document.getElementById('estPresentes').textContent = stats.total_presentes || 0;
            document.getElementById('estAusentes').textContent = stats.total_ausentes || 0;
            document.getElementById('estTardanzas').textContent = stats.total_tardanzas || 0;

            // Tabla por secciones
            const tbody = document.getElementById('estSeccionesTableBody');
            const secciones = stats.por_seccion || [];

            if (secciones.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No hay datos disponibles</td></tr>';
                return;
            }

            tbody.innerHTML = secciones.map(s => {
                const total = (s.presentes || 0) + (s.ausentes || 0) + (s.tardanzas || 0);
                const pct = total > 0 ? ((s.presentes || 0) / total * 100).toFixed(1) : '0.0';
                return `
                    <tr>
                        <td>${escapeHtml(s.seccion || s.nombre)}</td>
                        <td style="color:var(--green-600);font-weight:600;">${s.presentes || 0}</td>
                        <td style="color:var(--red-600);font-weight:600;">${s.ausentes || 0}</td>
                        <td style="color:var(--yellow-600);font-weight:600;">${s.tardanzas || 0}</td>
                        <td><strong>${pct}%</strong></td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error al cargar estadísticas:', error);
            showToast('Error al cargar las estadísticas de asistencia', 'error');
        }
    },

    async loadEstadisticasProfesores() {
        try {
            const data = await apiCall('GET', '/admin/estadisticas?action=profesores');
            return data.profesores || data.estadisticas || [];
        } catch (error) {
            console.error('Error al cargar estadísticas de profesores:', error);
            showToast('Error al cargar las estadísticas de profesores', 'error');
            return [];
        }
    },

    async loadInasistencias() {
        const view = document.getElementById('view-estadisticas');
        if (!view) return;

        try {
            const data = await apiCall('GET', '/admin/estadisticas?action=inasistencias');
            const inasistencias = data.inasistencias || data.registros || [];
            return inasistencias;
        } catch (error) {
            console.error('Error al cargar inasistencias:', error);
            showToast('Error al cargar el reporte de inasistencias', 'error');
            return [];
        }
    },

    async loadUsuariosActivos() {
        try {
            const data = await apiCall('GET', '/admin/estadisticas?action=usuarios_dia');
            return data.usuarios || data.registros || [];
        } catch (error) {
            console.error('Error al cargar usuarios activos:', error);
            showToast('Error al cargar los usuarios activos', 'error');
            return [];
        }
    },

    // ============================================
    // CONFIGURACIÓN
    // ============================================
    async loadConfig() {
        const view = document.getElementById('view-config');
        if (!view) return;

        view.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Configuración de la Institución</h3>
                </div>
                <div class="card-body">
                    <form id="configForm" onsubmit="event.preventDefault(); adminApp.saveConfig();">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="configNombre">Nombre de la Institución *</label>
                                <input type="text" class="form-control" id="configNombre" placeholder="Ej: Escuela Básica Nacional">
                            </div>
                            <div class="form-group">
                                <label for="configCodigo">Código de la Institución</label>
                                <input type="text" class="form-control" id="configCodigo" placeholder="Ej: EBN-001">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="configDireccion">Dirección</label>
                                <textarea class="form-control" id="configDireccion" rows="2" placeholder="Dirección de la institución"></textarea>
                            </div>
                            <div class="form-group">
                                <label for="configTelefono">Teléfono</label>
                                <input type="text" class="form-control" id="configTelefono" placeholder="Ej: 0212-1234567">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="configEmail">Correo Electrónico</label>
                                <input type="email" class="form-control" id="configEmail" placeholder="correo@institucion.edu">
                            </div>
                            <div class="form-group">
                                <label for="configAnioEscolar">Año Escolar</label>
                                <input type="text" class="form-control" id="configAnioEscolar" placeholder="Ej: 2024-2025">
                            </div>
                        </div>
                        <h4 style="margin-top:1.5rem;margin-bottom:1rem;color:var(--gray-700);">Ubicación (Coordenadas del Mapa)</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="configLatitud">Latitud</label>
                                <input type="number" step="any" class="form-control" id="configLatitud" placeholder="Ej: 10.4806">
                            </div>
                            <div class="form-group">
                                <label for="configLongitud">Longitud</label>
                                <input type="number" step="any" class="form-control" id="configLongitud" placeholder="Ej: -66.9036">
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="configRadioPermitido">Radio Permitido (metros)</label>
                            <input type="number" class="form-control" id="configRadioPermitido" placeholder="Ej: 200" min="10" max="5000">
                            <small style="color:var(--gray-500);">Distancia máxima permitida para registrar asistencia</small>
                        </div>
                        <div class="form-group" style="margin-top:1.5rem;">
                            <button type="submit" class="btn btn-primary">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                Guardar Configuración
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Cargar configuración actual
        try {
            const data = await apiCall('GET', '/admin/config');
            this.configData = data.config || data.configuracion || {};

            if (this.configData) {
                const c = this.configData;
                const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
                setVal('configNombre', c.nombre);
                setVal('configCodigo', c.codigo);
                setVal('configDireccion', c.direccion);
                setVal('configTelefono', c.telefono);
                setVal('configEmail', c.email);
                setVal('configAnioEscolar', c.anio_escolar);
                setVal('configLatitud', c.latitud);
                setVal('configLongitud', c.longitud);
                setVal('configRadioPermitido', c.radio_permitido);
            }
        } catch (error) {
            console.warn('No se pudo cargar la configuración:', error);
        }
    },

    async saveConfig() {
        const config = {
            nombre: document.getElementById('configNombre')?.value.trim(),
            codigo: document.getElementById('configCodigo')?.value.trim(),
            direccion: document.getElementById('configDireccion')?.value.trim(),
            telefono: document.getElementById('configTelefono')?.value.trim(),
            email: document.getElementById('configEmail')?.value.trim(),
            anio_escolar: document.getElementById('configAnioEscolar')?.value.trim(),
            latitud: parseFloat(document.getElementById('configLatitud')?.value) || null,
            longitud: parseFloat(document.getElementById('configLongitud')?.value) || null,
            radio_permitido: parseInt(document.getElementById('configRadioPermitido')?.value) || 200
        };

        try {
            showLoading();
            await apiCall('POST', '/admin/config', config);
            showToast('Configuración guardada exitosamente', 'success');
        } catch (error) {
            console.error('Error al guardar configuración:', error);
            showToast(error.message || 'Error al guardar la configuración', 'error');
        } finally {
            hideLoading();
        }
    },

    // ============================================
    // NOTAS (ADMIN)
    // ============================================
    async loadNotasAdmin() {
        const view = document.getElementById('view-notas');
        if (!view) return;

        view.innerHTML = `
            <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3>Registro de Notas</h3>
                <div class="flex gap-2 flex-wrap">
                    <select class="form-control" id="notasLapso" style="width:auto;" onchange="adminApp.filtrarNotas()">
                        <option value="">Todos los Lapsos</option>
                    </select>
                    <select class="form-control" id="notasMateria" style="width:auto;" onchange="adminApp.filtrarNotas()">
                        <option value="">Todas las Materias</option>
                    </select>
                </div>
            </div>
            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Estudiante</th>
                                <th>Materia</th>
                                <th>Lapso</th>
                                <th>Evaluación</th>
                                <th>Nota</th>
                                <th>Fecha</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="notasTableBody">
                            <tr><td colspan="7" class="table-empty"><div class="spinner"></div> Cargando notas...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="notasPagination"></div>
            </div>
        `;

        try {
            // Cargar lapsos para el filtro
            try {
                const lapsosRes = await apiCall('GET', '/admin/lapsos');
                const lapsos = lapsosRes.lapsos || [];
                const selectLapso = document.getElementById('notasLapso');
                if (selectLapso) {
                    lapsos.forEach(l => {
                        selectLapso.innerHTML += `<option value="${l.id}">${escapeHtml(l.nombre)}</option>`;
                    });
                }
            } catch (e) { /* ignorar */ }

            // Cargar notas
            const data = await apiCall('GET', '/admin/notas');
            this.notasData = data.notas || data.calificaciones || [];

            this.renderNotasTable();
        } catch (error) {
            console.error('Error al cargar notas:', error);
            const tbody = document.getElementById('notasTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Error al cargar las notas</td></tr>';
            showToast('Error al cargar las notas', 'error');
        }
    },

    renderNotasTable() {
        const tbody = document.getElementById('notasTableBody');
        if (!tbody) return;

        if (this.notasData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No hay notas registradas</td></tr>';
            return;
        }

        tbody.innerHTML = this.notasData.map(n => {
            const notaValor = n.nota || n.calificacion || '-';
            const notaColor = typeof notaValor === 'number' ? (notaValor >= 10 ? 'var(--green-600)' : 'var(--red-600)') : '';

            return `
                <tr>
                    <td>${escapeHtml(n.estudiante_nombre || n.nombre_estudiante || '-')}</td>
                    <td>${escapeHtml(n.materia_nombre || n.materia || '-')}</td>
                    <td>${escapeHtml(n.lapso_nombre || n.lapso || '-')}</td>
                    <td>${escapeHtml(n.evaluacion_nombre || n.evaluacion || '-')}</td>
                    <td style="font-weight:700;color:${notaColor};">${notaValor}</td>
                    <td>${formatDateString(n.fecha || n.created_at)}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-outline btn-sm" onclick="adminApp.editarNota(${n.id})" title="Editar">✏️</button>
                            <button class="btn btn-danger btn-sm" onclick="adminApp.eliminarNota(${n.id})" title="Eliminar">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    editarNota(id) {
        const nota = this.notasData.find(n => n.id === id);
        if (!nota) return;

        const content = `
            <form id="editNotaForm">
                <input type="hidden" id="editNotaId" value="${nota.id}">
                <div class="form-group">
                    <label>Estudiante</label>
                    <input type="text" class="form-control" value="${escapeHtml(nota.estudiante_nombre || nota.nombre_estudiante || '')}" disabled>
                </div>
                <div class="form-group">
                    <label>Evaluación</label>
                    <input type="text" class="form-control" value="${escapeHtml(nota.evaluacion_nombre || nota.evaluacion || '')}" disabled>
                </div>
                <div class="form-group">
                    <label for="editNotaValor">Nota *</label>
                    <input type="number" class="form-control" id="editNotaValor" value="${nota.nota || nota.calificacion || ''}" min="0" max="20" step="0.01" required placeholder="Nota (0-20)">
                </div>
                <div class="form-group">
                    <label for="editNotaObservacion">Observación</label>
                    <textarea class="form-control" id="editNotaObservacion" rows="2" placeholder="Observación (opcional)">${escapeHtml(nota.observacion || '')}</textarea>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="adminApp.guardarNotaEditada()">Guardar</button>
        `;

        showModal('Editar Nota', content, footer);
    },

    async guardarNotaEditada() {
        const id = document.getElementById('editNotaId')?.value;
        const nota = document.getElementById('editNotaValor')?.value;
        const observacion = document.getElementById('editNotaObservacion')?.value.trim();

        if (!nota) {
            showToast('La nota es requerida', 'warning');
            return;
        }

        try {
            showLoading();
            await apiCall('PUT', '/admin/notas', {
                id: parseInt(id),
                nota: parseFloat(nota),
                observacion
            });
            showToast('Nota actualizada exitosamente', 'success');
            closeModal();
            this.loadNotasAdmin();
        } catch (error) {
            console.error('Error al actualizar nota:', error);
            showToast(error.message || 'Error al actualizar la nota', 'error');
        } finally {
            hideLoading();
        }
    },

    eliminarNota(id) {
        showConfirm('¿Está seguro de que desea eliminar esta nota?', async () => {
            try {
                showLoading();
                await apiCall('DELETE', `/admin/notas?id=${id}`);
                showToast('Nota eliminada exitosamente', 'success');
                this.loadNotasAdmin();
            } catch (error) {
                console.error('Error al eliminar nota:', error);
                showToast(error.message || 'Error al eliminar la nota', 'error');
            } finally {
                hideLoading();
            }
        });
    },

    async filtrarNotas() {
        const lapsoId = document.getElementById('notasLapso')?.value;
        const materiaId = document.getElementById('notasMateria')?.value;

        try {
            let url = '/admin/notas?';
            if (lapsoId) url += `lapso_id=${lapsoId}&`;
            if (materiaId) url += `materia_id=${materiaId}&`;

            const data = await apiCall('GET', url);
            this.notasData = data.notas || data.calificaciones || [];
            this.renderNotasTable();
        } catch (error) {
            console.error('Error al filtrar notas:', error);
            showToast('Error al filtrar las notas', 'error');
        }
    }
};

// ============================================
// NAVEGACIÓN - Cargar datos al cambiar vista
// ============================================
const _originalNavigateToAdmin = navigateTo;
window.navigateTo = function(view) {
    _originalNavigateToAdmin(view);

    switch (view) {
        case 'dashboard':
            adminApp.loadDashboard();
            break;
        case 'usuarios':
            adminApp.loadUsuarios(adminApp.currentPages.usuarios);
            break;
        case 'estudiantes':
            adminApp.loadEstudiantes(adminApp.currentPages.estudiantes);
            break;
        case 'materias':
            adminApp.loadMaterias(adminApp.currentPages.materias);
            break;
        case 'horarios':
            adminApp.loadHorarios(adminApp.currentPages.horarios);
            break;
        case 'asignaciones':
            adminApp.loadAsignaciones();
            break;
        case 'secciones':
            adminApp.loadSecciones();
            break;
        case 'lapsos':
            adminApp.loadLapsos();
            break;
        case 'certificados':
            adminApp.loadCertificados(adminApp.currentPages.certificados);
            break;
        case 'estadisticas':
            adminApp.loadEstadisticas();
            break;
        case 'config':
            adminApp.loadConfig();
            break;
        case 'notas':
            adminApp.loadNotasAdmin();
            break;
    }
};
