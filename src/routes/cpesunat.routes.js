const {Router} = require('express');
const router = Router();
const {registrarCPESunat} = require('../controllers/cpesunat.controllers')

//router.get('/cpesunat', obtenerTodosUsuarios);

router.post('/cpesunat', registrarCPESunat);
//router.put('/usuario/:id_usuario', actualizarUsuario);
//router.delete('/usuario/:id_usuario', eliminarUsuario);

module.exports = router;