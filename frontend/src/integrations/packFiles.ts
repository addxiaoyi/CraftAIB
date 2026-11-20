const files = new Map<string, Promise<Blob>>();

export function invalidatePackFiles(baseUrl: string): void {
  for (const url of files.keys()) if (url.startsWith(baseUrl)) files.delete(url);
}

/** Share immutable bundled files between both preview implementations. */
export async function loadPackFile(url: string): Promise<Response> {
  let pending = files.get(url);
  if (!pending) {
    pending = fetch(url, { signal: AbortSignal.timeout(30000) }).then(async (response) => {
      if (!response.ok) throw new Error(`Bundled resource ${new URL(url).pathname} could not load (${response.status}).`);
      return response.blob();
    }).catch((error) => {
      files.delete(url);
      throw error;
    });
    files.set(url, pending);
  }
  return new Response(await pending);
}
