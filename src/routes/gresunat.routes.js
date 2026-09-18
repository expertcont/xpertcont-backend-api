const {Router} = require('express');
const router = Router();
const {registrarGRESunat, registrarGRESunatPrevioPDF, registrarGRESunatPrevioPDFA4} = require('../controllers/gresunat.controllers')

router.post('/gresunat', registrarGRESunat);
//router.post('/gretranssunat', registrarGREMTransSunat);//contiene version GREM
router.post('/gresunatpdfprevio', registrarGRESunatPrevioPDF);
router.post('/gresunatpdfprevioa4', registrarGRESunatPrevioPDFA4);

module.exports = router;
