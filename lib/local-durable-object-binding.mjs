class LocalDurableStorage {
  #values = new Map();
  #queue = Promise.resolve();

  async get(key) {
    return structuredClone(this.#values.get(key));
  }

  async put(key, value) {
    this.#values.set(key, structuredClone(value));
  }

  transaction(operation) {
    const run = this.#queue.then(() => operation({
      get: (key) => this.get(key),
      put: (key, value) => this.put(key, value)
    }));
    this.#queue = run.then(() => undefined, () => undefined);
    return run;
  }
}

export function createLocalDurableObjectBinding(DurableObjectClass) {
  if (typeof DurableObjectClass !== "function") throw new TypeError("A Durable Object class is required.");
  const objects = new Map();

  return Object.freeze({
    idFromName(name) {
      if (typeof name !== "string" || !name) throw new TypeError("A non-empty object name is required.");
      return name;
    },
    get(id) {
      if (!objects.has(id)) objects.set(id, new DurableObjectClass({ storage: new LocalDurableStorage() }));
      const instance = objects.get(id);
      return Object.freeze({
        fetch(input, init) {
          return instance.fetch(new Request(input, init));
        }
      });
    }
  });
}
