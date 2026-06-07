import { ViteReactSSG } from "vite-react-ssg";
import { routes } from "./App.jsx";

// vite-react-ssg owns rendering: it static-generates each route to HTML at build
// time and hydrates on the client. The route table (with getStaticPaths/loader)
// lives in src/App.jsx. The BrowserRouter/StrictMode wrapper is no longer needed
// — ViteReactSSG sets up the data router (and StrictMode would double-fire the
// GA4 page_view effect in dev).
export const createRoot = ViteReactSSG({ routes });
