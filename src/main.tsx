import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {applyTheme, getInitialTheme} from './services/theme';
import './index.css';

applyTheme(getInitialTheme());

createRoot(document.getElementById('root')!).render(<App />);