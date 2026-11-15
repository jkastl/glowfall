import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { countVisit } from './stats';
import { App } from './ui/App';
import { Solo } from './ui/Solo';

const solo = new URLSearchParams(location.search).has('solo');

createRoot(document.getElementById('root')!).render(<StrictMode>{solo ? <Solo /> : <App />}</StrictMode>);

countVisit();
