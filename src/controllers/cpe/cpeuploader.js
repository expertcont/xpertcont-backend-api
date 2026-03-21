require('dotenv').config();
const Client = require('ssh2-sftp-client');

const config = {
  host: process.env.CPE_HOST,
  port: 22,
  username: process.env.CPE_USER,
  password: process.env.CPE_PASSWORD,
  readyTimeout: 20000,
  retries: 2,
  algorithms: {
    serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
    kex: [
      'diffie-hellman-group14-sha1',
      'diffie-hellman-group-exchange-sha256'
    ],
    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr']
  }
};

async function subirArchivoDesdeMemoria(ruc, codigo, serie, numero, contenido, respuesta) {
  const sftp = new Client();

  const basePath = `/descargas/${ruc}`;
  const rutaArchivo =
    respuesta === 'R'
      ? `${basePath}/R-${ruc}-${codigo}-${serie}-${numero}.xml`
      : respuesta === 'PDF'
      ? `${basePath}/${ruc}-${codigo}-${serie}-${numero}.pdf`
      : `${basePath}/${ruc}-${codigo}-${serie}-${numero}.xml`;

  try {
    if (!contenido) {
      throw new Error('Contenido vacío o inválido');
    }

    console.log('🔌 Conectando a SFTP...');
    await sftp.connect(config);

    console.log('📁 Creando carpeta si no existe...');
    await sftp.mkdir(basePath, true);

    console.log('⬆️ Subiendo archivo... cliente');
    await sftp.put(Buffer.from(contenido), rutaArchivo);

    console.log(`✅ Archivo subido: ${rutaArchivo}`);

  } catch (err) {
    console.error(`❌ Error subiendo ${rutaArchivo}:`, err.message || err);
    throw err; // importante si quieres manejarlo arriba
  } finally {
    try {
      await sftp.end();
    } catch (e) {
      // evitar crash si no conectó
    }
  }
}

module.exports = { subirArchivoDesdeMemoria };

/**
 * Sube un archivo desde memoria (buffer o string) a una carpeta de RUC y serie-numero
 * @param {string} ruc
 * @param {string} serie
 * @param {string} numero
 * @param {Buffer|string} contenido - Contenido en memoria del archivo
 * @param {string} nombreRemoto - Nombre final del archivo remoto (incluyendo .xml o .cdr)
 */

/*require('dotenv').config();
const Client = require('ssh2-sftp-client');

const config = {
  host: process.env.CPE_HOST,
  port: 22,
  username: process.env.CPE_USER,
  password: process.env.CPE_PASSWORD
};

async function subirArchivoDesdeMemoria(ruc, codigo, serie, numero, contenido, respuesta) {
  const sftp = new Client();
  const rutaFactura = `/descargas/${ruc}/`;
  let rutaArchivo = (respuesta=='R') ?  `${rutaFactura}R-${ruc}-${codigo}-${serie}-${numero}.xml`
                                          :
                                          (
                                            (respuesta=='PDF') ? 
                                            `${rutaFactura}${ruc}-${codigo}-${serie}-${numero}.pdf`
                                              :
                                            `${rutaFactura}${ruc}-${codigo}-${serie}-${numero}.xml`
                                          )

  try {
    await sftp.connect(config);
    //console.log('despues de await sftp.connect(config)');

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
module.exports = { subirArchivoDesdeMemoria };*/