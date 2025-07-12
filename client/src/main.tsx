import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register service worker for PWA functionality
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      console.log('SW registered: ', registration);
    })
    .catch((registrationError) => {
      console.log('SW registration failed: ', registrationError);
    });
}

createRoot(document.getElementById("root")!).render(<App />);
