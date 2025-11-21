const {Router} = require('express');
const router = Router();
const {registrarCPESunat, registrarCPESunatPrevioPDF, registrarCPESunatPrevioPDFA4} = require('../controllers/cpesunat.controllers')
const {consultarCDRSunat} = require('../controllers/cpesunatgetcdr.controllers')
//router.get('/cpesunat', obtenerTodosUsuarios);

router.post('/cpesunat', registrarCPESunat);
router.post('/cpesunatpdfprevio', registrarCPESunatPrevioPDF);
router.post('/cpesunatpdfprevioa4', registrarCPESunatPrevioPDFA4);

router.post('/cpesunatgetcdr', consultarCDRSunat);
//router.put('/usuario/:id_usuario', actualizarUsuario);
//router.delete('/usuario/:id_usuario', eliminarUsuario);

module.exports = router;