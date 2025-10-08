const {Router} = require('express');
const router = Router();
const {registrarCPESunat, registrarCPESunatPrevioPDF, registrarCPESunatPrevioPDFA4} = require('../controllers/cpesunat.controllers')

//router.get('/cpesunat', obtenerTodosUsuarios);

router.post('/cpesunat', registrarCPESunat);
router.post('/cpesunatpdfprevio', registrarCPESunatPrevioPDF);
router.post('/cpesunatpdfprevioa4', registrarCPESunatPrevioPDFA4);
//router.put('/usuario/:id_usuario', actualizarUsuario);
//router.delete('/usuario/:id_usuario', eliminarUsuario);

module.exports = router;