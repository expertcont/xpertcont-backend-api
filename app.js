const express = require('express');
const res = require('express/lib/response');
const morgan = require('morgan');
const cors = require('cors');

//microservicio admin

const usuarioRoutes = require('./src/routes/usuario.routes');
const seguridadRoutes = require('./src/routes/seguridad.routes');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors()); //comunica con otro backend

app.use(morgan('dev'));
app.use(express.json()); //para reconocer json en express, parametros POST
app.use(express.text()); //new para text ;)

app.use(usuarioRoutes);
app.use(seguridadRoutes);

app.use((err, req, res, next) => {
    return res.json({
        message: err.message
    })
})

app.listen(port);
console.log("Servidor puerto ", port);