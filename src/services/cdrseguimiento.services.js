const pool = require('../db');
const clave = (data) => [data.empresa.ruc, data.venta.codigo, data.venta.serie, data.venta.numero];
const filtro = 'documento_id=$1 AND codigo=$2 AND serie=$3 AND numero=$4';
async function obtenerPendiente(data) {
  const { rows } = await pool.query(`SELECT * FROM api_cdrpendiente WHERE ${filtro}
    AND estado='PENDIENTE' ORDER BY ctrl_crea DESC NULLS LAST LIMIT 1`, clave(data));
  return rows[0] || null;
}
async function guardarPendiente(data, codigo, mensaje, hash) {
  const params = [...clave(data), codigo || null, mensaje || null, hash || null];
  // No reconstruir el error original de filas antiguas ni sobrescribirlo al reintentar.
  const updated = await pool.query(`UPDATE api_cdrpendiente SET
    ultimo_codigo=$5, ultimo_mensaje=$6, ultima_accion='ENVIO', codigo_hash=COALESCE($7,codigo_hash),
    ultimo_intento=CURRENT_TIMESTAMP, estado='PENDIENTE', resolucion=NULL, fecha_resolucion=NULL
    WHERE ${filtro} AND estado='PENDIENTE'`, params);
  if (!updated.rowCount) await pool.query(`INSERT INTO api_cdrpendiente
    (documento_id,codigo,serie,numero,ctrl_crea,error_codigo_original,error_mensaje_original,
     ultimo_codigo,ultimo_mensaje,ultima_accion,ultimo_intento,codigo_hash)
    VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,$5,$6,$5,$6,'ENVIO',CURRENT_TIMESTAMP,$7)`, params);
}
async function registrarResultado(data, { codigo, mensaje, accion = 'CONSULTA_CDR', resuelto = false, resolucion = null }) {
  await pool.query(`UPDATE api_cdrpendiente SET ultimo_codigo=$5, ultimo_mensaje=$6,
    ultima_accion=$7, ultimo_intento=CURRENT_TIMESTAMP,
    cantidad_consultas=cantidad_consultas + CASE WHEN $7='CONSULTA_CDR' THEN 1 ELSE 0 END,
    estado=CASE WHEN $8 THEN 'RESUELTO' ELSE 'PENDIENTE' END,
    resolucion=$9, fecha_resolucion=CASE WHEN $8 THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE ${filtro} AND estado='PENDIENTE'`,
    [...clave(data), codigo || null, mensaje || null, accion, resuelto, resolucion]);
}
module.exports = { obtenerPendiente, guardarPendiente, registrarResultado };
