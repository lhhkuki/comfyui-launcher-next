import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export function createConfigWriter(target: string) {
  let pending: Promise<void> = Promise.resolve();
  return (value: unknown): Promise<void> => {
    const content = JSON.stringify(value, null, 2);
    const write = pending.then(async () => {
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${crypto.randomBytes(8).toString("hex")}.tmp`;
      try {
        const handle = await fs.open(temporary, "wx");
        try {
          await handle.writeFile(content, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(temporary, target);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    });
    pending = write.catch(() => undefined);
    return write;
  };
}
