'use client';

import { useEffect } from 'react';

/** Registra o service worker que deixa o carregamento do site rápido em
 *  conexão fraca — depois da primeira visita, o "esqueleto" do site (o
 *  JS/CSS, que não muda a cada acesso) já vem do próprio aparelho em vez
 *  de baixar tudo de novo pela internet toda vez. Os dados de verdade
 *  (login, itens, fotos) continuam sempre vindo direto da internet. Não
 *  aparece nada na tela — só acontece por trás. */
export default function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* se não der, o site continua funcionando normal, só sem esse ganho de velocidade */
    });
  }, []);

  return null;
}
