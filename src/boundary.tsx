// ErrorBoundary de React que reporta a Bugsink (vía @sentry/browser) y muestra un fallback sobrio
// (evita la pantalla blanca). React es peer dependency OPCIONAL: si no usas React, importa solo
// initMaintenance/reportarError de core. El error del boundary NUNCA se filtra (no es un rechazo
// de promesa): el beforeSend solo actúa sobre unhandledrejection.

import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/browser'

interface Props {
  children: ReactNode
  /** UI alternativa al romperse. Por defecto, un aviso sobrio. */
  fallback?: ReactNode
}
interface State {
  fallo: boolean
}

export class MaintenanceBoundary extends Component<Props, State> {
  state: State = { fallo: false }

  static getDerivedStateFromError(): State {
    return { fallo: true }
  }

  componentDidCatch(error: Error): void {
    try {
      Sentry.captureException(error)
    } catch {
      /* nunca romper el árbol de React por culpa del reporte */
    }
  }

  render(): ReactNode {
    if (this.state.fallo) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#888' }}>
            Algo ha fallado. Se ha avisado a mantenimiento.
          </div>
        )
      )
    }
    return this.props.children
  }
}
