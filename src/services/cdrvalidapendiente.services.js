/**
 * Determina si el error de SUNAT representa un CDR pendiente
 * (SUNAT aceptó el CPE pero no pudo generar/entregar el CDR).
 *
 * Esta versión es exclusiva para el caso en que
 * resultadoSunat.estado === false.
 *
 * @param {string} codigoSunat - faultCode devuelto por SUNAT
 * @param {string} mensajeSunat - faultMessage devuelto por SUNAT
 * @returns {object} { esPendiente, codigoInterno, descripcion }
 */
function esErrorCDRPendiente(codigoSunat = '', mensajeSunat = '') {

    const codigo = (codigoSunat || '').trim();
    const mensaje = (mensajeSunat || '').toLowerCase();

    // ================================================================
    // 1) Códigos SUNAT oficiales que indican CDR pendiente
    // ================================================================
    const CODIGOS_CDR_PENDIENTE = {
        'soap-env:Client.0132': 'SUNAT no pudo generar el CDR todavía.',
        'soap-env:Client.0133': 'SUNAT está procesando el CDR internamente.',
        'soap-env:Client.0028': 'SUNAT congestionado, CDR en cola de proceso.',
        'soap-env:Client.0100': 'Servicio de SUNAT temporalmente no disponible.',
        'soap-env:Client.0098': 'Error temporal en SUNAT, CDR aún no generado.',
    };

    if (CODIGOS_CDR_PENDIENTE[codigo]) {
        return {
            esPendiente: true,
            codigoInterno: 1001,
            descripcion: CODIGOS_CDR_PENDIENTE[codigo],
        };
    }

    // ================================================================
    // No es error de CDR pendiente → error real
    // ================================================================
    return {
        esPendiente: false,
        codigoInterno: 0,
        descripcion: mensaje,
    };
}

module.exports = { esErrorCDRPendiente };
