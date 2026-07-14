import { jsx as _jsx } from "react/jsx-runtime";
// ErrorBoundary de React que reporta a Bugsink (vía @sentry/browser) y muestra un fallback sobrio
// (evita la pantalla blanca). React es peer dependency OPCIONAL: si no usas React, importa solo
// initMaintenance/reportarError de core. El error del boundary NUNCA se filtra (no es un rechazo
// de promesa): el beforeSend solo actúa sobre unhandledrejection.
import { Component } from 'react';
import * as Sentry from '@sentry/browser';
export class MaintenanceBoundary extends Component {
    state = { fallo: false };
    static getDerivedStateFromError() {
        return { fallo: true };
    }
    componentDidCatch(error) {
        try {
            Sentry.captureException(error);
        }
        catch {
            /* nunca romper el árbol de React por culpa del reporte */
        }
    }
    render() {
        if (this.state.fallo) {
            return (this.props.fallback ?? (_jsx("div", { style: { padding: 24, fontFamily: 'system-ui, sans-serif', color: '#888' }, children: "Algo ha fallado. Se ha avisado a mantenimiento." })));
        }
        return this.props.children;
    }
}
