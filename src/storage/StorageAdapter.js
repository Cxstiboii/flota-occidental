/**
 * Interfaz base de almacenamiento.
 * Para migrar a MongoDB, extiende esta clase e implementa los mismos métodos.
 */
class StorageAdapter {
  async get(userId) { throw new Error('get() no implementado'); }
  async set(userId, data) { throw new Error('set() no implementado'); }
  async getAll() { throw new Error('getAll() no implementado'); }
  async delete(userId) { throw new Error('delete() no implementado'); }
}

module.exports = StorageAdapter;
