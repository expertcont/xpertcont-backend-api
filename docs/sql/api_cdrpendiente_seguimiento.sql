-- Aplicar antes de desplegar la API. Los pendientes anteriores conservan motivo desconocido.
BEGIN;
ALTER TABLE public.api_cdrpendiente
 ADD COLUMN IF NOT EXISTS error_codigo_original varchar(50),
 ADD COLUMN IF NOT EXISTS error_mensaje_original text,
 ADD COLUMN IF NOT EXISTS ultimo_codigo varchar(50),
 ADD COLUMN IF NOT EXISTS ultimo_mensaje text,
 ADD COLUMN IF NOT EXISTS ultima_accion varchar(20),
 ADD COLUMN IF NOT EXISTS ultimo_intento timestamp,
 ADD COLUMN IF NOT EXISTS cantidad_consultas integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS estado varchar(20) NOT NULL DEFAULT 'PENDIENTE',
 ADD COLUMN IF NOT EXISTS resolucion varchar(30),
 ADD COLUMN IF NOT EXISTS fecha_resolucion timestamp,
 ADD COLUMN IF NOT EXISTS codigo_hash text;
CREATE INDEX IF NOT EXISTS api_cdrpendiente_busqueda_estado
 ON public.api_cdrpendiente (documento_id,codigo,serie,numero,estado);
COMMIT;
