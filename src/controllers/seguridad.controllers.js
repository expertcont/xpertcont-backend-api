const pool = require('../db');

const obtenerTodosPermisosContabilidadesVista = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado} = req.params;
        let strSQL;
        //Aqui modificar para cvista de contabilidades asiganadas y por asignar
        strSQL = "SELECT mad_usuariocontabilidad.documento_id";
        strSQL = strSQL + " ,(mad_usuariocontabilidad.documento_id || ' ' || mad_usuariocontabilidad.razon_social)::varchar(200) as nombre2";
        strSQL = strSQL + " ,mad_usuariocontabilidad.razon_social as nombre";
        strSQL = strSQL + " ,mad_seguridad_contabilidad.documento_id as id_permiso";
        strSQL = strSQL + " FROM"; 
        strSQL = strSQL + " mad_usuariocontabilidad LEFT JOIN mad_seguridad_contabilidad";
        strSQL = strSQL + " ON (mad_usuariocontabilidad.documento_id = mad_seguridad_contabilidad.documento_id and";
        strSQL = strSQL + "     mad_seguridad_contabilidad.id_usuario like '" + id_usuario + "%' and";
        strSQL = strSQL + "     mad_seguridad_contabilidad.id_invitado like '" + id_invitado + "%' )";
        strSQL = strSQL + " WHERE mad_usuariocontabilidad.id_usuario like '" + id_usuario + "%'";
        strSQL = strSQL + " ORDER BY mad_usuariocontabilidad.razon_social";
        console.log(strSQL);
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTodosPermisoComandosVista = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado} = req.params;
        let strSQL;
        strSQL = "SELECT mad_menucomando.id_comando";
        strSQL = strSQL + " ,(mad_menucomando.id_comando || ' ' || mad_menucomando.nombre)::varchar(200) as nombre2";
        strSQL = strSQL + " ,rtrim(ltrim(mad_menucomando.nombre))::varchar(200) as nombre";
        strSQL = strSQL + " ,mad_menucomando.descripcion";
        strSQL = strSQL + " ,mad_seguridad_comando.id_comando as id_permiso";
        strSQL = strSQL + " FROM"; 
        strSQL = strSQL + " mad_menucomando LEFT JOIN mad_seguridad_comando";
        strSQL = strSQL + " ON (mad_menucomando.id_comando = mad_seguridad_comando.id_comando and";
        strSQL = strSQL + "     mad_seguridad_comando.id_usuario like '" + id_usuario + "%' and";
        strSQL = strSQL + "     mad_seguridad_comando.id_invitado like '" + id_invitado + "%' )";
        strSQL = strSQL + " ORDER BY mad_menucomando.id_comando";
        console.log(strSQL);
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};
const obtenerTodosPermisoComandos = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado,id_menu} = req.params;
        let strSQL;

        strSQL = "select * from (";
        strSQL = strSQL + " SELECT id_comando";
        strSQL = strSQL + " FROM mad_seguridad_comando";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " AND id_invitado = '" + id_invitado + "'";
        strSQL = strSQL + " AND id_menu like '" + id_menu + "%'";
        //strSQL = strSQL + " ORDER BY id_comando";

        //Aumentamos la invitacion al super, de manera directa, siempre y cuando lo sea
        strSQL = strSQL + " UNION ALL";

        strSQL = strSQL + " SELECT id_comando FROM mad_menucomando";
        strSQL = strSQL + " WHERE EXISTS (";
        strSQL = strSQL + "    SELECT 1";
        strSQL = strSQL + "    FROM mad_usuario";
        strSQL = strSQL + "    WHERE super = '1' AND id_usuario = '" + id_invitado + "'"; //Super ingresa como invitado total
        strSQL = strSQL + " )";
        //strSQL = strSQL + " ORDER BY id_comando";
        strSQL = strSQL + " ) as consulta";
        strSQL = strSQL + " order by consulta.id_comando";
        
        console.log(strSQL);
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};

