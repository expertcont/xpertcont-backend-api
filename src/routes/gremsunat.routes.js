const { Router } = require('express');
const router = Router();

const {
  registrarGREMTransSunat,
  generarGREMPrevioPDF,
  generarGREMPrevioPDFA4,
} = require('../controllers/gremsunat.controllers');

// GRE Transportista - envío real a SUNAT
router.post('/gremsunat/trans', registrarGREMTransSunat);

// GRE Transportista - PDF previo 80 mm (NO envía a SUNAT)
router.post('/gremsunat/trans/pdf', generarGREMPrevioPDF);
// GRE Transportista - PDF previo A4 (NO envía a SUNAT)
router.post('/gremsunat/trans/pdf/a4', generarGREMPrevioPDFA4);

module.exports = router;