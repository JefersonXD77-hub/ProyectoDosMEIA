
const { obtenerBD } = require('./mongodb');

async function prepararIndices() {

    const db = obtenerBD();

    await db.collection('usuarios').createIndex(
        { username: 1 },
        {
            unique: true,
            name: 'username_unico'
        }
    );

    console.log('Índices de usuarios preparados');
}

module.exports = {
    prepararIndices
};
