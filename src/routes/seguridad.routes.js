const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosPermisoComandosVista,obtenerTodosPermisoComandos,obtenerTodosMenu,registrarPermisoComando,eliminarPermisoComando,registrarUsuario,clonarPermisoComando,eliminarPermisoUsuario,obtenerTodosEmail,obtenerTodosPermisosContabilidadesVista, eliminarPermisoContabilidad, registrarPermisoContabilidad} = require('../controllers/seguridad.controllers')

router.get('/seguridad/:id_usuario/:id_invitado/vista', obtenerTodosPermisoComandosVista);
router.get('/seguridad/:id_usuario/:id_invitado/:id_menu', obtenerTodosPermisoComandos);
router.get('/seguridadmenu/:id_usuario/:id_invitado', obtenerTodosMenu);
router.get('/seguridademail/:id_usuario', obtenerTodosEmail);

router.get('/seguridad/contabilidades/:id_usuario/:id_invitado/vista', obtenerTodosPermisosContabilidadesVista);

router.post('/seguridad', registrarPermisoComando); //json
router.delete('/seguridadclonar', clonarPermisoComando); 
router.post('/seguridad/contabilidad', registrarPermisoContabilidad); //new json

router.post('/seguridad/:id_usuario/:nombre/nuevo', registrarUsuario); //pendiente

router.delete('/seguridad/:id_usuario/:id_invitado/:id_comando', eliminarPermisoComando);
router.delete('/seguridadeliminar/:id_usuario/:id_invitado', eliminarPermisoUsuario);
router.delete('/seguridad/contabilidad/:id_usuario/:id_invitado/:documento_id', eliminarPermisoContabilidad); //new json

module.exports = router;