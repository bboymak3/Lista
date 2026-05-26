-- Tabla de Estudiantes
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_unico TEXT UNIQUE NOT NULL,
  cedula_escolar TEXT UNIQUE,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  fecha_nacimiento TEXT,
  genero TEXT CHECK(genero IN ('M', 'F', 'O')),
  grado TEXT NOT NULL,
  seccion TEXT NOT NULL,
  turno TEXT,
  direccion TEXT,
  telefono_emergencia TEXT,
  foto_key TEXT,
  qr_code TEXT UNIQUE NOT NULL,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Relación Representante-Estudiante
CREATE TABLE IF NOT EXISTS parent_student (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  representante_id INTEGER NOT NULL,
  estudiante_id INTEGER NOT NULL,
  parentesco TEXT NOT NULL CHECK(parentesco IN ('madre', 'padre', 'tutor', 'otro')),
  es_principal INTEGER DEFAULT 0,
  FOREIGN KEY (representante_id) REFERENCES users(id),
  FOREIGN KEY (estudiante_id) REFERENCES students(id),
  UNIQUE(representante_id, estudiante_id)
);

-- Tabla de Materias
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  codigo TEXT UNIQUE NOT NULL,
  descripcion TEXT,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Secciones
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  grado TEXT NOT NULL,
  turno TEXT CHECK(turno IN ('manana', 'tarde', 'nocturno')),
  periodo_escolar TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Horarios
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  materia_id INTEGER NOT NULL,
  profesor_id INTEGER NOT NULL,
  seccion_id INTEGER,
  dia_semana INTEGER NOT NULL CHECK(dia_semana BETWEEN 1 AND 7),
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  aula TEXT,
  periodo_escolar TEXT NOT NULL,
  qr_code TEXT,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (materia_id) REFERENCES subjects(id),
  FOREIGN KEY (profesor_id) REFERENCES users(id),
  FOREIGN KEY (seccion_id) REFERENCES sections(id)
);

-- Tabla de Estudiantes en Horarios
CREATE TABLE IF NOT EXISTS schedule_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  horario_id INTEGER NOT NULL,
  estudiante_id INTEGER NOT NULL,
  fecha_asignacion TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (horario_id) REFERENCES schedules(id),
  FOREIGN KEY (estudiante_id) REFERENCES students(id),
  UNIQUE(horario_id, estudiante_id)
);

-- Tabla de Sesiones de Asistencia
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  horario_id INTEGER NOT NULL,
  profesor_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT,
  estado TEXT DEFAULT 'en_curso' CHECK(estado IN ('en_curso', 'finalizada', 'cancelada')),
  qr_code TEXT,
  latitud REAL,
  longitud REAL,
  observaciones TEXT,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (horario_id) REFERENCES schedules(id),
  FOREIGN KEY (profesor_id) REFERENCES users(id)
);

-- Tabla de Registros de Asistencia
CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL,
  estudiante_id INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK(estado IN ('presente', 'ausente', 'tardanza', 'justificado')),
  observaciones TEXT,
  hora_registro TEXT DEFAULT CURRENT_TIMESTAMP,
  registrado_por INTEGER NOT NULL,
  FOREIGN KEY (sesion_id) REFERENCES attendance_sessions(id),
  FOREIGN KEY (estudiante_id) REFERENCES students(id),
  FOREIGN KEY (registrado_por) REFERENCES users(id),
  UNIQUE(sesion_id, estudiante_id)
);

-- Tabla de Notificaciones
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  representante_id INTEGER NOT NULL,
  estudiante_id INTEGER NOT NULL,
  sesion_id INTEGER,
  tipo TEXT NOT NULL CHECK(tipo IN ('ausencia', 'tardanza', 'general', 'nota', 'constancia')),
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  leida INTEGER DEFAULT 0,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP,
  fecha_lectura TEXT,
  FOREIGN KEY (representante_id) REFERENCES users(id),
  FOREIGN KEY (estudiante_id) REFERENCES students(id)
);

-- Tabla de Configuración del Liceo/Colegio
CREATE TABLE IF NOT EXISTS school_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  direccion TEXT,
  latitud REAL NOT NULL,
  longitud REAL NOT NULL,
  radio_permitido INTEGER DEFAULT 150,
  telefono TEXT,
  codigo_postal TEXT,
  logo_key TEXT,
  periodo_escolar_actual TEXT DEFAULT '2024-2025',
  fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Lapsos
