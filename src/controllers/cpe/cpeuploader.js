require('dotenv').config();
const Client = require('ssh2-sftp-client');
const sftp = new Client();

const config = {
  host: process.env.CPE_HOST,
  port: 22,
  username: process.env.CPE_USER,
  password: process.env.CPE_PASSWORD
};

/**
 * Sube un archivo desde memoria (buffer o string) a una carpeta de RUC y serie-numero
 * @param {string} ruc
 * @param {string} serie
 * @param {string} numero
 * @param {Buffer|string} contenido - Contenido en memoria del archivo
 * @param {string} nombreRemoto - Nombre final del archivo remoto (incluyendo .xml o .cdr)
 */

async function subirArchivoDesdeMemoria(ruc, codigo, serie, numero, contenido, respuesta) {
  const rutaFactura = `/descargas/${ruc}/`;
  let rutaArchivo = (respuesta=='R') ?  `${rutaFactura}R-${ruc}-${codigo}-${serie}-${numero}.xml`
                                          : 
                                        `${rutaFactura}${ruc}-${codigo}-${serie}-${numero}.xml`;

  try {
    await sftp.connect(config);
    console.log('despues de await sftp.connect(config)');

    // Crear carpetas si no existen
    try { 
      await sftp.mkdir(`/descargas/${ruc}`, true); 
    } catch (e) 
    {
      console.log('error: ', e);
    }

    try { 
      await sftp.mkdir(rutaFactura, true); 
    } catch (e) {
      console.log('error: ', e);
    }

    // Subir archivo desde memoria
    await sftp.put(Buffer.from(contenido), rutaArchivo);
    console.log(`✅ Archivo subido desde memoria a: ${rutaArchivo}`);

  } catch (err) {
    console.error(`❌ Error subiendo ${rutaArchivo}:`, err);
  } finally {
    await sftp.end();
  }
}

module.exports = { subirArchivoDesdeMemoria };