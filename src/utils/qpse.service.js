// src/infra/qpse/qpse.service.js
//import AdmZip from 'adm-zip';
const AdmZip = require('adm-zip');

class QpseService {
  constructor({ baseUrl, username, password }) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;

    this.token = null;
    this.tokenExpiraEn = null;
  }

  async obtenerToken() {
    const response = await fetch(`${this.baseUrl}/api/auth/cpe/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Error obteniendo token QPSE: ${response.status} - ${error}`);
    }

    const data = await response.json();

    this.token = data.token_acceso;
    this.tokenExpiraEn = Number(data.expira_en);
    console.log('toke firma:', this.token);
    return this.token;
  }

  async firmarXml({ xmlFilename, xmlContent }) {
    if (!this.token) {
      await this.obtenerToken();
    }

    const xmlBase64 = Buffer.from(xmlContent, 'utf8').toString('base64');

    const response = await fetch(`${this.baseUrl}/api/cpe/generar`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        xml_filename: xmlFilename,
        xml_content_base64: xmlBase64,
      }),
    });

    // Token vencido o inválido → reintento automático 1 vez
    if (response.status === 401) {
      await this.obtenerToken();
      return this.firmarXml({ xmlFilename, xmlContent });
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Error firmando XML QPSE: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'QPSE no pudo firmar el XML');
    }

    const xmlFirmado = this._extraerXmlFirmado(data.xml);

    return {
      externalId: data.external_id,
      hash: data.hash,
      xmlFirmado,
    };
  }

  _extraerXmlFirmado(base64Zip) {
    const zipBuffer = Buffer.from(base64Zip, 'base64');
    const zip = new AdmZip(zipBuffer);

    const entries = zip.getEntries();
    if (!entries.length) {
      throw new Error('ZIP firmado vacío o inválido');
    }

    return entries[0].getData().toString('utf8');
  }
}

module.exports = { QpseService };