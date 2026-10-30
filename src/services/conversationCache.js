import { isConversationRecord } from '../models/conversationSearch.js'

export function createConversationCache({ indexedDB = globalThis.indexedDB, name = 'knowledge-accumulation-conversations' } = {}) {
  let connection, closed = false
  async function database() {
    if (closed) throw new Error('Conversation cache closed')
    if (!indexedDB) throw new Error('IndexedDB unavailable')
    connection ||= new Promise((resolve, reject) => {
      let settled = false
      const request = indexedDB.open(name, 1)
      const fail = error => { if (!settled) { settled = true; clearTimeout(timer); reject(error) } }
      const timer = setTimeout(() => fail(new Error('Conversation cache timed out')), 3000)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('trees', { keyPath: ['userId', 'id'] })
        store.createIndex('userId', 'userId')
      }
      request.onerror = () => fail(request.error)
      request.onblocked = () => fail(new Error('Conversation cache blocked'))
      request.onsuccess = () => {
        const db = request.result
        if (settled || closed) { db.close(); fail(new Error('Conversation cache closed')); return }
        settled = true
        clearTimeout(timer)
        db.onversionchange = () => db.close()
        resolve(db)
      }
    })
    return connection
  }
  async function transact(mode, operation) {
    const db = await database()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('trees', mode)
      let result
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('Conversation cache aborted'))
      const request = operation(transaction.objectStore('trees'))
      if (request) request.onsuccess = () => { result = request.result }
    })
  }
  return {
    async read(userId) {
      const records = await transact('readonly', store => store.index('userId').getAll(userId))
      return records.filter(record => record.userId === userId && isConversationRecord(record))
    },
    write: (userId, record) => { if (!userId || !isConversationRecord(record)) return Promise.reject(new Error('Invalid conversation cache record')); return transact('readwrite', store => store.put({ ...record, userId })) },
    remove: (userId, ids) => transact('readwrite', store => { for (const id of ids) store.delete([userId, id]) }),
    close: () => { closed = true; connection?.then(db => db.close()).catch(() => {}) },
  }
}