const obtenerTodosMenu = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado} = req.params;
        let strSQL;
        strSQL = "select * from (";
        strSQL = strSQL + " SELECT id_menu FROM mad_seguridad_comando";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND id_invitado = $2";
        strSQL = strSQL + " GROUP BY id_menu";
        //strSQL = strSQL + " ORDER BY id_menu";
        
        //Aumentamos la invitacion al super, de manera directa, siempre y cuando lo sea
        strSQL = strSQL + " UNION ALL";

        strSQL = strSQL + " SELECT id_menu FROM mad_menucomando";
        strSQL = strSQL + " WHERE EXISTS (";
        strSQL = strSQL + "    SELECT 1";
        strSQL = strSQL + "    FROM mad_usuario";
        strSQL = strSQL + "    WHERE super = '1' AND id_usuario = $2"; //Super ingresa como invitado total
        strSQL = strSQL + " )";
        strSQL = strSQL + " GROUP BY id_menu";
        //strSQL = strSQL + " ORDER BY id_menu";
        strSQL = strSQL + " ) as consulta";
        strSQL = strSQL + " order by consulta.id_menu";

        const todosReg = await pool.query(strSQL,[id_usuario,id_invitado]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }

};
const obtenerTodosEmail = async (req,res,next)=> {
    try {
        const {id_usuario} = req.params;
        let strSQL;
        strSQL = "SELECT id_invitado";
        strSQL = strSQL + " FROM"; 
        strSQL = strSQL + " mad_seguridad_comando";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " GROUP BY id_invitado";
        strSQL = strSQL + " ORDER BY id_invitado";
    
        const todosReg = await pool.query(strSQL,[id_usuario]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};

const clonarPermisoComando = async (req,res,next)=> {
    const {
        id_anfitrion,     //01 nuevo 
        id_usuario2,     //02 nuevo 
        id_usuario     //03 existente
    } = req.body

    try {
        let strSQL;
        var result;
        var result2;

        
        strSQL = "DELETE FROM mad_seguridad_comando ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND id_invitado = $2";
        //console.log(strSQL,[id_anfitrion,id_usuario2]);
        result = await pool.query(strSQL,[id_anfitrion,id_usuario2]);
        
        strSQL = "INSERT INTO mad_seguridad_comando (id_usuario, id_invitado, id_menu, id_comando)";
        strSQL = strSQL + " SELECT $1, $2, id_menu, id_comando";
        strSQL = strSQL + " FROM mad_seguridad_comando";
        strSQL = strSQL + " WHERE id_usuario = $1 ";
        strSQL = strSQL + " AND id_invitado = $3 ";
        strSQL = strSQL + " RETURNING *";
        //console.log(strSQL,[id_anfitrion,id_usuario2,id_usuario]);        
        result2 = await pool.query(strSQL, 
        [   
            id_anfitrion,     //01
            id_usuario2,     //02
            id_usuario     //03   
        ]
        );
        
        res.json(result2.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log(error);        
        next(error)
        
    }
};

const registrarPermisoComando = async (req,res,next)=> {
    const {
        id_usuario,     //01
        id_invitado,    //02    
        id_menu,        //03    
        id_comando      //04
    } = req.body

    try {
        const result = await pool.query("INSERT INTO mad_seguridad_comando VALUES ($1,$2,$3,$4) RETURNING *", 
        [   
            id_usuario,     //01
            id_invitado,   //02    
            id_menu,        //03    
            id_comando      //04
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};
const registrarPermisoContabilidad = async (req,res,next)=> {
    const {
        id_usuario,     //01
        id_invitado,    //02    
        documento_id    //03
    } = req.body

    try {
        const result = await pool.query("INSERT INTO mad_seguridad_contabilidad VALUES ($1,$2,$3) RETURNING *", 
        [   
            id_usuario,     //01
            id_invitado,   //02    
            documento_id,        //03    
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const registrarUsuario = async (req,res,next)=> {
    try {
        //Esta vez usaremos solo parametros para un POST
        const {id_usuario,nombre} = req.params;
        let strSQL;

        strSQL = "SELECT id_usuario FROM mad_usuario";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        var todosReg = await pool.query(strSQL);
        if (todosReg.rows.length === 0) {
            //El correo no existe, insertar nuevo registro
            const strInsercion = 'INSERT INTO mad_usuario (id_usuario, nombre) VALUES ($1, $2) RETURNING *';
            todosReg = await pool.query(strInsercion, [id_usuario, nombre]);
            res.json(todosReg.rows[0]);
            console.log('Usuario nuevo registrado correctamente.');
        }else{
            console.log('El correo ya existe en la tabla.');
            res.json(todosReg.rows);
            //return;
        }
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarPermisoComando = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado,id_comando} = req.params;
        let strSQL;
        strSQL = "DELETE FROM mad_seguridad_comando";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND id_invitado = $2";
        strSQL = strSQL + " AND id_comando = $3";

        const result = await pool.query(strSQL,[id_usuario,id_invitado,id_comando]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Email Usuario no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};
const eliminarPermisoContabilidad = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado,documento_id} = req.params;
        let strSQL;
        strSQL = "DELETE FROM mad_seguridad_contabilidad";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND id_invitado = $2";
        strSQL = strSQL + " AND documento_id = $3";

        const result = await pool.query(strSQL,[id_usuario,id_invitado,documento_id]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Email Usuario no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const eliminarPermisoUsuario = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado} = req.params;
        let strSQL;
        strSQL = "DELETE FROM mad_seguridad_comando";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND id_invitado = $2";
        const result = await pool.query(strSQL,[id_usuario,id_invitado]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Email Usuario no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

module.exports = {
    obtenerTodosPermisosContabilidadesVista,
    obtenerTodosPermisoComandosVista,
    obtenerTodosPermisoComandos,
    obtenerTodosMenu,
    obtenerTodosEmail,
    registrarPermisoComando,
    registrarPermisoContabilidad, //new
    clonarPermisoComando, 
    registrarUsuario,
    eliminarPermisoComando,
    eliminarPermisoContabilidad, //new
    eliminarPermisoUsuario
 }; 