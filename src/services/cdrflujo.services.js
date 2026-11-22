const pool = require('../db');
const { Pool } = require('pg');
// Conexiones separadas: el bloqueo no debe agotar el pool que usa el envio.
const lockPool = new Pool({ ...pool.options, max: 4 });
const seguimiento = require('./cdrseguimiento.services');
// Consulta sin enviar; REENVIAR exige una nueva comprobacion en el servidor.
async function resolverPendiente(req, res, next, consultar) {
  const accion = req.body.venta.accion_cdr || 'ENVIAR';
  if (!['ENVIAR','CONSULTAR','REENVIAR'].includes(accion)) {
    res.status(400).json({ estado:false, codigo:'ACCION', mensaje:'Accion CDR no valida' });
    return true;
  }
  const pendiente = await seguimiento.obtenerPendiente(req.body);
  if (pendiente && req.body.venta.accion_cdr == null) { await consultar(req,res,next); return true; }
  if (accion === 'CONSULTAR') { await consultar(req,res,next); return true; }
  if (!pendiente) {
    if (accion !== 'REENVIAR') return false;
    res.status(409).json({ estado:false, codigo:'SIN_PEND', mensaje_usuario:'El pendiente ya no esta activo. Actualice y consulte el estado.' });
    return true;
  }
  if (accion !== 'REENVIAR') {
    res.status(409).json({ estado:false, codigo:pendiente.ultimo_codigo || 'PENDIENTE', nivel:'PENDIENTE',
      cdr_pendiente:'1', pendiente_detectado:true, puede_reenviar:false,
      titulo_usuario:'Envío por confirmar',
      mensaje_usuario:'Este comprobante tiene un envío por confirmar. Consulte el estado para completar la operación.',
      respuesta_sunat_descripcion:pendiente.ultimo_mensaje || 'Motivo original no registrado.' });
    return true;
  }
  let resultado;
  await consultar(req, {
    status(status) { this.statusCode=status; return this; },
    json(body) { resultado={status:this.statusCode,body}; return this; }
  }, error => { throw error; });
  if (resultado?.body?.puede_reenviar === true) return false;
  res.status(resultado?.status || 409).json(resultado?.body || { estado:false, codigo:'CONSULTA',
    nivel:'PENDIENTE',cdr_pendiente:'1',mensaje_usuario:'No se pudo verificar el estado. Consulte nuevamente.' });
  return true;
}
// Evita dos consultas/envios simultaneos del mismo comprobante entre instancias.
function serializarComprobante(handler) {
  return async (req,res,next) => {
    let client, locked=false;
    const key=JSON.stringify([req.body?.empresa?.ruc,req.body?.venta?.codigo,req.body?.venta?.serie,
      String(req.body?.venta?.numero || '').replace(/^0+(?=\d)/,'')]);
    try {
      client=await lockPool.connect();
      const {rows}=await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key]);
      locked=rows[0].locked;
      if (!locked) return res.status(409).json({estado:false,codigo:'EN_PROCESO',nivel:'PENDIENTE',
        titulo_usuario:'Operación en curso',mensaje_usuario:'Ya se está procesando este comprobante. Espere y consulte nuevamente.'});
      return await handler(req,res,next);
    } catch(error) { return next(error); }
    finally {
      if(client) {
        try { if(locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]); }
        catch(error) { client.release(error); client=null; }
        finally { if(client) client.release(); }
      }
    }
  };
}
module.exports={resolverPendiente,serializarComprobante};
