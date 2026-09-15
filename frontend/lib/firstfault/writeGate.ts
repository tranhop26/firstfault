export type WriteGate = { current: boolean };

export async function runExclusiveWrite<T>(gate: WriteGate, operation: () => Promise<T>): Promise<T> {
  if (gate.current) throw new Error("Another Studio Next transaction is already in progress");
  gate.current = true;
  try {
    return await operation();
  } finally {
    gate.current = false;
  }
}
