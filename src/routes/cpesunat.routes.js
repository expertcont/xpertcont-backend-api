const {Router} = require('express');
const router = Router();
const {registrarCPESunat, registrarCPESunatPrevioPDF, registrarCPESunatPrevioPDFA4} = require('../controllers/cpesunat.controllers')
const {registrarCPEResumenSunat, consultarCPEResumenSunat} = require('../controllers/cpesunatresumen.controllers')

router.post('/cpesunat', registrarCPESunat);
router.post('/cpesunatresumen', registrarCPEResumenSunat);
router.post('/cpesunatresumen/ticket', consultarCPEResumenSunat);
router.post('/cpesunatpdfprevio', registrarCPESunatPrevioPDF);
router.post('/cpesunatpdfprevioa4', registrarCPESunatPrevioPDFA4);

module.exports = router;
