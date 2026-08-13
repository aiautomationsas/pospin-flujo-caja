import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Grupo Pospin - Flujo de Caja',
  description: 'Sistema de Control y Proyección de Flujo de Caja de Grupo Pospin S.A.S.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
