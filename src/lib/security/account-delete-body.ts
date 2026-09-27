type BodyResult = { ok: true; text: string } | { ok: false; status: 400 | 408 | 413 };

/** Bound actual bytes and total upload time before any privileged auth call. */
export async function readAccountDeletionBody(request: Request): Promise<BodyResult> {
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const bytes = new Uint8Array(1024);
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { void reader.cancel().catch(() => undefined); };

  const read = async (): Promise<BodyResult> => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > bytes.length - size) {
          cancel();
          return { ok: false, status: 413 };
        }
        bytes.set(value, size);
        size += value.byteLength;
      }
      return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)) };
    } catch {
      cancel();
      return { ok: false, status: 400 };
    }
  };
  const timeout = new Promise<BodyResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, status: 408 });
      // An uncooperative producer must not delay the rejection response.
      cancel();
    }, 5000);
  });
  try {
    return await Promise.race([read(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}
