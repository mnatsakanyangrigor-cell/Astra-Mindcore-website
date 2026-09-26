import { createRoot } from 'react-dom/client'
import './style.css'
import { Calculator } from './calculator.tsx'

const photo = document.querySelector<HTMLElement>('.device-photo')
if (photo) {
  createRoot(photo).render(<Calculator />)
}
