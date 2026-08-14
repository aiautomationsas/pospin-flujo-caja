'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Receipt, RefreshCw } from 'lucide-react';

export default function FlujoCajaSubNav() {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Panel General',
      href: '/flujo-caja',
      icon: LayoutDashboard,
    },
    {
      label: 'Facturas & Cartera',
      href: '/flujo-caja/facturas',
      icon: Receipt,
    },
    {
      label: 'Sincronización SIIGO',
      href: '/flujo-caja/importar',
      icon: RefreshCw,
    },
  ];

  return (
    <div className="w-full bg-card border-b border-border shadow-sm mb-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 overflow-x-auto no-scrollbar gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-2.5 py-1 rounded-md border border-secondary/20">
              Módulo Pospin
            </span>
            <span className="text-sm font-semibold text-foreground hidden sm:inline">
              Gestión de Flujo de Caja
            </span>
          </div>

          <nav className="flex items-center space-x-1 sm:space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/flujo-caja'
                  ? pathname === '/flujo-caja'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-secondary-foreground' : 'text-primary'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
