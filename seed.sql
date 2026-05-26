-- ============================================
-- DATOS SEMILLA - Sistema de Asistencia Escolar
-- ============================================

-- Admin por defecto (contraseña: admin123)
INSERT INTO users (cedula, nombre, apellido, email, password_hash, rol, telefono) VALUES
('V-00000001', 'Administrador', 'Sistema', 'admin@sistema.edu', '$2a$10$ placeholder_hash_change_me', 'admin', '0412-0000000');

-- Materias de ejemplo
INSERT INTO subjects (nombre, codigo, descripcion) VALUES
('Matemáticas', 'MAT-001', 'Matemáticas generales'),
('Lengua y Literatura', 'LEN-001', 'Lengua española y literatura'),
('Ciencias Naturales', 'CIN-001', 'Ciencias naturales y educación ambiental'),
('Historia', 'HIS-001', 'Historia de Venezuela y universal'),
('Educación Física', 'EDF-001', 'Educación física y deportes');

-- Período escolar actual
-- Se usa en los horarios como referencia
