'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Receipt, RefreshCw, RotateCcw } from 'lucide-react';
import { clearAllFlujoCajaCache } from '@/lib/flujoCajaCache';

export default function FlujoCajaSubNav() {
  const pathname = usePathname();
  const [clearing, setClearing] = useState(false);

  const navItems = [
    {
      label: 'Panel General',
      mobileLabel: 'Dashboard',
      href: '/flujo-caja',
      icon: LayoutDashboard,
    },
    {
      label: 'Facturas & Cartera',
      mobileLabel: 'Facturas',
      href: '/flujo-caja/facturas',
      icon: Receipt,
    },
    {
      label: 'Sincronización SIIGO',
      mobileLabel: 'SIIGO',
      href: '/flujo-caja/importar',
      icon: RefreshCw,
    },
  ];

  function handleClearCache() {
    setClearing(true);
    clearAllFlujoCajaCache();
    setTimeout(() => {
      window.location.reload();
    }, 300);
  }

  return (
    <div className="w-full bg-card border-b border-border shadow-sm mb-4 sm:mb-6">
      <div className="container mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[52px] py-1.5 gap-2">
          {/* Tag de Marca */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-secondary/20">
              Pospin
            </span>
            <span className="text-xs sm:text-sm font-semibold text-foreground hidden md:inline">
              Flujo de Caja
            </span>
          </div>

          {/* Links de Navegación y Botón de Limpiar Caché */}
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-1 w-full justify-end">
            <nav className="flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/flujo-caja'
                    ? pathname === '/flujo-caja'
                    : Boolean(pathname?.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap min-h-[38px] ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isActive ? 'text-secondary-foreground' : 'text-primary'}`} />
                    <span className="hidden sm:inline">{item.label}</span>
                    <span className="inline sm:hidden">{item.mobileLabel}</span>
                  </Link>
                );
              })}
            </nav>

            <button
              onClick={handleClearCache}
              disabled={clearing}
              title="Borrar caché de sesión y forzar recarga desde la base de datos"
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-lg transition-all duration-200 shrink-0 ml-1 border border-border/50"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-secondary ${clearing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Refrescar Caché</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
