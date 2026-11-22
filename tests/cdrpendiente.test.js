const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function cargar(file, mocks, globals={}) {
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{
    module,exports:module.exports,require:name=>name in mocks ? mocks[name] : require(name),
    console,Buffer,process:{env:{CPE_HOST:'archivos.test'}},...globals
  },{filename:file});
  return module.exports;
}
const data = accion => ({empresa:{ruc:'20539579356'},cliente:{documento_identidad:'20454888376'},
  venta:{codigo:'01',serie:'F021',numero:'0000100',...(accion ? {accion_cdr:accion} : {})}});
function respuesta() { return {statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}}; }
function flujo(pendiente,consulta) {
  return cargar('services/cdrflujo.services.js',{
    '../db':{options:{}},pg:{Pool:class {}},
    './cdrseguimiento.services':{obtenerPendiente:async()=>pendiente}
  }).resolverPendiente;
}
test('sin pendiente permite envio normal',async()=>{
  assert.equal(await flujo(null)({body:data('ENVIAR')},respuesta(),null,()=>{throw Error('no consultar');}),false);
});
test('pendiente informa y no envia ni consulta sin decision',async()=>{
  const res=respuesta();assert.equal(await flujo({})({body:data('ENVIAR')},res,null,()=>{throw Error('no consultar');}),true);
  assert.equal(res.statusCode,409);assert.equal(res.body.pendiente_detectado,true);assert.equal(res.body.puede_reenviar,false);
});
test('CONSULTAR nunca convierte ausencia de pendiente en envio',async()=>{
  let consultas=0;assert.equal(await flujo(null)({body:data('CONSULTAR')},respuesta(),null,async()=>{consultas++;}),true);assert.equal(consultas,1);
});
test('reenvio exige pendiente activo',async()=>{
  const res=respuesta();assert.equal(await flujo(null)({body:data('REENVIAR')},res,null,()=>{throw Error('no');}),true);assert.equal(res.statusCode,409);
});
test('reenvio vuelve a consultar y solo continua ante 0127 confirmado',async()=>{
  let consultas=0;assert.equal(await flujo({})({body:data('REENVIAR')},respuesta(),null,async(req,res)=>{consultas++;res.status(400).json({puede_reenviar:true,codigo:'0127'});}),false);assert.equal(consultas,1);
});
test('CDR recuperado durante reenvio evita un segundo envio',async()=>{
  const res=respuesta();assert.equal(await flujo({})({body:data('REENVIAR')},res,null,async(req,r)=>r.status(200).json({nivel:'ACEPTADO',puede_reenviar:false})),true);assert.equal(res.body.nivel,'ACEPTADO');
});
test('error temporal durante reenvio conserva pendiente',async()=>{
  const res=respuesta();assert.equal(await flujo({})({body:data('REENVIAR')},res,null,async(req,r)=>r.status(400).json({nivel:'PENDIENTE',puede_reenviar:false})),true);
});
test('clientes antiguos sin accion mantienen consulta de pendientes',async()=>{
  let consultas=0;assert.equal(await flujo({})({body:data()},respuesta(),null,async()=>{consultas++;}),true);assert.equal(consultas,1);
});
test('bloqueo ocupado impide procesar y libera conexion',async()=>{
  let ejecuciones=0,liberaciones=0;
  const client={query:async()=>({rows:[{locked:false}]}),release:()=>liberaciones++};
  const service=cargar('services/cdrflujo.services.js',{'../db':{options:{}},pg:{Pool:class {async connect(){return client;}}},'./cdrseguimiento.services':{}});
  const res=respuesta();await service.serializarComprobante(async()=>ejecuciones++)({body:data()},res,error=>{throw error;});
  assert.equal(ejecuciones,0);assert.equal(liberaciones,1);assert.equal(res.statusCode,409);
});
test('fallo de envio libera bloqueo y comunica error',async()=>{
  let liberaciones=0,queries=0,errorRecibido;
  const client={query:async()=>{queries++;return {rows:[{locked:true}]};},release:()=>liberaciones++};
  const service=cargar('services/cdrflujo.services.js',{'../db':{options:{}},pg:{Pool:class {async connect(){return client;}}},'./cdrseguimiento.services':{}});
  await service.serializarComprobante(async()=>{throw Error('fallo');})({body:data()},respuesta(),error=>{errorRecibido=error;});
  assert.equal(errorRecibido.message,'fallo');assert.equal(queries,2);assert.equal(liberaciones,1);
});
test('nuevo pendiente guarda codigo, mensaje y hash originales',async()=>{
  const queries=[];const service=cargar('services/cdrseguimiento.services.js',{'../db':{query:async(sql,params)=>{queries.push({sql,params});return {rowCount:0};}}});
  await service.guardarPendiente(data(),'soap-env:Client.0133','Mensaje original','hash');
  assert.equal(queries.length,2);assert.match(queries[1].sql,/error_codigo_original/);assert.equal(queries[1].params[4],'soap-env:Client.0133');assert.equal(queries[1].params[5],'Mensaje original');
});
test('pendiente antiguo conserva motivo original desconocido',async()=>{
  const queries=[];const service=cargar('services/cdrseguimiento.services.js',{'../db':{query:async(sql)=>{queries.push(sql);return {rowCount:1};}}});
  await service.guardarPendiente(data(),'0133','Nuevo intento','hash');assert.equal(queries.length,1);assert.doesNotMatch(queries[0],/error_codigo_original/);
});
async function consultarSoap(soap) {
  const updates=[];
  const service=cargar('controllers/cpesunatgetcdrtransporte.controllers.js',{
    '../db':{query:async()=>({rows:[{secundario_user:'usuario',secundario_passwd:'clave'}]})},
    './cpe/cpeuploader':{subirArchivoDesdeMemoria:async()=>{}},
    '../services/cdrseguimiento.services':{obtenerPendiente:async()=>({codigo_hash:'hash-pendiente'}),registrarResultado:async(d,r)=>updates.push(r)}
  },{fetch:async()=>({text:async()=>soap})});
  const res=respuesta();await service.procesarCDRPendienteSunat({body:data('CONSULTAR')},res,error=>{throw error;});return {res,updates};
}
test('0127 conserva codigo y ofrece reenvio con rutas del emisor',async()=>{
  const {res,updates}=await consultarSoap('<Envelope><statusCdr><statusCode>0127</statusCode><statusMessage>El ticket no existe</statusMessage></statusCdr></Envelope>');
  assert.equal(res.statusCode,400);assert.equal(res.body.codigo,'0127');assert.equal(res.body.puede_reenviar,true);assert.match(res.body.ruta_xml,/20539579356-01-F021-0000100/);assert.equal(updates[0].resuelto,false);
});
test('fallo SOAP de credenciales no habilita reenvio',async()=>{
  const {res}=await consultarSoap('<Envelope><Fault><faultcode>soap-env:Client.1032</faultcode><faultstring>Credenciales incorrectas</faultstring></Fault></Envelope>');assert.equal(res.body.puede_reenviar,false);assert.equal(res.body.nivel,'PENDIENTE');
});
for(const codigo of ['0','2335']) test('CDR '+codigo+' se interpreta y conserva seguimiento',async()=>{
  const Zip=require('adm-zip');const zip=new Zip();zip.addFile('R-factura.xml',Buffer.from('<ApplicationResponse><Response><ResponseCode>'+codigo+'</ResponseCode><Description>Resultado CDR</Description></Response></ApplicationResponse>'));
  const {res,updates}=await consultarSoap('<Envelope><statusCdr><statusCode>0004</statusCode><statusMessage>Disponible</statusMessage><content>'+zip.toBuffer().toString('base64')+'</content></statusCdr></Envelope>');
  assert.equal(res.body.nivel,codigo==='0'?'ACEPTADO':'RECHAZADO');assert.equal(res.body.cdr_pendiente,'0');assert.equal(res.body.puede_reenviar,false);assert.equal(updates[0].resuelto,true);assert.equal(res.body.codigo_hash,codigo==='0'?'hash-pendiente':null);
});
