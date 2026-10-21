
require('dotenv').config();

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function crearAdmin() {
    const password = process.env.ADMIN_PASSWORD;
    const username = process.env.ADMIN_USERNAME;

    if (!username || !password || password.length < 5) {
        throw new Error('Configura ADMIN_USERNAME y ADMIN_PASSWORD (mínimo 12 caracteres)');
    }

    const cliente = new MongoClient(process.env.MONGO_URI);

    try {
        await cliente.connect();

        const db = cliente.db(process.env.MONGO_DB_NAME);
        const usuarios = db.collection('usuarios');

        const existente = await usuarios.findOne({ username });

        if (existente) {
            console.log('El administrador ya existe');
            return;
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const resultado = await usuarios.insertOne({
            nombre: 'Administrador General',
            username,
            passwordHash,
            rol: 'ADMINISTRADOR',
            activo: true,
            fechaCreacion: new Date(),
            fechaActualizacion: new Date()
        });

        console.log('Administrador creado correctamente');
        console.log('ID:', resultado.insertedId);

    } finally {
        await cliente.close();
    }
}

crearAdmin().catch(error => {
    console.error('Error:', error.message);
    process.exitCode = 1;
});
