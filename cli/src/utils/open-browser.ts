/**
 * Open a URL in the default browser
 */
export async function openBrowser(url: string): Promise<void> {
  try {
    const open = (await import("open")).default;
    await open(url);
  } catch {
    console.log(`  Open your browser at: ${url}`);
  }
}
