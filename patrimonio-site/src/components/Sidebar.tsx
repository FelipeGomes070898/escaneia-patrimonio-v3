'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const ITENS = [
  { href: '/dashboard', label: 'Início', icon: IconHome },
  { href: '/levantamento', label: 'Levantamento de bens', icon: IconCamera },
  { href: '/relatorios', label: 'Relatórios', icon: IconChart },
  { href: '/usuarios', label: 'Usuários', icon: IconUsers },
  { href: '/configuracoes', label: 'Configurações', icon: IconGear }
];

const NOME_PAPEL: Record<string, string> = {
  gestor: 'Gestor',
  recrutador: 'Recrutador',
  colaborador: 'Colaborador'
};

export default function Sidebar({ nome, email, role }: { nome: string; email: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const conteudoNav = (
    <>
      <div className="flex items-center gap-3 px-1 mb-6">
        <div className="w-9 h-9 shrink-0 rounded-md bg-accent flex items-center justify-center text-white font-bold">
          EP
        </div>
        <div className="min-w-0">
          <p className="font-display font-bold text-sm leading-tight truncate">Escaneia Patrimônio</p>
          <p className="text-[11px] text-muted uppercase tracking-wide">Estado de Rondônia</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {ITENS.map((item) => {
          const ativo = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setAberto(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md2 text-sm font-semibold transition-colors ${
                ativo ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-surface-2'
              }`}
            >
              <Icon />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border pt-3 mt-3">
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="w-8 h-8 shrink-0 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-bold text-muted">
            {nome ? nome.charAt(0).toUpperCase() : '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{nome || 'Usuário'}</p>
            <p className="text-xs text-muted truncate">{email}</p>
            <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-accent-strong bg-accent-soft px-1.5 py-0.5 rounded">
              {NOME_PAPEL[role] || role}
            </span>
          </div>
        </div>
        <button
          onClick={sair}
          disabled={saindo}
          className="w-full text-left px-3 py-2 rounded-md2 text-sm font-semibold text-danger hover:bg-surface-2 disabled:opacity-50"
        >
          {saindo ? 'Saindo…' : 'Sair'}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Barra superior mobile */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-border sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-white font-bold text-sm">
            EP
          </div>
          <span className="font-display font-bold text-sm">Escaneia Patrimônio</span>
        </div>
        <button
          onClick={() => setAberto(true)}
          className="p-2 rounded-md2 hover:bg-surface-2"
          aria-label="Abrir menu"
        >
          <IconMenu />
        </button>
      </div>

      {/* Menu mobile (drawer) */}
      {aberto && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-surface border-l border-border p-4 flex flex-col">
            <button
              onClick={() => setAberto(false)}
              className="self-end p-2 mb-2 rounded-md2 hover:bg-surface-2"
              aria-label="Fechar menu"
            >
              <IconClose />
            </button>
            {conteudoNav}
          </div>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-border bg-surface p-4">
        {conteudoNav}
      </aside>
    </>
  );
}

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCamera() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <circle cx="17.5" cy="9" r="2.3" />
      <path d="M15.5 14.2c2.7.4 4.5 2.6 4.5 5.8" strokeLinecap="round" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.4-2-3.4-2.3.8a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.4a7.5 7.5 0 0 0-1.7 1l-2.3-.8-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.4 2 3.4 2.3-.8a7.5 7.5 0 0 0 1.7 1l.4 2.6h4l.4-2.4a7.5 7.5 0 0 0 1.7-1l2.3.8 2-3.4-2-1.6Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}
