import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './mobile-polish.css';
import { AuthProvider } from './context/AuthContext.tsx';

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
