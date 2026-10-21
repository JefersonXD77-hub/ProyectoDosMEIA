
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const nombreBD = process.env.MONGO_DB_NAME;

const cliente = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000
});

let baseDatos;

async function conectarMongoDB() {
    await cliente.connect();

    baseDatos = cliente.db(nombreBD);

    await baseDatos.command({ ping: 1 });

    console.log(
        `MongoDB conectado: ${baseDatos.databaseName}`
    );
}

function obtenerBD() {
    if (!baseDatos) {
        throw new Error('MongoDB no está conectado');
    }

    return baseDatos;
}

module.exports = {
    conectarMongoDB,
    obtenerBD
};
