// Which ACCOUNT's display profile the look cards edit (LookCards.jsx): null = the signed-in person's own view; a string
// names another account (the ops room's big screen). `api` is the client surface's own read/write pair; absent for ops.
import { createContext } from 'react';
export const DeviceCtx = createContext({ deviceId: null, device: null, api: null });