CREATE TABLE IF NOT EXISTS lapsos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  periodo_escolar TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Evaluaciones
CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  materia_id INTEGER NOT NULL,
  profesor_id INTEGER NOT NULL,
  lapso_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT CHECK(tipo IN ('examen', 'trabajo', 'proyecto', 'participacion', 'otro')),
  ponderacion REAL DEFAULT 0,
  fecha_aplicacion TEXT,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (materia_id) REFERENCES subjects(id),
  FOREIGN KEY (profesor_id) REFERENCES users(id),
  FOREIGN KEY (lapso_id) REFERENCES lapsos(id)
);

-- Tabla de Notas
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluacion_id INTEGER NOT NULL,
  estudiante_id INTEGER NOT NULL,
  nota REAL NOT NULL,
  observaciones TEXT,
  registrado_por INTEGER NOT NULL,
  fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evaluacion_id) REFERENCES evaluations(id),
  FOREIGN KEY (estudiante_id) REFERENCES students(id),
  FOREIGN KEY (registrado_por) REFERENCES users(id),
  UNIQUE(evaluacion_id, estudiante_id)
);

-- Tabla de Constancias
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estudiante_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('estudio', 'trabajo', 'buena_conducta', 'retiro', 'otro')),
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'aprobada', 'rechazada')),
  solicitado_por INTEGER NOT NULL,
  aprobado_por INTEGER,
  motivo_rechazo TEXT,
  referencias TEXT,
  pdf_key TEXT,
  observaciones TEXT,
  fecha_solicitud TEXT DEFAULT CURRENT_TIMESTAMP,
  fecha_aprobacion TEXT,
  FOREIGN KEY (estudiante_id) REFERENCES students(id),
  FOREIGN KEY (solicitado_por) REFERENCES users(id),
  FOREIGN KEY (aprobado_por) REFERENCES users(id)
);

-- Tabla de Diario del Profesor
CREATE TABLE IF NOT EXISTS teacher_daily_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profesor_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  hora_entrada TEXT NOT NULL,
  hora_salida TEXT,
  latitud_entrada REAL,
  longitud_entrada REAL,
  latitud_salida REAL,
  longitud_salida REAL,
  observaciones TEXT,
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profesor_id) REFERENCES users(id),
  UNIQUE(profesor_id, fecha)
);

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_users_rol ON users(rol);
CREATE INDEX IF NOT EXISTS idx_users_cedula ON users(cedula);
CREATE INDEX IF NOT EXISTS idx_students_codigo ON students(codigo_unico);
CREATE INDEX IF NOT EXISTS idx_students_qr ON students(qr_code);
CREATE INDEX IF NOT EXISTS idx_students_grado_seccion ON students(grado, seccion);
CREATE INDEX IF NOT EXISTS idx_schedules_profesor ON schedules(profesor_id);
CREATE INDEX IF NOT EXISTS idx_schedules_dia ON schedules(dia_semana);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_fecha ON attendance_sessions(fecha);
CREATE INDEX IF NOT EXISTS idx_attendance_records_estudiante ON attendance_records(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_notifications_representante ON notifications(representante_id);
CREATE INDEX IF NOT EXISTS idx_notifications_leida ON notifications(leida);
CREATE INDEX IF NOT EXISTS idx_parent_student_estudiante ON parent_student(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_grades_estudiante ON grades(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_grades_evaluacion ON grades(evaluacion_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_lapso ON evaluations(lapso_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_materia ON evaluations(materia_id);
CREATE INDEX IF NOT EXISTS idx_certificates_estudiante ON certificates(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_certificates_estado ON certificates(estado);
CREATE INDEX IF NOT EXISTS idx_teacher_log_profesor ON teacher_daily_log(profesor_id);
CREATE INDEX IF NOT EXISTS idx_teacher_log_fecha ON teacher_daily_log(fecha);
CREATE INDEX IF NOT EXISTS idx_lapsos_periodo ON lapsos(periodo_escolar);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_estado ON attendance_sessions(estado);
