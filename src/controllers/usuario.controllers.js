const pool = require('../db');

const obtenerTodosUsuarios = async (req,res,next)=> {
    //console.log("select nombre,email,dni,telefono,vendedor,supervisor,activo from mad_usuario order by nombre");
    try {
        const todosReg = await pool.query("select id_usuario,nombre,email,dni,telefono,vendedor,supervisor,activo from mad_usuario order by nombre");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosEstudios = async (req,res,next)=> {
    //console.log("select nombre,email,dni,telefono,vendedor,supervisor,activo from mad_usuario order by nombre");
    try {
        const {id_usuario} = req.params;
        var strSQL;
        
        //Acceso a tu propio estudio contable, si eres anfitrion claro
        strSQL = " select * from (";
        strSQL = strSQL + "SELECT id_usuario, razon_social from mad_usuario";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " AND anfitrion = '1'";

        //Acceso a otros estudios como invitado (tabla mad_seguridad_contabilidad)
        strSQL = strSQL + " UNION ALL";
        //ahora es tabla mad_seguridad_contabilidad
        strSQL = strSQL + " SELECT consulta.*,";
        strSQL = strSQL + " mad_usuario.razon_social";
        strSQL = strSQL + " FROM (";
        strSQL = strSQL + " select";
        strSQL = strSQL + " mad_seguridad_contabilidad.id_usuario";
        strSQL = strSQL + " from mad_seguridad_contabilidad inner join mad_usuario";
        strSQL = strSQL + " on (mad_seguridad_contabilidad.id_usuario = mad_usuario.id_usuario)";
        strSQL = strSQL + " where mad_seguridad_contabilidad.id_invitado = '" + id_usuario + "'";
        strSQL = strSQL + " group by mad_seguridad_contabilidad.id_usuario";
        strSQL = strSQL + " ) as consulta";
        strSQL = strSQL + " INNER JOIN mad_usuario";
        strSQL = strSQL + " ON (consulta.id_usuario = mad_usuario.id_usuario)";

        //Acceso para el rico administrador o moderador
        strSQL = strSQL + " UNION ALL";
        //new para los admin super (moderadores en un futuro :P), el resto de estudios, para monitoreo
        strSQL = strSQL + " SELECT id_usuario, razon_social";
        strSQL = strSQL + " FROM mad_usuario";
        strSQL = strSQL + " WHERE id_usuario <> '" + id_usuario + "'";
        strSQL = strSQL + " AND EXISTS (";
        strSQL = strSQL + "     SELECT 1";
        strSQL = strSQL + "     FROM mad_usuario";
        strSQL = strSQL + "     WHERE super = '1' AND id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " )";
        strSQL = strSQL + " ) as consulta";
        strSQL = strSQL +" order by consulta.razon_social ASC";

        //Ahora debemos aumentar los negocios
        //Ejemplo Sonia Cahuaya, es contable y negocio
        //deberan aparecer 2 opciones, como minimo ESTUDIOS XCONT y NEGOCIO
        

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosPeriodos = async (req,res,next)=> {
    try {
        const {id_usuario} = req.params;
        var strSQL;
        //Seleccionamos el ultimo
        strSQL = "SELECT periodo from mad_usuariolicencia";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " GROUP BY periodo";
        strSQL = strSQL + " ORDER BY periodo DESC"; 

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerAnfitrion = async (req,res,next)=> {
    //Todas las contabilidades autorizadas por el anfitrion y permisos al auxiliar contable
    //el anfitrion esta autorizado a todos sin permiso
    //luego el invitado con permisos nomas
    try {
        const {id_usuario} = req.params;
        var strSQL;
        strSQL = "SELECT documento_id, razon_social from mad_usuariocontabilidad";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'"; //el anfitrion y
        strSQL = strSQL + " AND id_usuario = '" + id_invitado + "'"; //el auxiliar coinciden (acceso 100%)
        strSQL = strSQL + " AND activo = '1'";

        strSQL = strSQL + " UNION ALL";
        
        strSQL = strSQL + " SELECT mad_seguridad_contabilidad.documento_id,";
        strSQL = strSQL + " mad_usuariocontabilidad.razon_social";
        strSQL = strSQL + " FROM ";
        strSQL = strSQL + " mad_seguridad_contabilidad INNER JOIN mad_usuariocontabilidad";
        strSQL = strSQL + " ON (mad_seguridad_contabilidad.documento_id = mad_usuariocontabilidad.documento_id and ";
        strSQL = strSQL + "'" + id_usuario + "'= mad_usuariocontabilidad.id_usuario )";
        strSQL = strSQL + " WHERE mad_seguridad_contabilidad.id_usuario = '" + id_usuario + "'"; //anfitrion
        strSQL = strSQL + " AND mad_seguridad_contabilidad.id_invitado = '" + id_invitado + "'"; //auxiliar

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTodosContabilidades = async (req,res,next)=> {
    //Todas las contabilidades autorizadas por el anfitrion y permisos al auxiliar contable
    try {
        const {id_usuario,id_invitado} = req.params;
        var strSQL;
        //Si es el anfitrion esta autorizado a todos sin permiso
        strSQL = "select * from (";
        strSQL += "SELECT documento_id, razon_social from mad_usuariocontabilidad";
        strSQL += " WHERE id_usuario = '" + id_usuario + "'"; //el anfitrion y
        strSQL += " AND id_usuario = '" + id_invitado + "'"; //el auxiliar coinciden (acceso 100%)
        strSQL += " AND activo = '1'";

        //Si es el invitado con permisos nomas
        strSQL += " UNION ALL";
        
        strSQL += " SELECT mad_seguridad_contabilidad.documento_id,";
        strSQL += " mad_usuariocontabilidad.razon_social";
        strSQL += " FROM ";
        strSQL += " mad_seguridad_contabilidad INNER JOIN mad_usuariocontabilidad";
        strSQL += " ON (mad_seguridad_contabilidad.documento_id = mad_usuariocontabilidad.documento_id and ";
        strSQL += "'" + id_usuario + "'= mad_usuariocontabilidad.id_usuario )";
        strSQL += " WHERE mad_seguridad_contabilidad.id_usuario = '" + id_usuario + "'"; //anfitrion
        strSQL += " AND mad_seguridad_contabilidad.id_invitado = '" + id_invitado + "'"; //auxiliar

        //Agregamos el super 
        strSQL += " UNION ALL";

        strSQL += " SELECT documento_id,";
        strSQL += "        razon_social";
        strSQL += " FROM mad_usuariocontabilidad";
        strSQL += " WHERE id_usuario = '" + id_usuario + "'"; //anfitrion
        strSQL += " AND EXISTS (";
        strSQL += "     SELECT 1    FROM mad_usuario";
        strSQL += "     WHERE super = '1' AND id_usuario = '" + id_invitado + "'"; //auxiliar
        strSQL += " )";

        strSQL += " ) as consulta";
        strSQL += " group by consulta.documento_id,consulta.razon_social";
        strSQL += " order by consulta.razon_social";

        //console.log(strSQL);
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosModulos = async (req,res,next)=> {
    //Todas las contabilidades autorizadas por el anfitrion y permisos al auxiliar contable
    try {
        const {id_usuario,id_invitado} = req.params;
        var strSQL;
        //Si es el anfitrion esta autorizado, los demas necesitan permiso
        strSQL = "SELECT tipo FROM mad_seguridad_contabilidad";
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND id_invitado = $2";

        //aqui debemos mejorar el acceso en caso, exista otro usuario autorizado
        //el moderador recien tendra acceso, por razones de supervision
        strSQL += " UNION ALL";
        strSQL += " SELECT 'CONT' as tipo";
        strSQL += " FROM mad_usuario";
        strSQL += " WHERE super = '1' AND id_usuario = '" + id_invitado + "'"; //auxiliar

        strSQL += " UNION ALL";
        strSQL += " SELECT 'ADMIN' as tipo";
        strSQL += " FROM mad_usuario";
        strSQL += " WHERE super = '1' AND id_usuario = '" + id_invitado + "'"; //auxiliar

        strSQL += " GROUP BY tipo";
        //EL moderador, no deberia tener acceso. sino esta activado algun usuario

        const todosReg = await pool.query(strSQL,[id_usuario,id_invitado]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};


const obtenerUsuario = async (req,res,next)=> {
    try {
        const {id_usuario} = req.params;
        const result = await pool.query("select * from mad_usuario where id_usuario = $1",[id_usuario]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Usuario no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearUsuario = async (req,res,next)=> {
    const {id_usuario,razon_social,documento_id,telefono,periodo} = req.body
    try {
        var strSQL;
        strSQL = "INSERT INTO mad_usuario ";
        strSQL = strSQL + " (id_usuario,razon_social,documento_id,telefono,activo) RETURNING *";
        strSQL = strSQL + " VALUES ($1,$2,$3,$4,$5,current_timestamp,'1') RETURNING *";
        const result = await pool.query(strSQL, 
        [   
            id_usuario,     //01 body
            razon_social,   //02 body
            documento_id,   //03 body
            telefono        //04 body
        ]
        );
        
        strSQL = "INSERT INTO mad_usuariolicencia ";
        strSQL = strSQL + " (id_usuario,id_licencia,periodo,ctrl_crea) RETURNING *";
        strSQL = strSQL + " VALUES ($1,$2,$3,current_timestamp) RETURNING *";
        const result2 = await pool.query(strSQL, 
        [   
            id_usuario,     //01 body
            id_licencia,   //02 body
            periodo,   //03 body
        ]
        );

        //Agregaremos dar de alta licencia inicial, para posterior aprobacion

        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarUsuario = async (req,res,next)=> {
    try {
        const {id_usuario} = req.params;
        const result = await pool.query("delete from mad_usuario where id_usuario = $1",[id_usuario]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Usuario no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarUsuario = async (req,res,next)=> {
    try {
        var strSQL;
        const {id_usuario} = req.params;
        const {razon_social,documento_id,telefono} = req.body
        strSQL = "update mad_usuario set";
        strSQL = strSQL + "  razon_social=$2";
        strSQL = strSQL + " ,documento_id=$3";
        strSQL = strSQL + " ,telefono=$4";
        strSQL = strSQL + " where id_usuario=$1";
        
        const result = await pool.query(strSQL,
        [   
            id_usuario,     //01 params
            razon_social,   //02 body
            documento_id,   //03 body
            telefono,       //04 body
        ]
        );

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Zona no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

module.exports = {
    obtenerTodosUsuarios,
    obtenerTodosEstudios,
    obtenerTodosPeriodos,
    obtenerAnfitrion,
    obtenerTodosContabilidades,
    obtenerTodosModulos,
    obtenerUsuario,
    crearUsuario,
    eliminarUsuario,
    actualizarUsuario
 }; 