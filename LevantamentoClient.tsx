'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseCodigo, formatPatrimonio, onlyDigits, patKey, linkDoSistema, DESCRICOES_RAPIDAS } from '@/lib/patrimonio';
import type { SistemaDados } from '@/lib/govLookup';
import { comprimirImagem } from '@/lib/imagem';
import { gerarFichaPdf } from '@/lib/gerarFichaPdf';
import { enviarFotoParaStorage } from '@/lib/supabaseStorage';

interface RegistroExistente {
  id: string;
  local: string;
  criado_por_nome: string | null;
  criado_em: string;
  descricao: string | null;
}

export default function LevantamentoClient({
  salasIniciais,
  nomeUsuario
}: {
  salasIniciais: string[];
  nomeUsuario: string;
}) {
  const supabase = createClient();

  const [salas, setSalas] = useState<string[]>(salasIniciais);
  const [escaneando, setEscaneando] = useState(false);
  const [patrimonio, setPatrimonio] = useState('');
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(salasIniciais[0] || '');
  const [novaSala, setNovaSala] = useState('');
  const [mostrarNovaSala, setMostrarNovaSala] = useState(false);
  const [tipoCodigo, setTipoCodigo] = useState('Manual');
  const [buscando, setBuscando] = useState(false);
  const [dadosGoverno, setDadosGoverno] = useState<SistemaDados | null>(null);
  const [erroGoverno, setErroGoverno] = useState('');
  const [fotoTombo, setFotoTombo] = useState<File | null>(null);
  const [fotoTomboPreview, setFotoTomboPreview] = useState('');
  const [fotosItem, setFotosItem] = useState<File[]>([]);
  const [fotosItemPreview, setFotosItemPreview] = useState<string[]>([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [lendoEtiqueta, setLendoEtiqueta] = useState(false);
  const [mensagemLeitura, setMensagemLeitura] = useState('');
  const [identificandoItem, setIdentificandoItem] = useState(false);
  const [mensagemIdentificacao, setMensagemIdentificacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [duplicado, setDuplicado] = useState<RegistroExistente | null>(null);
  const [verificandoDuplicado, setVerificandoDuplicado] = useState(false);
  const [permitirDuplicado, setPermitirDuplicado] = useState(false);
  const [ultimoPdf, setUltimoPdf] = useState<{ blob: Blob; nomeArquivo: string } | null>(null);
  const [verDadosCompletos, setVerDadosCompletos] = useState(false);

  const scannerRef = useRef<any>(null);
  const readerId = 'reader';

  useEffect(() => {
    return () => {
      pararCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciarCamera() {
    setMensagem(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const instancia = new Html5Qrcode(readerId);
      scannerRef.current = instancia;
      setEscaneando(true);
      await instancia.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 180 } },
        (decodedText: string, result: any) => {
          const formatName = result?.result?.format?.formatName || 'QR_CODE';
          aplicarCodigoLido(decodedText, formatName);
          pararCamera();
        },
        () => {
          /* ignora frames sem leitura */
        }
      );
    } catch (e) {
      setEscaneando(false);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível abrir a câmera. Você pode digitar o número manualmente.' });
    }
  }

  async function pararCamera() {
    const instancia = scannerRef.current;
    if (instancia) {
      try {
        await instancia.stop();
        instancia.clear();
      } catch {
        /* já parado */
      }
      scannerRef.current = null;
    }
    setEscaneando(false);
  }

  function aplicarCodigoLido(raw: string, formatName: string) {
    const parsed = parseCodigo(raw, formatName);
    setTipoCodigo(parsed.tipo);
    if (parsed.patrimonio) setPatrimonio(parsed.patrimonio);
    if (parsed.descricaoSugerida && !descricao) setDescricao(parsed.descricaoSugerida);
    const numero = parsed.patrimonio || onlyDigits(raw);
    if (numero) {
      buscarNoGoverno(numero);
      checarDuplicado(numero);
    }
  }

  function onPatrimonioChange(v: string) {
    setPatrimonio(formatPatrimonio(v));
    setDuplicado(null);
    setPermitirDuplicado(false);
  }

  async function checarDuplicado(numeroOverride?: string) {
    const numero = numeroOverride || patrimonio;
    if (!numero) return null;
    setVerificandoDuplicado(true);
    const { data } = await supabase
      .from('patrimonio_registros')
      .select('id, local, criado_por_nome, criado_em, descricao')
      .eq('patrimonio_key', patKey(numero))
      .maybeSingle();
    setVerificandoDuplicado(false);
    setDuplicado(data || null);
    return data || null;
  }

  async function atualizarExistente() {
    if (!duplicado) return;
    setSalvando(true);
    setMensagem(null);
    setUltimoPdf(null);
    try {
      const atualizacoes: Record<string, any> = {
        local,
        descricao: descricao || duplicado.descricao,
        criado_por_nome: nomeUsuario,
        atualizado_em: new Date().toISOString(),
        departamento_governo: dadosGoverno?.departamento || null
      };

      let pdfBlob: Blob | null = null;
      if (fotoTombo || fotosItem.length) {
        const resultado = await enviarFotosEGerarFicha();
        if (resultado.fotoTomboUrl) atualizacoes.foto_tombo_url = resultado.fotoTomboUrl;
        if (resultado.fotoItemUrl) atualizacoes.foto_item_url = resultado.fotoItemUrl;
        pdfBlob = resultado.pdfBlob;
      }

      const { error } = await supabase.from('patrimonio_registros').update(atualizacoes).eq('id', duplicado.id);
      if (error) throw error;

      if (pdfBlob) {
        setUltimoPdf({ blob: pdfBlob, nomeArquivo: `${patKey(patrimonio)} - ${descricao || 'item'}.pdf` });
      }

      setMensagem({ tipo: 'ok', texto: `Registro do patrimônio ${patrimonio} atualizado!` });
      limparFormulario();
      setDuplicado(null);
      setPermitirDuplicado(false);
    } catch (e: any) {
      setEnviandoFotos(false);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível atualizar. ' + (e?.message || '') });
    } finally {
      setSalvando(false);
      setEnviandoFotos(false);
    }
  }

  async function buscarNoGoverno(numeroOverride?: string) {
    const numero = numeroOverride || patrimonio;
    if (!numero) {
      setErroGoverno('Digite ou escaneie o número do patrimônio primeiro.');
      return;
    }
    setBuscando(true);
    setErroGoverno('');
    setDadosGoverno(null);
    try {
      const link = linkDoSistema(numero);
      const resp = await fetch(`/api/gov-lookup?url=${encodeURIComponent(link)}`);
      const json = await resp.json();
      if (json.error) {
        setErroGoverno(json.detail || 'Não encontramos esse patrimônio no sistema do governo.');
      } else {
        setDadosGoverno(json.data);
        if (json.data?.descricao && !descricao) setDescricao(json.data.descricao);
      }
    } catch {
      setErroGoverno('Falha ao buscar os dados do governo. Verifique sua internet.');
    } finally {
      setBuscando(false);
    }
  }

  function onFotoTomboSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setFotoTombo(arquivo);
    setFotoTomboPreview(URL.createObjectURL(arquivo));
    // Se a etiqueta não tem QR Code/código de barras (placas antigas, por
    // exemplo), tenta ler o número impresso automaticamente na foto.
    if (!patrimonio) lerNumeroDaEtiqueta(arquivo);
  }

  /** Lê o número de patrimônio direto da foto da etiqueta, usando
   *  reconhecimento de texto (OCR) no navegador — útil pra placas antigas
   *  sem QR Code, que só têm o número impresso/gravado. */
  async function lerNumeroDaEtiqueta(arquivo: File) {
    setLendoEtiqueta(true);
    setMensagemLeitura('Lendo o número da etiqueta…');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const {
        data: { text }
      } = await worker.recognize(arquivo);
      await worker.terminate();

      const parsed = parseCodigo((text || '').replace(/\s+/g, ''), 'OCR');
      if (parsed.patrimonio) {
        setTipoCodigo('Foto (leitura automática)');
        setPatrimonio(parsed.patrimonio);
        setMensagemLeitura(`Número lido automaticamente: ${parsed.patrimonio}. Confira se está certo antes de salvar.`);
        buscarNoGoverno(parsed.patrimonio);
        checarDuplicado(parsed.patrimonio);
      } else {
        setMensagemLeitura('Não conseguimos ler o número automaticamente nessa foto. Digite o número manualmente abaixo.');
      }
    } catch {
      setMensagemLeitura('Não foi possível ler a etiqueta automaticamente. Digite o número manualmente.');
    } finally {
      setLendoEtiqueta(false);
    }
  }

  function onFotoItemSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    const eraPrimeiraFoto = fotosItem.length === 0;
    setFotosItem((prev) => [...prev, arquivo]);
    setFotosItemPreview((prev) => [...prev, URL.createObjectURL(arquivo)]);
    // limpa o input pra poder escolher/tirar outra foto em seguida
    e.target.value = '';
    // Na primeira foto do item, tenta identificar automaticamente o que é
    // (tipo "Mesa de escritório"), igual você faz procurando no Google —
    // só sugere se ainda não tiver descrição digitada.
    if (eraPrimeiraFoto && !descricao) identificarItemPelaFoto(arquivo);
  }

  /** Manda a foto do item pra uma IA de visão identificar o tipo do
   *  objeto (mesa, cadeira, ventilador etc.) e preenche a Descrição
   *  automaticamente. Se não conseguir (sem chave configurada, sem
   *  internet, foto ruim etc.), simplesmente não sugere nada — nunca
   *  trava o cadastro nem esconde o campo pra digitar manualmente. */
  async function identificarItemPelaFoto(arquivo: File) {
    setIdentificandoItem(true);
    setMensagemIdentificacao('Identificando o item na foto…');
    try {
      const comprimida = await comprimirImagem(arquivo, 900, 0.75);
      const form = new FormData();
      form.append('arquivo', comprimida, 'item.jpg');
      const resp = await fetch('/api/identificar-item', { method: 'POST', body: form });
      const json = await resp.json();
      if (resp.ok && json.descricaoSugerida) {
        setDescricao((atual) => atual || json.descricaoSugerida);
        setMensagemIdentificacao(`Sugestão automática pela foto: "${json.descricaoSugerida}". Confira e ajuste se precisar.`);
      } else {
        setMensagemIdentificacao('');
      }
    } catch {
      setMensagemIdentificacao('');
    } finally {
      setIdentificandoItem(false);
    }
  }

  function removerFotoItem(indice: number) {
    setFotosItem((prev) => prev.filter((_, i) => i !== indice));
    setFotosItemPreview((prev) => prev.filter((_, i) => i !== indice));
  }

  /** Sobe as fotos (tombo + primeira foto do item) pro Storage do
   *  Supabase — rápido e sem depender de nenhuma credencial externa — e
   *  monta a ficha em PDF inteiramente no navegador (sem subir a lugar
   *  nenhum). O PDF fica só na memória, pronto pra baixar ou compartilhar
   *  no WhatsApp; quem quiser levar pro Google Drive faz isso manualmente
   *  depois, baixando o arquivo. Nada aqui trava o cadastro: se a ficha em
   *  PDF falhar por algum motivo, o registro é salvo do mesmo jeito. */
  async function enviarFotosEGerarFicha(): Promise<{
    fotoTomboUrl: string | null;
    fotoItemUrl: string | null;
    pdfBlob: Blob | null;
  }> {
    setEnviandoFotos(true);
    try {
      const fotosComprimidas = await Promise.all(fotosItem.map((f) => comprimirImagem(f)));
      const fotoTomboComprimida = fotoTombo ? await comprimirImagem(fotoTombo) : null;

      let fotoTomboUrl: string | null = null;
      let fotoItemUrl: string | null = null;

      if (fotoTomboComprimida) {
        fotoTomboUrl = await enviarFotoParaStorage(supabase, fotoTomboComprimida, `${patKey(patrimonio)}-tombo`);
      }
      if (fotosComprimidas[0]) {
        fotoItemUrl = await enviarFotoParaStorage(supabase, fotosComprimidas[0], `${patKey(patrimonio)}-item`);
      }

      let pdfBlob: Blob | null = null;
      try {
        pdfBlob = await gerarFichaPdf(fotosComprimidas, fotoTomboComprimida, {
          patrimonio,
          descricao,
          local,
          tipoCodigo,
          criadoPor: nomeUsuario,
          linkSistema: linkDoSistema(patrimonio),
          dadosGoverno
        });
      } catch {
        pdfBlob = null; // ficha em PDF é só um extra — nunca impede o cadastro
      }

      return { fotoTomboUrl, fotoItemUrl, pdfBlob };
    } finally {
      setEnviandoFotos(false);
    }
  }

  /** Baixa a ficha em PDF direto no celular/computador — pra depois, se
   *  quiser, arrastar pro Google Drive manualmente. */
  function baixarFichaPdf() {
    if (!ultimoPdf) return;
    const url = URL.createObjectURL(ultimoPdf.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ultimoPdf.nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Abre o compartilhamento do celular (WhatsApp aparece como opção,
   *  inclusive pra grupos) com a ficha em PDF anexada. Não existe um
   *  jeito de mandar direto pra um grupo específico sem interação —
   *  isso a pessoa escolhe na hora. No computador (sem suporte a anexar
   *  arquivo por aqui), abre o WhatsApp Web com um texto avisando pra
   *  anexar o PDF baixado manualmente. */
  async function compartilharNoWhatsapp() {
    if (!ultimoPdf) return;
    const arquivo = new File([ultimoPdf.blob], ultimoPdf.nomeArquivo, { type: 'application/pdf' });
    const resumo = `Escaneia Patrimônio\nPatrimônio: ${patrimonio}\nDescrição: ${descricao || '-'}\nLocal: ${local}\nCadastrado por: ${nomeUsuario}\nFicha em anexo: ${ultimoPdf.nomeArquivo}`;

    if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [arquivo] })) {
      try {
        await (navigator as any).share({ files: [arquivo], title: 'Escaneia Patrimônio', text: resumo });
        return;
      } catch {
        /* usuário cancelou o compartilhamento — sem problema */
        return;
      }
    }

    const url = `https://wa.me/?text=${encodeURIComponent(
      resumo + '\n\n(Baixe a ficha em "Baixar ficha em PDF" e anexe manualmente aqui no WhatsApp.)'
    )}`;
    window.open(url, '_blank');
  }

  function definirLocal(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    if (!salas.includes(limpo)) {
      setSalas((prev) => [...prev, limpo].sort());
      supabase.from('patrimonio_salas').insert({ nome: limpo }).then(() => {});
    }
    setLocal(limpo);
  }

  function adicionarSala() {
    if (!novaSala.trim()) return;
    definirLocal(novaSala);
    setNovaSala('');
    setMostrarNovaSala(false);
  }

  /** O campo "Departamento" que vem do sistema do governo é onde o bem
   *  está registrado oficialmente — às vezes é exatamente onde a pessoa
   *  encontrou o item durante o levantamento. Esse botão só preenche o
   *  "Local" com esse valor, pra não precisar digitar de novo; a planilha
   *  exportada guarda os dois separados (local do levantamento e local no
   *  governo), então usar isso aqui não perde informação nenhuma. */
  function usarDepartamentoComoLocal() {
    if (!dadosGoverno?.departamento) return;
    definirLocal(dadosGoverno.departamento);
  }

  function limparFormulario() {
    setPatrimonio('');
    setDescricao('');
    setTipoCodigo('Manual');
    setDadosGoverno(null);
    setErroGoverno('');
    setFotoTombo(null);
    setFotoTomboPreview('');
    setFotosItem([]);
    setFotosItemPreview([]);
    setMensagemLeitura('');
    setMensagemIdentificacao('');
    setDuplicado(null);
    setPermitirDuplicado(false);
    setVerDadosCompletos(false);
  }

  async function salvar() {
    if (!patrimonio) {
      setMensagem({ tipo: 'erro', texto: 'Informe o número do patrimônio.' });
      return;
    }
    if (!local) {
      setMensagem({ tipo: 'erro', texto: 'Selecione o local.' });
      return;
    }
    if (!permitirDuplicado) {
      const existente = await checarDuplicado(patrimonio);
      if (existente) return; // mostra o aviso de duplicado em vez de salvar
    }
    setSalvando(true);
    setMensagem(null);
    setUltimoPdf(null);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      let fotoTomboUrl: string | null = null;
      let fotoItemUrl: string | null = null;
      let pdfBlob: Blob | null = null;
      if (fotoTombo || fotosItem.length) {
        const resultado = await enviarFotosEGerarFicha();
        fotoTomboUrl = resultado.fotoTomboUrl;
        fotoItemUrl = resultado.fotoItemUrl;
        pdfBlob = resultado.pdfBlob;
      }

      const registro = {
        tipo: tipoCodigo,
        patrimonio,
        patrimonio_key: patKey(patrimonio),
        descricao,
        local,
        link: linkDoSistema(patrimonio),
        dispositivo: 'Site (Escaneia Patrimônio)',
        foto_tombo_url: fotoTomboUrl,
        foto_item_url: fotoItemUrl,
        departamento_governo: dadosGoverno?.departamento || null,
        user_id: user?.id || null,
        criado_por_nome: nomeUsuario
      };

      const { error } = await supabase.from('patrimonio_registros').insert(registro);
      if (error) throw error;

      if (pdfBlob) {
        setUltimoPdf({ blob: pdfBlob, nomeArquivo: `${patKey(patrimonio)} - ${descricao || 'item'}.pdf` });
      }

      setMensagem({ tipo: 'ok', texto: `Patrimônio ${patrimonio} salvo com sucesso!` });
      limparFormulario();
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível salvar. ' + (e?.message || '') });
    } finally {
      setSalvando(false);
      setEnviandoFotos(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-16">
      <div>
        <h1 className="font-display font-bold text-2xl">Levantamento de bens</h1>
        <p className="text-sm text-muted mt-1">Escaneie o código do bem ou digite o número do patrimônio.</p>
      </div>

      {mensagem && (
        <div
          className={`rounded-md2 px-4 py-3 text-sm font-semibold flex items-center justify-between gap-3 flex-wrap ${
            mensagem.tipo === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'
          }`}
        >
          <span>{mensagem.texto}</span>
          {mensagem.tipo === 'ok' && ultimoPdf && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={baixarFichaPdf}
                className="rounded-full border border-ok text-ok font-semibold px-4 py-1.5 text-xs whitespace-nowrap"
              >
                Baixar ficha em PDF
              </button>
              <button
                onClick={compartilharNoWhatsapp}
                className="rounded-full bg-ok text-white font-semibold px-4 py-1.5 text-xs whitespace-nowrap"
              >
                Compartilhar ficha no WhatsApp
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-surface rounded-lg2 border border-border p-5">
        <h2 className="font-display font-bold text-base mb-3">1. Código do bem</h2>

        {escaneando ? (
          <div className="flex flex-col gap-3">
            <div id={readerId} className="w-full rounded-md2 overflow-hidden bg-black aspect-video" />
            <button
              onClick={pararCamera}
              className="w-full rounded-full border border-border py-2.5 text-sm font-semibold hover:bg-surface-2"
            >
              Cancelar câmera
            </button>
          </div>
        ) : (
          <button
            onClick={iniciarCamera}
            className="w-full rounded-full bg-accent text-white font-semibold py-2.5 text-sm mb-3"
          >
            Abrir câmera e escanear
          </button>
        )}

        <div className="mt-3">
          <label className="text-xs font-semibold text-muted">Número do patrimônio</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              inputMode="numeric"
              value={patrimonio}
              onChange={(e) => onPatrimonioChange(e.target.value)}
              onBlur={() => patrimonio && checarDuplicado(patrimonio)}
              placeholder="000.000.000"
              className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent font-mono"
            />
            <button
              onClick={() => buscarNoGoverno()}
              disabled={buscando}
              className="rounded-md2 border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50 whitespace-nowrap"
            >
              {buscando ? 'Buscando…' : 'Buscar dados'}
            </button>
          </div>
          {verificandoDuplicado && <p className="text-xs text-muted mt-1">Verificando se esse patrimônio já foi cadastrado…</p>}
          {erroGoverno && (
            <p className="text-xs text-danger mt-1">
              {erroGoverno} Você pode digitar tanto o tombamento atual quanto um antigo — a busca funciona com os
              dois. Se mesmo assim não encontrar, ainda dá pra salvar o item normalmente com esse número.
            </p>
          )}
        </div>
      </div>

      {duplicado && !permitirDuplicado && (
        <div className="bg-warn/10 border border-warn/30 rounded-lg2 p-5">
          <h2 className="font-display font-bold text-base text-warn mb-1">⚠ Este patrimônio já foi registrado</h2>
          <p className="text-sm text-muted mb-3">
            Cadastrado em <strong>{duplicado.local || 'local não informado'}</strong>
            {duplicado.criado_por_nome && (
              <>
                {' '}por <strong>{duplicado.criado_por_nome}</strong>
              </>
            )}{' '}
            em {formatarDataHora(duplicado.criado_em)}
            {duplicado.descricao && <> — {duplicado.descricao}</>}.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={atualizarExistente}
              disabled={salvando}
              className="rounded-full bg-accent text-white font-semibold px-4 py-2 text-sm disabled:opacity-50"
            >
              {salvando ? 'Atualizando…' : 'Atualizar registro existente'}
            </button>
            <button
              onClick={() => setPermitirDuplicado(true)}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              Cadastrar mesmo assim como novo
            </button>
          </div>
        </div>
      )}

      {dadosGoverno && (dadosGoverno.tombamentoAntigo || (dadosGoverno.disponivelBaixa && /sim/i.test(dadosGoverno.disponivelBaixa))) && (
        <div className="flex flex-col gap-2">
          {dadosGoverno.tombamentoAntigo && (
            <p className="text-xs bg-surface-2 rounded-md2 px-3 py-2">
              ℹ Este bem tem um tombamento antigo associado: <strong>{dadosGoverno.tombamentoAntigo}</strong>.
              {dadosGoverno.tombamento && <> O tombamento atual é <strong>{dadosGoverno.tombamento}</strong>.</>}
            </p>
          )}
          {dadosGoverno.disponivelBaixa && /sim/i.test(dadosGoverno.disponivelBaixa) && (
            <p className="text-xs text-warn bg-warn/10 rounded-md2 px-3 py-2">
              ⚠ Este bem está marcado como <strong>disponível para baixa</strong> no sistema do governo — pode estar
              desativado ou obsoleto.
            </p>
          )}
        </div>
      )}

      <div className="bg-surface rounded-lg2 border border-border p-5 flex flex-col gap-3">
        <h2 className="font-display font-bold text-base">2. Detalhes</h2>

        <div>
          <label className="text-xs font-semibold text-muted">Descrição</label>
          <div className="flex flex-wrap gap-2 mt-1 mb-2">
            {DESCRICOES_RAPIDAS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDescricao(d)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  descricao === d ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface-2'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Cadeira giratória (ou toque em um botão acima)"
            className="w-full rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Local</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {salas.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLocal(s)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  local === s ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface-2'
                }`}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMostrarNovaSala((v) => !v)}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-2 whitespace-nowrap"
            >
              + Novo local
            </button>
          </div>
          {salas.length === 0 && !mostrarNovaSala && (
            <p className="text-xs text-muted mt-1">Nenhum local cadastrado ainda — toque em "+ Novo local".</p>
          )}
          {mostrarNovaSala && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={novaSala}
                onChange={(e) => setNovaSala(e.target.value)}
                placeholder="Nome do novo local"
                className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                autoFocus
              />
              <button
                onClick={adicionarSala}
                className="rounded-md2 bg-accent text-white px-3 py-2 text-sm font-semibold whitespace-nowrap"
              >
                Adicionar
              </button>
              <button
                onClick={() => setMostrarNovaSala(false)}
                className="rounded-md2 border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2"
              >
                Cancelar
              </button>
            </div>
          )}
          {dadosGoverno?.departamento && dadosGoverno.departamento.trim().toLowerCase() !== local.trim().toLowerCase() && (
            <button
              onClick={usarDepartamentoComoLocal}
              className="mt-1 text-xs font-semibold text-accent-strong hover:underline"
            >
              Usar "{dadosGoverno.departamento}" (do e-Estado) como local →
            </button>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Fotos (opcional, mas recomendado)</label>
          <p className="text-xs text-muted mt-0.5 mb-2">
            Tire uma foto da etiqueta do tombamento e uma ou mais fotos do bem inteiro. Ao salvar, as fotos ficam
            guardadas no sistema (e já entram na planilha exportada em Relatórios) e uma ficha em PDF é gerada na
            hora — você pode baixar ou compartilhar no WhatsApp logo depois de salvar, e passar pro Google Drive
            quando quiser.
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {fotoTomboPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoTomboPreview} alt="Prévia da etiqueta" className="w-16 h-16 rounded-md2 object-cover border border-border" />
              )}
              <label className="rounded-md2 border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 cursor-pointer">
                {fotoTomboPreview ? 'Trocar foto do tombo' : 'Foto do tombo (etiqueta)'}
                <input type="file" accept="image/*" capture="environment" onChange={onFotoTomboSelecionada} className="hidden" />
              </label>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                {fotosItemPreview.map((src, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Foto do item ${i + 1}`} className="w-16 h-16 rounded-md2 object-cover border border-border" />
                    <button
                      onClick={() => removerFotoItem(i)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center"
                      aria-label="Remover foto"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <label className="rounded-md2 border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 cursor-pointer">
                  {fotosItemPreview.length ? '+ Outra foto do item' : 'Foto do item (o bem inteiro)'}
                  <input type="file" accept="image/*" capture="environment" onChange={onFotoItemSelecionada} className="hidden" />
                </label>
              </div>
            </div>
          </div>
          {(lendoEtiqueta || mensagemLeitura) && (
            <p className={`text-xs mt-2 ${lendoEtiqueta ? 'text-muted' : 'text-accent-strong'}`}>{mensagemLeitura}</p>
          )}
          {(identificandoItem || mensagemIdentificacao) && (
            <p className={`text-xs mt-2 ${identificandoItem ? 'text-muted' : 'text-accent-strong'}`}>{mensagemIdentificacao}</p>
          )}
          {enviandoFotos && <p className="text-xs text-muted mt-2">Enviando fotos e gerando a ficha em PDF…</p>}
        </div>
      </div>

      {(!duplicado || permitirDuplicado) && (
        <button
          onClick={salvar}
          disabled={salvando}
          className="w-full rounded-full bg-accent text-white font-semibold py-3 text-sm disabled:opacity-50"
        >
          {enviandoFotos ? 'Gerando ficha em PDF…' : salvando ? 'Salvando…' : 'Salvar item'}
        </button>
      )}

      {dadosGoverno && (
        <div className="bg-surface rounded-lg2 border border-border p-5">
          <button
            onClick={() => setVerDadosCompletos((v) => !v)}
            className="w-full flex items-center justify-between text-left font-display font-bold text-sm text-muted"
          >
            <span>Dados completos encontrados no e-Estado</span>
            <span>{verDadosCompletos ? '▲' : '▼'}</span>
          </button>
          {verDadosCompletos && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-3">
                {Object.entries(dadosGoverno)
                  .filter(([k]) => k !== 'descricao')
                  .map(([k, v]) => (
                    <div key={k} className="col-span-2 sm:col-span-1">
                      <dt className="text-xs text-muted uppercase tracking-wide">{rotuloCampo(k)}</dt>
                      <dd className="font-semibold break-words">{String(v)}</dd>
                    </div>
                  ))}
              </dl>
              {dadosGoverno.departamento && (
                <p className="text-xs text-muted mt-3">
                  "Departamento" é onde esse bem está registrado no sistema do governo — pode ser diferente de onde
                  você encontrou o item agora. O "Local" lá em cima é sempre o que vale pro levantamento; os dois
                  ficam guardados separados na planilha.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatarDataHora(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function rotuloCampo(k: string): string {
  const mapa: Record<string, string> = {
    tombamento: 'Tombamento',
    tombamentoAntigo: 'Tombamento antigo',
    lote: 'Lote',
    tipo: 'Tipo',
    classificacao: 'Classificação',
    estadoConservacao: 'Estado de conservação',
    disponivelBaixa: 'Disponível para baixa',
    unidade: 'Unidade',
    departamento: 'Departamento',
    responsavel: 'Responsável',
    formaIngresso: 'Forma de ingresso',
    dataEntrada: 'Data de entrada',
    valorAquisicao: 'Valor de aquisição',
    valorResidual: 'Valor residual',
    vidaUtil: 'Vida útil',
    categoria: 'Categoria'
  };
  return mapa[k] || k;
}
