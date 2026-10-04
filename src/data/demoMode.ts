/** Whether this phone chose “Try the demo” instead of connecting to the Google Sheet. */
const DEMO_KEY = 'anavrin-use-demo'
export const demoChosen = () => { try { return localStorage.getItem(DEMO_KEY) === '1' } catch { return false } }
export const setDemoChosen = (on: boolean) => { try { if (on) localStorage.setItem(DEMO_KEY, '1'); else localStorage.removeItem(DEMO_KEY) } catch { /* blocked */ } }
/** Leave the demo and go back to the connect screen (family key / invite link). Demo data stays on the phone. */
export const exitDemo = () => { setDemoChosen(false); location.reload() }
