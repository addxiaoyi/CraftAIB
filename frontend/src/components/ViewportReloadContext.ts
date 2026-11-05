import { createContext } from 'react';

export const ViewportReloadContext = createContext<(() => void) | null>(null);
