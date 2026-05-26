-- Seed data for Sistema de Asistencia Escolar
-- Run this AFTER schema.sql

-- Default admin user (password: admin123)
-- Hash computed with SHA-256 using JWT_SECRET as salt
-- INSERT OR IGNORE INTO users (cedula, nombre, apellido, email, password_hash, rol, telefono, turno, activo) VALUES
-- ('V-00000000', 'Admin', 'Sistema', 'admin@liceo.edu', '<hash>', 'admin', '0412-0000000', 'manana', 1);

-- Default subjects
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion, activo) VALUES ('Matemáticas', 'MAT-101', 'Matemáticas generales', 1);
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion, activo) VALUES ('Lengua y Literatura', 'LEN-101', 'Lengua castellana y literatura', 1);
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion, activo) VALUES ('Ciencias Naturales', 'CIE-101', 'Ciencias naturales y educación ambiental', 1);
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion, activo) VALUES ('Ciencias Sociales', 'SOC-101', 'Ciencias sociales, historia y geografía', 1);
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion, activo) VALUES ('Educación Física', 'EDF-101', 'Educación física y deportes', 1);
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion, activo) VALUES ('Inglés', 'ING-101', 'Idioma inglés', 1);
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion, activo) VALUES ('Física', 'FIS-101', 'Física general', 1);
INSERT OR IGNORE INTO subjects (nombre, codigo, descripcion, activo) VALUES ('Química', 'QUI-101', 'Química general', 1);

-- Default sections
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('A', 1, 'manana', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('B', 1, 'manana', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('A', 2, 'manana', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('B', 2, 'manana', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('A', 3, 'manana', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('B', 3, 'manana', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('A', 4, 'manana', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('A', 5, 'manana', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('A', 1, 'tarde', '2024-2025', 1);
INSERT OR IGNORE INTO sections (nombre, grado, turno, periodo_escolar, activo) VALUES ('A', 6, 'manana', '2024-2025', 1);

-- Default lapsos
INSERT OR IGNORE INTO lapsos (numero, nombre, fecha_inicio, fecha_fin, periodo_escolar, activo) VALUES (1, 'Primer Lapso', '2024-10-01', '2024-12-20', '2024-2025', 1);
INSERT OR IGNORE INTO lapsos (numero, nombre, fecha_inicio, fecha_fin, periodo_escolar, activo) VALUES (2, 'Segundo Lapso', '2025-01-13', '2025-03-28', '2024-2025', 1);
INSERT OR IGNORE INTO lapsos (numero, nombre, fecha_inicio, fecha_fin, periodo_escolar, activo) VALUES (3, 'Tercer Lapso', '2025-04-07', '2025-06-30', '2024-2025', 1);

-- Default school config (coordinates for a sample location in Venezuela)
INSERT OR IGNORE INTO school_config (nombre, direccion, latitud, longitud, radio_permitido, telefono, periodo_escolar_actual) 
VALUES ('Unidad Educativa Ejemplo', 'Calle Principal, Ciudad', 8.2943, -62.7289, 150, '0281-0000000', '2024-2025');
