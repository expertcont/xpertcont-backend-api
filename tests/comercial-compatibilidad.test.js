const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Zip=require('adm-zip');
function cargar(codigo){
 const consultas=[]; const module={exports:{}};
 const zip=new Zip();zip.addFile('R-cpe.xml',Buffer.from('<ApplicationResponse><Response><ResponseCode>0</ResponseCode><Description>Aceptado</Description></Response></ApplicationResponse>'));
 const mocks={
  '../db':{query:async(sql)=>{consultas.push(sql);if(/ultimo_|error_codigo_original|AND estado|UPDATE api_cdrpendiente/i.test(sql))throw Error('Columna de migracion no disponible');return sql.includes('api_usuariocertificado')?{rows:[{cert_externo:'1',secundario_user:'u',secundario_passwd:'p',url_envio:'https://sunat.test',cert_url:'https://firma.test'}]}:{rowCount:0,rows:[]};}},
  './cpe/cpegeneraxml':async()=>'<Invoice/>',
  './cpe/cpeuploader':{subirArchivoDesdeMemoria:async()=>{}},
  '../utils/xmlsignaturemod.utils':{},
  '../utils/qpse.service':{QpseService:class{async firmarXml(){return {xmlFirmado:'<Invoice><DigestValue>hash-comercial</DigestValue></Invoice>'};}}},
  '../services/cdrvalidapendiente.services':{esErrorCDRPendiente:()=>({esPendiente:false})},
  '../controllers/cpesunatgetcdr.controllers':{procesarCDRPendienteSunat:async()=>{throw Error('No hay pendiente');}},
  'node-fetch':async()=>({text:async()=>'<Envelope><applicationResponse>'+zip.toBuffer().toString('base64')+'</applicationResponse></Envelope>'}),
  dotenv:{config:()=>{}}
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/controllers/cpesunat.controllers.js'),'utf8'),{module,exports:module.exports,Buffer,process:{env:{CPE_HOST:'archivos.test'}},console:{log(){},error(){}},require:n=>{
  if(n in mocks)return mocks[n];
  if(n.startsWith('./cpe/'))return async()=>({estado:false});
  if(n.includes('cdrseguimiento')||n.includes('cdrflujo'))throw Error('El comercial no debe cargar seguimiento de transporte');
  return require(n);
 }});
 return {handler:module.exports.registrarCPESunat,consultas};
}
for(const codigo of ['03','01']) test('comercial '+codigo+' funciona sin migracion de transporte',async()=>{
 const {handler,consultas}=cargar(codigo);
 const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
 await handler({body:{empresa:{ruc:'20539579356',modo:'1'},cliente:{documento_identidad:'12345678'},venta:{codigo,serie:codigo==='03'?'B001':'F001',numero:'0006573'}}},res,error=>{throw error;});
 assert.equal(res.body.nivel,'ACEPTADO');assert.equal(res.body.codigo_hash,'hash-comercial');assert.equal(res.body.estado,true);assert.equal(consultas.length,2);
});
test('rutas comercial y transporte usan controladores distintos',()=>{
 const module={exports:{}};const rutas={};const comercial=()=>{};const transporte=()=>{};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/cpesunat.routes.js'),'utf8'),{module,require:n=>{
  if(n==='express')return {Router:()=>({post:(url,handler)=>{rutas[url]=handler;}})};
  if(n.includes('cpesunattransporte'))return {registrarCPESunat:transporte};
  if(n.includes('cpesunat.controllers'))return {registrarCPESunat:comercial};
  return {};
 }});
 assert.equal(rutas['/cpesunat'],comercial);assert.equal(rutas['/cpesunat/transporte'],transporte);
});
