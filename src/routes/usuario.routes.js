const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosUsuarios,obtenerTodosEstudios,obtenerTodosPeriodos,obtenerUsuario,crearUsuario,actualizarUsuario,eliminarUsuario, obtenerTodosContabilidades, obtenerAnfitrion, obtenerTodosModulos} = require('../controllers/usuario.controllers')

router.get('/usuario', obtenerTodosUsuarios);
router.get('/usuario/estudios/:id_usuario', obtenerTodosEstudios);
router.get('/usuario/periodos/:id_usuario', obtenerTodosPeriodos);
router.get('/usuario/anfitrion/:id_usuario', obtenerAnfitrion);

//id_usuario = correo anfitrion, id_auxiliar = correo auxiliar
router.get('/usuario/contabilidades/:id_usuario/:id_invitado', obtenerTodosContabilidades); //estamos usando
router.get('/usuario/modulos/:id_usuario/:id_invitado', obtenerTodosModulos); //new dual

router.get('/usuario/:id_usuario', obtenerUsuario);
router.post('/usuario', crearUsuario);
router.put('/usuario/:id_usuario', actualizarUsuario);
router.delete('/usuario/:id_usuario', eliminarUsuario);

module.exports = router;