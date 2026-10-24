import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

// Без StrictMode: он дважды монтирует компоненты, а Phaser-игра должна создаваться ровно один раз.
createRoot(document.getElementById('root')!).render(<App />);
