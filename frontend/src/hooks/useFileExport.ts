import { useCallback, useRef, useState } from 'react';

export function useFileExport() {
  const runningRef = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const save = useCallback(async (write: () => void | Promise<void>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsExporting(true);
    setExportError(null);
    try {
      await write();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The file could not be exported. Please try again.');
    } finally {
      runningRef.current = false;
      setIsExporting(false);
    }
  }, []);

  return { isExporting, exportError, save };
}
