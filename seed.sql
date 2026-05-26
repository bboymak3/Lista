-- ============================================
-- DATOS SEMILLA - Sistema de Asistencia Escolar
-- Contraseñas hasheadas con SHA-256 + salt (JWT_SECRET default)
-- ============================================

-- Admin por defecto (contraseña: admin123)
-- Hash SHA-256: SHA-256("default-secret-change-me" + "admin123")
INSERT OR IGNORE INTO users (cedula, nombre, apellido, email, password, rol, telefono, activo) VALUES
('V-00000000', 'Administrador', 'Sistema', 'admin@sistema.edu', 'eeed15930a3947189207521cad82526964c65d8c906e5e7d16167f935845d582', 'admin', '0412-0000000', 1);

-- Profesor de ejemplo (contraseña: profesor123)
INSERT OR IGNORE INTO users (cedula, nombre, apellido, email, password, rol, telefono, activo) VALUES
('V-00000001', 'María', 'García', 'profesor@sistema.edu', '6a52fedad36caafe02a2719a0ee0d951415ccc425f7391e7a837e32eff809066', 'profesor', '0414-1111111', 1);

-- Estudiante de ejemplo (contraseña: estudiante123)
-- Nota: El estudiante también tiene registro en tabla students
INSERT OR IGNORE INTO users (cedula, nombre, apellido, email, password, rol, telefono, activo) VALUES
('V-00000002', 'Carlos', 'Pérez', 'estudiante@sistema.edu', 'f50f76febada268a9cbce44ddadba5e3d504a6cbf2a0b4b2845587664dd955c4', 'estudiante', '0416-2222222', 1);

-- Representante de ejemplo (contraseña: representante123)
INSERT OR IGNORE INTO users (cedula, nombre, apellido, email, password, rol, telefono, activo) VALUES
('V-00000003', 'Ana', 'Rodríguez', 'representante@sistema.edu', '351d359f9a8dff7b21e0584ac8f88e1b67de93f13f4495fbe9c844c8ba80e8d6', 'representante', '0424-3333333', 1);

-- Materias de ejemplo
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion) VALUES
('Matemáticas', 'MAT-001', 'Matemáticas generales'),
('Lengua y Literatura', 'LEN-001', 'Lengua española y literatura'),
('Ciencias Naturales', 'CIN-001', 'Ciencias naturales y educación ambiental'),
('Historia', 'HIS-001', 'Historia de Venezuela y universal'),
('Educación Física', 'EDF-001', 'Educación física y deportes');

-- Sección de ejemplo
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar) VALUES
('A', '1', 'manana', '2024-2025');

-- Estudiante en tabla students
INSERT OR IGNORE INTO students (codigo_unico, cedula_escolar, nombre, apellido, fecha_nacimiento, genero, grado, seccion, turno, qr_code, activo) VALUES
('EST-2024-001', 'V-00000002', 'Carlos', 'Pérez', '2008-05-15', 'M', '1', 'A', 'manana', 'QR-EST-001', 1),
('EST-2024-002', 'V-00000004', 'Lucía', 'Martínez', '2008-08-22', 'F', '1', 'A', 'manana', 'QR-EST-002', 1),
('EST-2024-003', 'V-00000005', 'José', 'López', '2008-03-10', 'M', '1', 'A', 'manana', 'QR-EST-003', 1),
('EST-2024-004', 'V-00000006', 'Carmen', 'Hernández', '2008-11-30', 'F', '1', 'A', 'manana', 'QR-EST-004', 1),
('EST-2024-005', 'V-00000007', 'Miguel', 'Torres', '2008-01-25', 'M', '1', 'A', 'manana', 'QR-EST-005', 1);

-- Relación representante-estudiante (Ana Rodríguez es representante de Carlos Pérez)
INSERT OR IGNORE INTO parent_student (representante_id, estudiante_id, parentesco, es_principal) VALUES
(4, 1, 'madre', 1),
(4, 2, 'madre', 0);

-- Horario de ejemplo (Lunes=1, 7:00-7:40)
INSERT OR IGNORE INTO schedules (materia_id, profesor_id, seccion_id, dia_semana, hora_inicio, hora_fin, aula, periodo_escolar, activo) VALUES
(1, 2, 1, 1, '07:00', '07:40', 'Aula 101', '2024-2025', 1),
(2, 2, 1, 1, '07:40', '08:20', 'Aula 101', '2024-2025', 1),
(3, 2, 1, 2, '07:00', '07:40', 'Aula 102', '2024-2025', 1),
(1, 2, 1, 3, '07:00', '07:40', 'Aula 101', '2024-2025', 1),
(4, 2, 1, 4, '07:00', '07:40', 'Aula 103', '2024-2025', 1),
(5, 2, 1, 5, '07:00', '07:40', 'Cancha', '2024-2025', 1);

-- Asignar estudiantes al primer horario (Matemáticas Lunes)
INSERT OR IGNORE INTO schedule_students (horario_id, estudiante_id) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5);
