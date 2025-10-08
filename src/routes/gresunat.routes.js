const {Router} = require('express');
const router = Router();
const {registrarGRESunat, registrarGRESunatPrevioPDF, registrarGRESunatPrevioPDFA4} = require('../controllers/gresunat.controllers')

router.post('/gresunat', registrarGRESunat);
router.post('/gresunatpdfprevio', registrarGRESunatPrevioPDF);
router.post('/gresunatpdfprevioa4', registrarGRESunatPrevioPDFA4);

//router.put('/usuario/:id_usuario', actualizarUsuario);
//router.delete('/usuario/:id_usuario', eliminarUsuario);

module.exports = router;