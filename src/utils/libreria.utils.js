
const devuelveCadenaNull = (value) => {
    //Obligatorio devuelve una cadena, así sea undefined o null
    if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return null;
    } else {
      return value;
    }
  };

  const devuelveCadena = (value) => {
    //Obligatorio devuelve una cadena, así sea undefined o null
    if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return '';
    } else {
      return value;
    }
  };

  const devuelveNumero = (value) => {
    //Obligatorio devuelve número o cero, así sea (undefined - cadena vacía - null)
    if (value === undefined || (typeof value === 'string' && value.trim() === '') || value === null) {
      return 0;
    } else {
      return value;
    }
  };
  
  function convertirFechaString(dateString) {
    if (!dateString) {
      return 'NULL';  // O ajusta según tus necesidades si quieres manejar fechas vacías de manera diferente
    }
  
    const [day, month, year] = dateString.split('/');
    return `${year}-${month}-${day}`;
  };

  function convertirFechaStringComplete(dateString) {
    if (dateString===null) {
      //console.log("vacio de undefined");
      return '';
    }

    if (dateString===undefined) {
      //console.log("vacio de undefined");
      return '';
    }
    // Si la fecha es una cadena vacía, representamos una fecha nula según lo que requiera tu base de datos
    if (dateString.toString().trim() === '') {
      //console.log("vacio de vacio ;)");
      return '';  // O ajusta según lo que requiera tu base de datos para representar una fecha nula
    }
  
    // Si la fecha es un número, la tratamos como una fecha en formato Excel (número de días desde 1900-01-01)
    if (typeof dateString === 'number') {
      const excelDate = new Date((dateString - 25569) * 86400000);  // Ajuste para la diferencia de días entre Excel y JavaScript
      const year = excelDate.getUTCFullYear();
      const month = excelDate.getUTCMonth() + 1;  // Los meses en JavaScript son de 0 a 11
      const day = excelDate.getUTCDate();
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    //el formato deseado (YYYY-MM-DD) ... entonces
    //procesamos la fecha en cualquier orden, (solo el mes va en el medio)
    const dateStringFormateado = formatearFecha(dateString);
    //console.log(dateString,'procesado: ',dateStringFormateado);
    return dateStringFormateado;
    //Aqui si es la cabecera(text = fecha, emision, etc), lo procesara como fecha, cuidado
  };
  function corregirTCPEN(sValor,sMoneda) {
    //Arregla tipo de cambio=1, para PEN, asi el usuario se equivoque, sistema corrige
    if (sValor===undefined) {
      //console.log("vacio de undefined");
      return '';
    }
    // Si la fecha es una cadena vacía, representamos una fecha nula según lo que requiera tu base de datos
    if (sValor.toString().trim() === '') {
      //console.log("vacio de vacio ;)");
      return '';  // O ajusta según lo que requiera tu base de datos para representar una fecha nula
    }
    if (sValor.toString().trim() === '1') {
      //console.log("sMoneda: ", sMoneda);
      if (sMoneda.trim() ==='PEN'){
        return '';  // O ajusta según lo que requiera tu base de datos para representar una fecha nula  
      }
    }
  
    return sValor;
    //Aqui si es la cabecera(text = fecha, emision, etc), lo procesara como fecha, cuidado
  };

  function formatearFecha(inputFecha) {
    // Reemplazar los guiones con barras para tener un formato consistente
    let fechaConBarras = inputFecha.replace(/-/g, '/');
  
    // Dividir la cadena de fecha en partes
    let partesFecha = fechaConBarras.split('/');
  
    // Verificar el formato original y extraer día, mes y año
    let dia, mes, anio;
    if (partesFecha[0].length === 4) {
      // Formato yyyy/mm/dd
      anio = partesFecha[0];
      mes = partesFecha[1];
      dia = partesFecha[2];
    } else {
      // Formato dd/mm/yyyy
      dia = partesFecha[0];
      mes = partesFecha[1];
      anio = partesFecha[2];
    }
  
    // Formatear la fecha y retornarla
    let fechaFormateada = `${anio}-${mes}-${dia}`;
    return fechaFormateada;
  }

  function corregirMontoNotaCredito(sValor, sCod) {
    // Convierte en negativo el sValor dependiendo si sCod === '07'
    if (sCod === undefined || sCod.toString().trim() === '') {
      return sValor;
    }
    if (sCod.toString().trim() === '07') {
      const nValorNumerico = parseFloat(sValor);
      if (!isNaN(nValorNumerico)) {
        const nValorNumericoCorregido = Math.abs(nValorNumerico) * (-1);
        return nValorNumericoCorregido.toString();
      }
    }
  
    return sValor;
  }
  
  function numeroALetras(num) {
  const unidades = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const especiales = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

  function convertirNumero(n) {
    let resultado = "";

    if (n === 0) return "cero";
    if (n === 100) return "cien";

    if (n > 100) {
      resultado += centenas[Math.floor(n / 100)] + " ";
      n = n % 100;
    }

    if (n >= 20) {
      resultado += decenas[Math.floor(n / 10)];
      if (n % 10 !== 0) resultado += " y " + unidades[n % 10];
    } else if (n >= 10) {
      resultado += especiales[n - 10];
    } else if (n > 0) {
      resultado += unidades[n];
    }

    return resultado.trim();
  }

  function seccionNumero(valor, divisor, singular, plural) {
    const cantidad = Math.floor(valor / divisor);
    const resto = valor % divisor;
    let texto = "";

    if (cantidad > 0) {
      if (cantidad === 1) texto = singular;
      else texto = convertirNumero(cantidad) + " " + plural;
    }

    return { texto, resto };
  }

  // Separar parte entera y decimal
  const partes = num.toFixed(2).split(".");
  let entero = parseInt(partes[0]);
  const decimales = partes[1];

  if (entero === 0) return `Cero con ${decimales}/100 soles`;

  let letras = "";

  // Millones
  let millones = seccionNumero(entero, 1000000, "un millón", "millones");
  if (millones.texto !== "") letras += millones.texto;
  entero = millones.resto;

  // Miles
  let miles = seccionNumero(entero, 1000, "mil", "mil");
  if (miles.texto !== "") {
    if (letras !== "") letras += " ";
    letras += miles.texto;
  }
  entero = miles.resto;

  // Centenas
  if (entero > 0) {
    if (letras !== "") letras += " ";
    letras += convertirNumero(entero);
  }

  // Capitalizar primera letra y añadir decimales
  letras = letras.charAt(0).toUpperCase() + letras.slice(1);
  letras += ` con ${decimales}/100 soles`;

  return letras;
}


module.exports = {
    devuelveCadenaNull,
    devuelveCadena,    
    devuelveNumero,
    convertirFechaString,
    convertirFechaStringComplete,
    corregirTCPEN,
    corregirMontoNotaCredito,
    formatearFecha,
    numeroALetras
  };
  