const {Router} = require('express');
const router = Router();
const {registrarGRESunat} = require('../controllers/gresunat.controllers')

router.post('/gresunat', registrarGRESunat);
//router.put('/usuario/:id_usuario', actualizarUsuario);
//router.delete('/usuario/:id_usuario', eliminarUsuario);

module.exports = router;